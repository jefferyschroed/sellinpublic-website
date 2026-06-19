#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJsonIfExists, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, upsertRows } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";
import { slugFromPageUrl } from "./lib/scoring.mjs";

const TABLES = {
  page_daily: {
    inputDir: "imports/analytics",
    output: "analytics/page_daily.csv",
    keys: ["date", "page_url"],
    required: ["date", "page_url"],
    signalFields: [
      "ga4_sessions",
      "ga4_engaged_sessions",
      "ga4_avg_engagement_time_seconds",
      "ga4_conversions",
      "gsc_clicks",
      "gsc_impressions",
      "bing_clicks",
      "bing_impressions",
      "ai_citations",
      "distribution_clicks",
    ],
    urlFields: ["page_url"],
    numericFields: [
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
    ],
    headers: [
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
    ],
  },
  search_query_daily: {
    inputDir: "imports/query-exports",
    output: "analytics/search_query_daily.csv",
    keys: ["date", "source", "query", "page_url", "device", "country"],
    required: ["date", "query"],
    signalFields: ["clicks", "impressions", "avg_position"],
    urlFields: ["page_url"],
    numericFields: ["clicks", "impressions", "ctr", "avg_position"],
    headers: [
      "date",
      "source",
      "source_export_id",
      "source_file",
      "property_id",
      "timezone",
      "captured_by",
      "reviewed_by",
      "query",
      "page_url",
      "slug",
      "device",
      "country",
      "clicks",
      "impressions",
      "ctr",
      "avg_position",
      "search_intent",
      "serp_features",
      "content_action",
      "notes",
    ],
  },
  ai_citation_log: {
    inputDir: "imports/ai-citations",
    output: "analytics/ai_citation_log.csv",
    aiCitationLog: true,
    autoProvenance: false,
    autoCapturedBy: false,
    keys: ["capture_date", "query_set_id", "query_set_version", "query_id", "query", "surface", "target_page_url", "cited_url"],
    required: ["capture_date", "query", "surface", "target_page_url"],
    signalFields: ["cited_url", "recommended_action", "missing_angle"],
    urlFields: ["target_page_url", "cited_url"],
    numericFields: ["citation_position"],
    headers: [
      "capture_date",
      "query_set_id",
      "query_set_version",
      "query_id",
      "query",
      "surface",
      "capture_method",
      "source_export_id",
      "source_file",
      "captured_by",
      "reviewer",
      "target_page_url",
      "cited_url",
      "cited_domain",
      "is_sell_in_public",
      "citation_position",
      "answer_angle",
      "answer_accuracy",
      "competitors_cited",
      "missing_angle",
      "recommended_action",
      "notes",
    ],
  },
  distribution_daily: {
    inputDir: "imports/distribution",
    output: "analytics/distribution_daily.csv",
    keys: ["date", "channel", "post_url", "content_url", "campaign"],
    required: ["date", "channel", "content_url"],
    signalFields: ["impressions", "engagements", "clicks", "comments", "shares", "saves", "leads", "meetings_booked"],
    urlFields: ["post_url", "content_url"],
    numericFields: ["impressions", "engagements", "clicks", "ctr", "comments", "shares", "saves", "leads", "meetings_booked"],
    headers: [
      "date",
      "channel",
      "source_export_id",
      "source_file",
      "property_id",
      "timezone",
      "captured_by",
      "reviewed_by",
      "post_url",
      "campaign",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "content_url",
      "slug",
      "impressions",
      "engagements",
      "clicks",
      "ctr",
      "comments",
      "shares",
      "saves",
      "leads",
      "meetings_booked",
      "notes",
      "next_action",
    ],
  },
};

