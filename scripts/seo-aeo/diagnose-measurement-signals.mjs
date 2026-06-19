#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, envOrConfig, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { addDays, dateRangeFromArgs, today, validateIsoDate } from "./lib/dates.mjs";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function safeError(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/access_token=[^&\s]+/g, "access_token=[redacted]");
}

function windowFromRunDate(runDate, lookbackDays, lagDays = 3) {
  const endDate = addDays(runDate, -lagDays);
  const startDate = addDays(endDate, -(lookbackDays - 1));
  return { startDate, endDate };
}

function positiveInteger(value, fallback, name) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function targetRangeFromArgs(args, runDate) {
  if (arg("--date") || arg("--start") || arg("--end")) {
    return dateRangeFromArgs(args, 3);
  }
  const lagDays = positiveInteger(arg("--lag-days"), "3", "--lag-days");
  const lookbackDays = positiveInteger(arg("--lookback-days"), "7", "--lookback-days");
  return windowFromRunDate(runDate, lookbackDays, lagDays);
}

function uniqueWindows(windows) {
  const seen = new Set();
  return windows.filter((item) => {
    const key = `${item.id}:${item.startDate}:${item.endDate}:${item.data_state || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function fetchGetJson(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function diagnoseGa4(config, windows) {
  const propertyId = envOrConfig("GA4_PROPERTY_ID", config.google?.ga4PropertyId);
  if (!propertyId || String(propertyId).includes("REPLACE")) {
    return {
      configured: false,
      access_status: "missing_property_id",
      property_id: "",
      windows: [],
      error: "Set GA4_PROPERTY_ID or google.ga4PropertyId before diagnostics can query GA4.",
    };
  }

  try {
    const token = await getGoogleAccessToken(config, ["https://www.googleapis.com/auth/analytics.readonly"]);
    const metadata = await fetchGetJson(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}/metadata`,
      token
    );
    const results = [];
    for (const window of windows) {
      try {
        const data = await fetchJson(
          `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
          token,
          {
            dateRanges: [{ startDate: window.startDate, endDate: window.endDate }],
            dimensions: [{ name: "date" }],
            metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
            limit: 1000,
          }
        );
        const rows = data.rows || [];
        results.push({
          id: window.id,
          start_date: window.startDate,
          end_date: window.endDate,
          row_count: rows.length,
          total_sessions: rows.reduce((sum, row) => sum + Number(row.metricValues?.[0]?.value || 0), 0),
          total_engaged_sessions: rows.reduce((sum, row) => sum + Number(row.metricValues?.[1]?.value || 0), 0),
          status: rows.length ? "has_rows" : "zero_rows",
        });
      } catch (error) {
        results.push({
          id: window.id,
          start_date: window.startDate,
          end_date: window.endDate,
          row_count: null,
          status: "query_failed",
          error: safeError(error),
        });
      }
    }

    return {
      configured: true,
      access_status: "ok",
      property_id: propertyId,
      metadata_resource: metadata.name || "",
      windows: results,
    };
  } catch (error) {
    return {
      configured: true,
      access_status: "failed",
      property_id: propertyId,
      windows: [],
      error: safeError(error),
    };
  }
}

async function diagnoseGsc(config, finalWindows, targetRange) {
  const siteUrl = envOrConfig("GSC_SITE_URL", config.site?.searchConsoleSiteUrl);
  if (!siteUrl || String(siteUrl).includes("REPLACE")) {
    return {
      configured: false,
      access_status: "missing_site_url",
      site_url: "",
      site_permission_level: "",
      windows: [],
      error: "Set GSC_SITE_URL or site.searchConsoleSiteUrl before diagnostics can query Search Console.",
    };
  }

  try {
    const token = await getGoogleAccessToken(config, ["https://www.googleapis.com/auth/webmasters.readonly"]);
    const site = await fetchGetJson(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`,
      token
    );
    const sitesList = await fetchGetJson("https://searchconsole.googleapis.com/webmasters/v3/sites", token).catch(() => ({}));
    const windows = uniqueWindows([
      ...finalWindows.map((window) => ({ ...window, data_state: "final" })),
      {
        id: "target_all_data_state",
        startDate: targetRange.startDate,
        endDate: targetRange.endDate,
        data_state: "all",
      },
    ]);
    const results = [];
    for (const window of windows) {
      try {
        const data = await fetchJson(
          `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          token,
          {
            startDate: window.startDate,
            endDate: window.endDate,
            dimensions: ["date"],
            rowLimit: 1000,
            startRow: 0,
            dataState: window.data_state || "final",
          }
        );
        const rows = data.rows || [];
        results.push({
          id: window.id,
          start_date: window.startDate,
          end_date: window.endDate,
          data_state: window.data_state || "final",
          row_count: rows.length,
          total_clicks: rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0),
          total_impressions: rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0),
          status: rows.length ? "has_rows" : "zero_rows",
        });
      } catch (error) {
        results.push({
          id: window.id,
          start_date: window.startDate,
          end_date: window.endDate,
          data_state: window.data_state || "final",
          row_count: null,
          status: "query_failed",
          error: safeError(error),
        });
      }
    }

    return {
      configured: true,
      access_status: "ok",
      site_url: siteUrl,
      site_permission_level: site.permissionLevel || "",
      verified_site_count: Array.isArray(sitesList.siteEntry) ? sitesList.siteEntry.length : null,
      windows: results,
    };
  } catch (error) {
    return {
      configured: true,
      access_status: "failed",
      site_url: siteUrl,
      site_permission_level: "",
      windows: [],
      error: safeError(error),
    };
  }
}

function classify({ ga4, gsc }) {
  const accessFailures = [];
  if (ga4.access_status !== "ok") accessFailures.push(`ga4:${ga4.access_status}`);
  if (gsc.access_status !== "ok") accessFailures.push(`gsc:${gsc.access_status}`);
  if (accessFailures.length) {
    return {
      status: "config_risk",
      reason: `Measurement diagnostics could not verify access for ${accessFailures.join(", ")}.`,
    };
  }

  const ga4Target = ga4.windows.find((item) => item.id === "target_range");
  const gscTargetFinal = gsc.windows.find((item) => item.id === "target_range" && item.data_state === "final");
  const gscTargetAll = gsc.windows.find((item) => item.id === "target_all_data_state");
  const targetHasRows = [ga4Target, gscTargetFinal, gscTargetAll].some((item) => Number(item?.row_count || 0) > 0);
  const widerHasRows = [...ga4.windows, ...gsc.windows].some((item) => item.id !== "target_range" && Number(item.row_count || 0) > 0);
  const anyRows = targetHasRows || widerHasRows;

  if (targetHasRows) {
    return {
      status: "signal_available_in_target_window",
      reason: "At least one configured metrics-window diagnostic query returned rows.",
    };
  }
  if (Number(gscTargetAll?.row_count || 0) > 0 && Number(gscTargetFinal?.row_count || 0) === 0) {
    return {
      status: "recent_data_pending_finalization",
      reason: "Search Console all-data state has rows for the target range, but final data does not yet.",
    };
  }
  if (widerHasRows) {
    return {
      status: "needs_wider_metrics_window",
      reason: "The configured target window has zero rows, but a wider diagnostic window returned rows.",
    };
  }
  if (!anyRows) {
    return {
      status: "verified_empty_all_windows",
      reason: "GA4 and Search Console access are valid, but target and wider diagnostic windows returned zero rows.",
    };
  }
  return {
    status: "investigate",
    reason: "Diagnostics completed, but the row pattern needs review.",
  };
}

function writeMarkdown(filePath, report) {
  const ga4Lines = report.ga4.windows.length
    ? report.ga4.windows
        .map((item) => `| ${item.id} | ${item.start_date}..${item.end_date} | ${item.status} | ${item.row_count ?? ""} | ${item.total_sessions ?? ""} |`)
        .join("\n")
    : "| n/a | n/a | none |  |  |";
  const gscLines = report.gsc.windows.length
    ? report.gsc.windows
        .map(
          (item) =>
            `| ${item.id} | ${item.start_date}..${item.end_date} | ${item.data_state || "final"} | ${item.status} | ${item.row_count ?? ""} | ${item.total_impressions ?? ""} |`
        )
        .join("\n")
    : "| n/a | n/a | n/a | none |  |  |";

  const markdown = `# Measurement Diagnostics

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}

${report.reason}

## Target Range

- ${report.target_range.start_date}..${report.target_range.end_date}

## GA4

- Access: ${report.ga4.access_status}
- Property ID: ${report.ga4.property_id || ""}
- Metadata: ${report.ga4.metadata_resource || ""}
- Error: ${report.ga4.error || ""}

| Window | Date range | Status | Rows | Sessions |
|---|---|---|---:|---:|
${ga4Lines}

## Search Console

- Access: ${report.gsc.access_status}
- Site URL: ${report.gsc.site_url || ""}
- Permission: ${report.gsc.site_permission_level || ""}
- Verified sites visible: ${report.gsc.verified_site_count ?? ""}
- Error: ${report.gsc.error || ""}

| Window | Date range | Data state | Status | Rows | Impressions |
|---|---|---|---|---:|---:|
${gscLines}

## Interpretation

- This artifact verifies measurement access and row availability only.
- It does not create analytics evidence rows and must not be cited in public content.
- If status is \`verified_empty_all_windows\`, wait for traffic/data or import reviewed exports instead of creating placeholder rows.
- If status is \`needs_wider_metrics_window\`, rerun the daily controller with a wider metrics window before deciding that measurement is empty.
`;

  fs.writeFileSync(filePath, markdown);
}

async function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const runDate = validateIsoDate(arg("--run-date", today()), "--run-date");
  const config = loadConfig(root);
  const targetRange = targetRangeFromArgs(args, runDate);
  const lagDays = Number(arg("--diagnostic-lag-days", "3"));
  const windows = uniqueWindows([
    { id: "target_range", ...targetRange },
    { id: "last_7_finalized", ...windowFromRunDate(runDate, 7, lagDays) },
    { id: "last_28_finalized", ...windowFromRunDate(runDate, 28, lagDays) },
    { id: "last_90_finalized", ...windowFromRunDate(runDate, 90, lagDays) },
  ]);

  const [ga4, gsc] = await Promise.all([diagnoseGa4(config, windows), diagnoseGsc(config, windows, targetRange)]);
  const classification = classify({ ga4, gsc });
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const jsonPath = path.join(outputDir, "measurement-diagnostics.json");
  const markdownPath = path.join(outputDir, "measurement-diagnostics.md");
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: classification.status,
    reason: classification.reason,
    target_range: {
      start_date: targetRange.startDate,
      end_date: targetRange.endDate,
    },
    ga4,
    gsc,
  };

  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        status: report.status,
        reason: report.reason,
        report_json: relative(root, jsonPath),
        report_md: relative(root, markdownPath),
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});
