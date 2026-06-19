#!/usr/bin/env node
import path from "node:path";
import { loadConfig, envOrConfig, requireValue } from "./lib/config.mjs";
import { readCsv, upsertRows } from "./lib/csv.mjs";
import { dateRangeFromArgs } from "./lib/dates.mjs";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";
import { SEARCH_QUERY_HEADERS, classifyIntent, slugFromUrl } from "./lib/search-query.mjs";

function hasFlag(name) {
  return process.argv.includes(name);
}

async function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const dryRun = hasFlag("--dry-run");
  const config = loadConfig(root);
  const { startDate, endDate } = dateRangeFromArgs(args, 3);
  const siteUrl = requireValue(
    envOrConfig("GSC_SITE_URL", config.site?.searchConsoleSiteUrl),
    "Set GSC_SITE_URL or site.searchConsoleSiteUrl in config/seo-aeo.config.json."
  );
  const timezone = config.site?.timezone || "America/Los_Angeles";
  const token = await getGoogleAccessToken(config, ["https://www.googleapis.com/auth/webmasters.readonly"]);

  const requestBody = {
    startDate,
    endDate,
    dimensions: ["date", "query", "page", "device", "country"],
    rowLimit: Number(process.env.GSC_ROW_LIMIT || 25000),
    startRow: 0,
    dataState: "final",
  };

  const allRows = [];
  while (true) {
    const response = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`GSC searchAnalytics.query failed ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const rows = data.rows || [];
    allRows.push(...rows);
    if (rows.length < requestBody.rowLimit) break;
    requestBody.startRow += requestBody.rowLimit;
  }

  const normalized = allRows.map((row) => {
    const [date, query, pageUrl, device, country] = row.keys;
    return {
      date: date || startDate,
      source: "google_search_console",
      source_export_id: `gsc:${siteUrl}:${date || startDate}`,
      source_file: "search-console-api",
      property_id: siteUrl,
      timezone,
      captured_by: "scripts/seo-aeo/pull-gsc.mjs",
      reviewed_by: "",
      query,
      page_url: pageUrl,
      slug: slugFromUrl(pageUrl),
      device,
      country,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      avg_position: row.position,
      search_intent: classifyIntent(query),
      serp_features: "",
      content_action: "monitor",
      notes: "",
    };
  });

  const outputPath = path.join(root, "analytics", "search_query_daily.csv");
  const result = dryRun
    ? { path: outputPath, rowsWritten: 0, totalRows: readCsv(outputPath, SEARCH_QUERY_HEADERS).rows.length, dryRun: true }
    : upsertRows(
        outputPath,
        SEARCH_QUERY_HEADERS,
        normalized,
        ["date", "source", "query", "page_url", "device", "country"]
      );

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "gsc",
        dryRun,
        startDate,
        endDate,
        sourceRows: allRows.length,
        normalizedRows: normalized.length,
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
