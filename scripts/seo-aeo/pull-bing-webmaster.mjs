#!/usr/bin/env node
import path from "node:path";
import { loadConfig, envOrConfig, requireValue } from "./lib/config.mjs";
import { readCsv, upsertRows } from "./lib/csv.mjs";
import { dateRangeFromArgs } from "./lib/dates.mjs";
import { SEARCH_QUERY_HEADERS, classifyIntent } from "./lib/search-query.mjs";

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseBingDate(value, fallbackDate) {
  const text = String(value || "").trim();
  if (!text) return fallbackDate;

  const bingMatch = text.match(/^\/Date\((-?\d+)([+-]\d{4})?\)\/$/);
  if (bingMatch) {
    const offset = bingMatch[2] || "";
    const offsetMinutes = offset
      ? Number(offset.slice(0, 3)) * 60 + Number(`${offset[0]}${offset.slice(3, 5)}`)
      : 0;
    const date = new Date(Number(bingMatch[1]) + offsetMinutes * 60_000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return fallbackDate;
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function ctr(clicks, impressions) {
  const clickCount = Number(clicks);
  const impressionCount = Number(impressions);
  if (!Number.isFinite(clickCount) || !Number.isFinite(impressionCount) || impressionCount <= 0) return "";
  return clickCount / impressionCount;
}

function normalizeRows({ rows, siteUrl, startDate, endDate, timezone }) {
  return rows
    .map((row) => {
      const date = parseBingDate(row.Date, startDate);
      const clicks = numberOrBlank(row.Clicks);
      const impressions = numberOrBlank(row.Impressions);
      const query = String(row.Query || "").trim();
      return {
        date,
        source: "bing_webmaster_tools",
        source_export_id: `bing-webmaster:GetQueryStats:${siteUrl}:${date}`,
        source_file: "bing-webmaster-api:GetQueryStats",
        property_id: siteUrl,
        timezone,
        captured_by: "scripts/seo-aeo/pull-bing-webmaster.mjs",
        reviewed_by: "",
        query,
        page_url: "",
        slug: "",
        device: "",
        country: "",
        clicks,
        impressions,
        ctr: ctr(clicks, impressions),
        avg_position: numberOrBlank(row.AvgImpressionPosition ?? row.AvgClickPosition),
        search_intent: classifyIntent(query),
        serp_features: "",
        content_action: "monitor",
        notes: "Bing Webmaster GetQueryStats returns top-query metrics without page/device/country dimensions.",
      };
    })
    .filter((row) => row.query && row.date >= startDate && row.date <= endDate);
}

async function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const dryRun = hasFlag("--dry-run");
  const config = loadConfig(root);
  const { startDate, endDate } = dateRangeFromArgs(args, 3);
  const apiKey = requireValue(
    envOrConfig("BING_WEBMASTER_API_KEY", config.bing?.webmasterApiKey),
    "Set BING_WEBMASTER_API_KEY or bing.webmasterApiKey in config/seo-aeo.config.json."
  );
  const siteUrl = requireValue(
    envOrConfig("BING_WEBMASTER_SITE_URL", config.bing?.webmasterSiteUrl),
    "Set BING_WEBMASTER_SITE_URL or bing.webmasterSiteUrl in config/seo-aeo.config.json."
  );
  const timezone = config.site?.timezone || "America/Los_Angeles";

  const endpoint = new URL("https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats");
  endpoint.searchParams.set("siteUrl", siteUrl);
  endpoint.searchParams.set("apikey", apiKey);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Bing Webmaster GetQueryStats failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const sourceRows = Array.isArray(data?.d) ? data.d : Array.isArray(data) ? data : [];
  const normalized = normalizeRows({ rows: sourceRows, siteUrl, startDate, endDate, timezone });

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
        source: "bing_webmaster_tools",
        endpoint: "GetQueryStats",
        dryRun,
        startDate,
        endDate,
        sourceRows: sourceRows.length,
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