const ALIASES = {
  date: ["date", "day", "Date", "Day", "search date", "Search date"],
  page_url: [
    "page_url",
    "url",
    "page",
    "Page",
    "page url",
    "Page URL",
    "landing page",
    "Landing page",
    "landing page url",
    "Landing page URL",
    "destination url",
    "Destination URL",
    "destination page",
    "Destination page",
    "final url",
    "Final URL",
    "page_location",
  ],
  slug: ["slug"],
  page_type: ["page_type"],
  publish_date: ["publish_date"],
  ga4_sessions: ["ga4_sessions", "sessions", "Sessions"],
  ga4_engaged_sessions: ["ga4_engaged_sessions", "engagedSessions", "Engaged sessions", "engaged sessions"],
  ga4_avg_engagement_time_seconds: ["ga4_avg_engagement_time_seconds", "averageSessionDuration", "Average engagement time"],
  ga4_conversions: ["ga4_conversions", "keyEvents", "conversions", "Conversions"],
  gsc_clicks: ["gsc_clicks", "clicks", "Clicks"],
  gsc_impressions: ["gsc_impressions", "impressions", "Impressions"],
  gsc_ctr: ["gsc_ctr", "ctr", "CTR"],
  gsc_avg_position: ["gsc_avg_position", "position", "Position", "avg_position", "Average position"],
  bing_clicks: ["bing_clicks", "Bing clicks", "Bing Clicks", "Bing Webmaster clicks", "Bing Webmaster Clicks"],
  bing_impressions: [
    "bing_impressions",
    "Bing impressions",
    "Bing Impressions",
    "Bing Webmaster impressions",
    "Bing Webmaster Impressions",
  ],
  bing_ctr: ["bing_ctr", "Bing CTR", "Bing ctr", "Bing Webmaster CTR"],
  bing_avg_position: [
    "bing_avg_position",
    "Bing average position",
    "Bing Average position",
    "Bing Average Position",
    "Bing avg position",
    "Bing Avg position",
    "Bing Avg Position",
    "Bing avg. position",
    "Bing Avg. position",
    "Bing Avg. Position",
  ],
  ai_citations: ["ai_citations"],
  query_id: ["query_id", "prompt_id", "citation_query_id"],
  query_set_id: ["query_set_id"],
  query_set_version: ["query_set_version"],
  distribution_clicks: ["distribution_clicks"],
  source: ["source", "Source", "search engine", "Search engine", "search_engine", "Search Engine"],
  query: [
    "query",
    "Query",
    "search query",
    "Search query",
    "Search Query",
    "search term",
    "Search term",
    "Search Term",
    "keyword",
    "Keyword",
    "keywords",
    "Keywords",
    "search keyword",
    "Search keyword",
    "Search Keyword",
    "search keywords",
    "Search keywords",
    "Search Keywords",
    "top queries",
    "Top queries",
    "Top Queries",
  ],
  device: [
    "device",
    "Device",
    "device type",
    "Device type",
    "Device Type",
    "device category",
    "Device category",
    "Device Category",
  ],
  country: [
    "country",
    "Country",
    "country/region",
    "Country/region",
    "Country/Region",
    "country or region",
    "Country or region",
    "Country Or Region",
    "market",
    "Market",
  ],
  clicks: ["clicks", "Clicks"],
  impressions: ["impressions", "Impressions"],
  ctr: [
    "ctr",
    "CTR",
    "ctr (%)",
    "CTR (%)",
    "click-through rate",
    "Click-through rate",
    "Click-Through Rate",
    "click through rate",
    "Click Through Rate",
  ],
  avg_position: [
    "avg_position",
    "average_position",
    "position",
    "Position",
    "average position",
    "Average position",
    "Average Position",
    "avg position",
    "Avg position",
    "Avg Position",
    "avg. position",
    "Avg. position",
    "Avg. Position",
  ],
  search_intent: ["search_intent", "search intent", "Search intent", "Search Intent"],
  serp_features: ["serp_features"],
  content_action: ["content_action", "content action", "Content action", "Content Action"],
  capture_date: ["capture_date", "date"],
  surface: ["surface", "ai_surface"],
  capture_method: ["capture_method", "capture method", "Capture method", "collection_method", "collection method"],
  target_page_url: ["target_page_url", "target_url", "page_url"],
  cited_url: ["cited_url", "citation_url"],
  cited_domain: ["cited_domain"],
  is_sell_in_public: ["is_sell_in_public"],
  citation_position: ["citation_position"],
  answer_angle: ["answer_angle"],
  answer_accuracy: ["answer_accuracy"],
  competitors_cited: ["competitors_cited"],
  missing_angle: ["missing_angle"],
  recommended_action: ["recommended_action"],
  reviewer: ["reviewer", "reviewed_by"],
  channel: ["channel"],
  post_url: ["post_url", "Post URL"],
  campaign: ["campaign", "Campaign"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign"],
  content_url: ["content_url", "URL", "Link"],
  engagements: ["engagements", "Engagements"],
  comments: ["comments", "Comments"],
  shares: ["shares", "Shares"],
  saves: ["saves", "Saves"],
  leads: ["leads"],
  meetings_booked: ["meetings_booked"],
  notes: ["notes", "Notes"],
  next_action: ["next_action"],
};

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function pick(row, field) {
  const aliases = new Set((ALIASES[field] || [field]).map(normalizeHeader));
  for (const [header, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(header)) && String(value ?? "").trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function slugFromUrl(value) {
  return slugFromPageUrl(value);
}

function normalizeRow(row, table, fileName, runDate) {
  const output = {};
  for (const header of table.headers) output[header] = pick(row, header);
  if (table.autoProvenance !== false) {
    output.source_export_id ||= `manual_import:${fileName}:${runDate}`;
    output.source_file ||= fileName;
  }
  output.timezone ||= "America/Los_Angeles";
  if (table.autoCapturedBy !== false) output.captured_by ||= "scripts/seo-aeo/import-analytics-exports.mjs";
  output.reviewed_by ||= "";
  if ("date" in output && !output.date) output.date = runDate;
  if ("capture_date" in output && !output.capture_date) output.capture_date = runDate;
  if (!output.slug) output.slug = slugFromUrl(output.page_url || output.target_page_url || output.content_url);
  if (!output.source && table.output.includes("search_query")) {
    output.source = /google[_\s-]*search[_\s-]*console|\bgsc\b|search[_\s-]*console/i.test(fileName)
      ? "google_search_console"
      : "manual_query_export";
  }
  if (!output.content_action && table.output.includes("search_query")) output.content_action = "monitor";
  return output;
}

function csvFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  if (!fs.statSync(dirPath).isDirectory()) {
    throw new Error(`Import path is not a directory: ${dirPath}`);
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function hasValues(row) {
  return Object.values(row).some((value) => String(value ?? "").trim() !== "");
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isUrlLike(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (text.startsWith("/")) return true;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isNumeric(value) {
  const text = String(value ?? "").trim();
  return !text || Number.isFinite(Number(text));
}

function loadAiCitationQuerySet(root) {
  const querySet = readJsonIfExists(path.join(root, "docs/seo-aeo/ai-citation-query-set.json"));
  return {
    id: querySet.query_set_id || "",
    version: querySet.query_set_version || "",
    surfaces: new Set((querySet.surfaces || []).filter((surface) => surface.active !== false).map((surface) => surface.surface_id)),
    queries: new Map((querySet.queries || []).filter((query) => query.active !== false).map((query) => [query.query_id, query])),
  };
}

const SAFE_AI_CAPTURE_METHODS = new Set([
  "manual_serp_observation",
  "manual_search_observation",
  "manual_ai_answer_observation",
  "manual_ai_overview_observation",
  "official_ai_performance_export",
  "official_search_performance_export",
]);

const UNSAFE_AI_CAPTURE_METHOD =
  /unofficial|network\s*(tab|response|scrap|capture)|devtools|developer\s*tools|hidden\s*quer(y|ies)|browser\s*traffic|traffic\s*capture|chatgpt\s*network|cookie|local\s*storage|session\s*storage|browser\s*storage|scrap(e|ing|ed|er)/i;

function validateAiCitationImportRow(row, querySet) {
  const issues = [];
  const querySetId = row.query_set_id || "";
  const querySetVersion = row.query_set_version || "";
  const queryId = row.query_id || "";
  const expected = queryId ? querySet.queries.get(queryId) : null;
  const captureMethod = row.capture_method || "";
  const provenanceText = [
    row.capture_method,
    row.source_export_id,
    row.source_file,
    row.captured_by,
    row.reviewer,
    row.notes,
  ].join(" ");

  if (!querySet.id || !querySet.version) issues.push("missing_active_ai_citation_query_set");
  if (!querySetId) issues.push("missing_query_set_id");
  if (!querySetVersion) issues.push("missing_query_set_version");
  if (querySetId && querySetId !== querySet.id) issues.push("query_set_id_mismatch");
  if (querySetVersion && querySetVersion !== querySet.version) issues.push("query_set_version_mismatch");
  if (!queryId) issues.push("missing_query_id");
  if (queryId && !expected) issues.push("query_id_not_in_active_query_set");
  if (!querySet.surfaces.has(row.surface || "")) issues.push("unsupported_surface");
  if (expected) {
    if (row.query !== expected.query) issues.push("query_text_mismatch");
    if (row.target_page_url !== expected.target_page_url) issues.push("target_page_url_mismatch");
  }
  if (!captureMethod) issues.push("missing_capture_method");
  if (captureMethod && !SAFE_AI_CAPTURE_METHODS.has(captureMethod)) issues.push("unsupported_capture_method");
  if (!row.source_export_id || !row.source_file) issues.push("missing_source_provenance");
  if (!row.captured_by) issues.push("missing_captured_by");
  if (!row.reviewer) issues.push("missing_reviewer");
  if (UNSAFE_AI_CAPTURE_METHOD.test(provenanceText)) issues.push("unsafe_capture_method");

  return issues;
}

function validateNormalizedRow(row, table, context = {}) {
  const issues = [];
  for (const field of table.required || []) {
    if (!String(row[field] ?? "").trim()) issues.push(`missing required field: ${field}`);
  }
  for (const field of ["date", "capture_date"]) {
    if (row[field] && !isDate(row[field])) issues.push(`${field} must be YYYY-MM-DD`);
  }
  for (const field of table.urlFields || []) {
    if (!isUrlLike(row[field])) issues.push(`${field} must be an absolute http(s) URL or site path`);
  }
  for (const field of table.numericFields || []) {
    if (!isNumeric(row[field])) issues.push(`${field} must be numeric when present`);
  }
  if (!table.signalFields?.some((field) => String(row[field] ?? "").trim())) {
    issues.push(`needs at least one signal field: ${table.signalFields.join(", ")}`);
  }
  if (table.aiCitationLog) {
    issues.push(...validateAiCitationImportRow(row, context.aiCitationQuerySet || { surfaces: new Set(), queries: new Map() }));
  }
  return issues;
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const dryRun = hasFlag("--dry-run");
  const strict = hasFlag("--strict");
  const imported = [];
  const skipped = [];
  const invalid = [];
  const aiCitationQuerySet = loadAiCitationQuerySet(root);

  for (const [tableName, table] of Object.entries(TABLES)) {
    const dirPath = path.join(root, table.inputDir);
    const files = csvFiles(dirPath);
    for (const filePath of files) {
      const { rows } = parseCsv(fs.readFileSync(filePath, "utf8"));
      const sourceFile = path.relative(root, filePath);
      const usableRows = rows.filter(hasValues);
      if (!usableRows.length) {
        skipped.push({ table: tableName, file: sourceFile, reason: "no data rows" });
        continue;
      }
      const normalized = usableRows.map((row) => normalizeRow(row, table, sourceFile, runDate));
      const valid = [];
      normalized.forEach((row, index) => {
        const issues = validateNormalizedRow(row, table, { aiCitationQuerySet });
        if (issues.length) {
          invalid.push({ table: tableName, file: sourceFile, row: index + 2, issues });
        } else {
          valid.push(row);
        }
      });
      if (!valid.length) {
        skipped.push({ table: tableName, file: sourceFile, reason: "no valid rows" });
        continue;
      }
      const result = dryRun
        ? { path: path.join(root, table.output), rowsWritten: 0, totalRows: null, dryRun: true }
        : upsertRows(path.join(root, table.output), table.headers, valid, table.keys);
      imported.push({ table: tableName, file: sourceFile, rows: valid.length, result });
    }
  }

  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  writeJsonAtomic(path.join(outputDir, "manual-import-report.json"), {
    run_date: runDate,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    imported,
    skipped,
    invalid,
  });
  console.log(JSON.stringify({ ok: true, dryRun, imported, skipped, invalid }, null, 2));
  if (strict && invalid.length) process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
