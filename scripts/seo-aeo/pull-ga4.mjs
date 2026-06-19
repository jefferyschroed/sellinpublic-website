#!/usr/bin/env node
import path from "node:path";
import { loadConfig, envOrConfig, requireValue } from "./lib/config.mjs";
import { readCsv, upsertRows } from "./lib/csv.mjs";
import { dateRangeFromArgs } from "./lib/dates.mjs";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";

const PAGE_DAILY_HEADERS = [
  "date",
  "page_url",
  "slug",
  "page_type",
  "publish_date",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "ga4_sessions",
  "ga4_engaged_sessions",
  "ga4_avg_engagement_time_seconds",
  "ga4_conversions",
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr",
  "gsc_avg_position",
  "bing_clicks",
  "bing_impressions",
  "bing_ctr",
  "bing_avg_position",
  "ai_citations",
  "distribution_clicks",
  "content_health_score",
  "refresh_priority_score",
  "decision_evidence_status",
  "decision_evidence_row_count",
  "decision_evidence_date_count",
  "decision_evidence_required_date_count",
  "decision_evidence_included",
  "decision_evidence_reason",
  "notes",
];

function slugFromPath(pagePath) {
  const clean = pagePath.split("?")[0].replace(/\/+$/, "");
  const blogMatch = clean.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) return blogMatch[1];
  if (clean === "" || clean === "/") return "home";
  return clean.split("/").filter(Boolean).pop() || "home";
}

function pageTypeFromPath(pagePath) {
  if (pagePath === "/" || pagePath.startsWith("/?")) return "home";
  if (pagePath === "/blog/" || pagePath.startsWith("/blog/?")) return "blog_index";
  if (/^\/blog\/[^/]+\/?/.test(pagePath)) return "blog_post";
  return "site_page";
}

function normalizeDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function cleanPagePath(value, siteOrigin) {
  const raw = String(value || "/");
  try {
    return new URL(raw, siteOrigin).pathname || "/";
  } catch {
    return raw.split("?")[0].split("#")[0] || "/";
  }
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(6)));
}

function isGa4OwnedRow(row) {
  return (
    String(row.source_export_id || "").startsWith("ga4:") ||
    row.source_file === "google-analytics-data-api" ||
    String(row.captured_by || "").includes("pull-ga4.mjs")
  );
}

async function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const dryRun = hasFlag("--dry-run");
  const config = loadConfig(root);
  const { startDate, endDate } = dateRangeFromArgs(args, 1);
  const propertyId = requireValue(
    envOrConfig("GA4_PROPERTY_ID", config.google?.ga4PropertyId),
    "Set GA4_PROPERTY_ID or google.ga4PropertyId in config/seo-aeo.config.json."
  );
  const siteOrigin = config.site?.origin || "https://sellinpublic.co";
  const timezone = config.site?.timezone || "America/Los_Angeles";
  const token = await getGoogleAccessToken(config, ["https://www.googleapis.com/auth/analytics.readonly"]);
  const metrics = (process.env.GA4_METRICS || "sessions,engagedSessions,averageSessionDuration,keyEvents")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }, { name: "pagePathPlusQueryString" }],
      metrics: metrics.map((name) => ({ name })),
      limit: 100000,
    }),
  });

  if (!response.ok) {
    throw new Error(`GA4 runReport failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const sourceRows = data.rows || [];
  const grouped = new Map();
  for (const row of sourceRows) {
    const date = normalizeDate(row.dimensionValues[0].value);
    const pagePath = cleanPagePath(row.dimensionValues[1].value || "/", siteOrigin);
    const metricValues = Object.fromEntries(metrics.map((metric, index) => [metric, row.metricValues[index]?.value || ""]));
    const key = `${date}\u0001${pagePath}`;
    const existing =
      grouped.get(key) || {
        date,
        pagePath,
        sessions: 0,
        engagedSessions: 0,
        averageSessionDurationWeightedTotal: 0,
        averageSessionDurationWeight: 0,
        keyEvents: 0,
        conversions: 0,
      };
    const sessions = numberValue(metricValues.sessions);
    existing.sessions += sessions;
    existing.engagedSessions += numberValue(metricValues.engagedSessions);
    existing.keyEvents += numberValue(metricValues.keyEvents);
    existing.conversions += numberValue(metricValues.conversions);
    const averageDuration = numberValue(metricValues.averageSessionDuration);
    const averageWeight = sessions || 1;
    if (averageDuration > 0) {
      existing.averageSessionDurationWeightedTotal += averageDuration * averageWeight;
      existing.averageSessionDurationWeight += averageWeight;
    }
    grouped.set(key, existing);
  }

  const rows = Array.from(grouped.values()).map((row) => {
    const pageUrl = new URL(row.pagePath, siteOrigin).toString();
    const averageDuration =
      row.averageSessionDurationWeight > 0
        ? row.averageSessionDurationWeightedTotal / row.averageSessionDurationWeight
        : 0;
    return {
      date: row.date,
      page_url: pageUrl,
      slug: slugFromPath(row.pagePath),
      page_type: pageTypeFromPath(row.pagePath),
      publish_date: "",
      source_export_id: `ga4:${propertyId}:${row.date}:${row.pagePath}`,
      source_file: "google-analytics-data-api",
      property_id: propertyId,
      timezone,
      captured_by: "scripts/seo-aeo/pull-ga4.mjs",
      reviewed_by: "",
      ga4_sessions: formatMetric(row.sessions),
      ga4_engaged_sessions: formatMetric(row.engagedSessions),
      ga4_avg_engagement_time_seconds: formatMetric(averageDuration),
      ga4_conversions: formatMetric(row.keyEvents || row.conversions),
      notes: "",
    };
  });

  const outputPath = path.join(root, "analytics", "page_daily.csv");
  const result = dryRun
    ? { path: outputPath, rowsWritten: 0, totalRows: readCsv(outputPath, PAGE_DAILY_HEADERS).rows.length, dryRun: true }
    : upsertRows(outputPath, PAGE_DAILY_HEADERS, rows, ["date", "page_url"]);
  const ga4TotalRows = dryRun
    ? readCsv(outputPath, PAGE_DAILY_HEADERS).rows.filter(isGa4OwnedRow).length
    : readCsv(outputPath, PAGE_DAILY_HEADERS).rows.filter(isGa4OwnedRow).length;
  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "ga4",
        dryRun,
        startDate,
        endDate,
        sourceRows: sourceRows.length,
        normalizedRows: rows.length,
        ga4TotalRows,
        ...result,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
