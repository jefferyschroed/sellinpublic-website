#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const ALLOWED_TYPES = new Set([
  "reviewed_generic_query_tool_export",
  "gsc_search_query_export",
  "gsc_emerging_query_export",
  "google_trends_csv_export",
  "bing_webmaster_query_export",
]);

const HEADERS_BY_TYPE = {
  reviewed_generic_query_tool_export: [
    "date",
    "source",
    "query",
    "country",
    "language",
    "volume",
    "difficulty",
    "impressions",
    "clicks",
    "trend_delta",
    "trend_window",
    "validated_demand",
    "validation_source",
    "reviewed_by",
    "notes",
  ],
  gsc_search_query_export: [
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
  gsc_emerging_query_export: [
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
  google_trends_csv_export: [
    "date",
    "query",
    "term",
    "topic",
    "country",
    "language",
    "trend_delta",
    "trend_window",
    "geo",
    "category",
    "property",
    "notes",
  ],
  bing_webmaster_query_export: [
    "source",
    "Date",
    "Search Keywords",
    "Page URL",
    "Device",
    "Country",
    "Clicks",
    "Impressions",
    "CTR",
    "Average Position",
    "Search Intent",
    "Content Action",
    "Notes",
  ],
};

function usage() {
  console.log(`Usage:
  node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <id> --type <import_type> --source-file <csv> --reviewed-by <name> --source-name <name> --validation-source <source> --dry-run
  node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <id> --type <import_type> --source-file <csv> --reviewed-by <name> --source-name <name> --validation-source <source> --apply [--replace]

Normalizes a reviewed demand export into the existing demand-import-pack staging CSV.
It does not promote imports, rebuild discovery, scaffold packets, approve publishing, or make discovery-only data factual evidence.`);
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizedKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cell(row, names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const key = normalizedKey(name);
    const found = entries.find(([header]) => normalizedKey(header) === key);
    if (found && String(found[1] || "").trim()) return String(found[1] || "").trim();
  }
  return "";
}

function isInside(parentDir, filePath) {
  const relativePath = path.relative(parentDir, filePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isAllowedReviewedSourcePath(root, args, sourcePath) {
  if (isInside(path.join(root, "imports"), sourcePath) || isInside(path.join(root, "research"), sourcePath)) return true;
  if (
    (args.importType === "gsc_search_query_export" || args.importType === "gsc_emerging_query_export") &&
    path.resolve(root, "analytics", "search_query_daily.csv") === sourcePath
  ) {
    return true;
  }
  return false;
}

function validateArgs(args) {
  const errors = [];
  if (!args.candidateId) errors.push("--candidate is required.");
  if (!ALLOWED_TYPES.has(args.importType)) errors.push(`--type must be one of: ${[...ALLOWED_TYPES].join(", ")}.`);
  if (!args.sourceFile) errors.push("--source-file is required.");
  if (args.apply && args.dryRun) errors.push("Use either --apply or --dry-run, not both.");
  if (!args.apply && !args.dryRun) args.dryRun = true;
  if (args.importType === "reviewed_generic_query_tool_export") {
    if (!args.sourceName) errors.push("--source-name is required for reviewed generic query-tool exports.");
    if (!args.validationSource) errors.push("--validation-source is required for reviewed generic query-tool exports.");
    if (!args.reviewedBy) errors.push("--reviewed-by is required for reviewed generic query-tool exports.");
    if (isDiscoveryOnlySource(args.sourceName) && !isDemandBearingValidationSource(args.validationSource)) {
      errors.push("Discovery-only sources such as AnswerThePublic, AlsoAsked, autocomplete, PAA, or AI answers require a separate demand-bearing --validation-source.");
    }
  }
  return errors;
}

function isDiscoveryOnlySource(value) {
  return /answer\s*the\s*public|answerthepublic|alsoasked|also\s*asked|autocomplete|people\s*also\s*ask|\bpaa\b|chatgpt|claude|ai\s*answer|reddit/i.test(
    String(value || "")
  );
}

function isDemandBearingValidationSource(value) {
  return /ahrefs|semrush|search\s*console|\bgsc\b|bing|webmaster|google\s*trends|trends\s*csv|keyword\s*planner|first[-\s]*party|impressions|clicks|volume|analytics|reviewed\s*demand/i.test(
    String(value || "")
  );
}

function shellArg(value) {
  const text = String(value || "");
  if (/^[A-Za-z0-9_./:=@,+-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function stageCommand(args, sourceFile, mode) {
  const parts = [
    "node",
    "scripts/seo-aeo/stage-reviewed-demand-export.mjs",
    "--date",
    args.runDate,
    "--candidate",
    args.candidateId,
    "--type",
    args.importType,
    "--source-file",
    sourceFile,
  ];
  if (args.sourceName) parts.push("--source-name", args.sourceName);
  if (args.validationSource) parts.push("--validation-source", args.validationSource);
  if (args.propertyId) parts.push("--property-id", args.propertyId);
  if (args.reviewedBy) parts.push("--reviewed-by", args.reviewedBy);
  if (args.sourceExportId) parts.push("--source-export-id", args.sourceExportId);
  if (args.observedAt) parts.push("--observed-at", args.observedAt);
  if (args.country) parts.push("--country", args.country);
  if (args.language) parts.push("--language", args.language);
  if (args.trendWindow) parts.push("--trend-window", args.trendWindow);
  if (args.replace) parts.push("--replace");
  parts.push(mode);
  return parts.map(shellArg).join(" ");
}

function candidateRow(root, runDate, candidateId, importType) {
  const manifestPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "manifest.json");
  const manifest = readJson(manifestPath, {});
  const matches = (manifest.review_rows || []).filter((row) => row.candidate_id === candidateId && row.recommended_import_type === importType);
  if (!matches.length) {
    const requestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
    const sourceRequest = readJson(requestPath, {});
    const requestMatches = (sourceRequest.requested_exports || []).filter(
      (row) => row.candidate_id === candidateId && row.recommended_import_type === importType
    );
    if (!requestMatches.length) throw new Error(`No manifest or source-request row found for candidate=${candidateId} type=${importType}.`);
    return requestMatches.sort((a, b) => Number(a.import_rank || 99) - Number(b.import_rank || 99))[0];
  }
  return matches.sort((a, b) => Number(a.import_rank || 99) - Number(b.import_rank || 99))[0];
}

function importDate(args, row) {
  return args.observedAt || cell(row, ["date", "observed_at", "observed at", "export date"]) || args.runDate;
}

function normalizeGenericRows(args, rows) {
  return rows
    .map((row) => {
      const query = cell(row, ["query", "question", "keyword", "keywords", "search term", "search terms", "term"]);
      if (!query) return null;
      return {
        date: importDate(args, row),
        source: args.sourceName || cell(row, ["source", "tool"]),
        query,
        country: cell(row, ["country", "geo", "location", "database"]) || args.country || "US",
        language: cell(row, ["language", "lang"]) || args.language || "en",
        volume: cell(row, ["volume", "search volume", "avg. monthly searches", "average monthly searches", "monthly volume"]),
        difficulty: cell(row, ["difficulty", "keyword difficulty", "kd", "seo difficulty"]),
        impressions: cell(row, ["impressions"]),
        clicks: cell(row, ["clicks"]),
        trend_delta: cell(row, ["trend_delta", "trend delta", "growth", "change"]),
        trend_window: cell(row, ["trend_window", "trend window", "period", "timeframe"]),
        validated_demand: cell(row, ["validated_demand", "validated demand"]) || args.validatedDemand || "yes",
        validation_source: cell(row, ["validation_source", "validation source"]) || args.validationSource,
        reviewed_by: cell(row, ["reviewed_by", "reviewed by", "reviewer"]) || args.reviewedBy,
        notes: cell(row, ["notes"]) || `Normalized from ${args.sourceName || "reviewed export"}; source file ${path.basename(args.sourceFile)}.`,
      };
    })
    .filter(Boolean);
}

function normalizeGoogleTrendsRows(args, rows, fallbackQuery) {
  return rows
    .map((row) => {
      const query = cell(row, ["query", "search term", "term", "keyword"]) || fallbackQuery;
      if (!query) return null;
      return {
        date: importDate(args, row),
        query,
        term: cell(row, ["term", "search term", "keyword"]),
        topic: cell(row, ["topic"]),
        country: cell(row, ["country"]) || args.country || "US",
        language: cell(row, ["language", "lang"]) || args.language || "en",
        trend_delta: cell(row, ["trend_delta", "trend delta", "change", "rising", "interest"]),
        trend_window: cell(row, ["trend_window", "trend window", "period", "timeframe"]) || args.trendWindow,
        geo: cell(row, ["geo", "region", "subregion"]) || args.country || "US",
        category: cell(row, ["category"]),
        property: cell(row, ["property", "search type"]) || "web",
        notes: cell(row, ["notes"]) || `Normalized from Google Trends export; source file ${path.basename(args.sourceFile)}.`,
      };
    })
    .filter(Boolean);
}

function normalizeBingRows(args, rows) {
  return rows
    .map((row) => {
      const query = cell(row, ["Search Keywords", "query", "keyword", "search term"]);
      if (!query) return null;
      return {
        source: args.sourceName || cell(row, ["source"]) || "Bing Webmaster Tools",
        Date: cell(row, ["Date", "date"]) || args.observedAt || args.runDate,
        "Search Keywords": query,
        "Page URL": cell(row, ["Page URL", "page", "url", "landing page"]),
        Device: cell(row, ["Device", "device"]),
        Country: cell(row, ["Country", "country"]) || args.country || "US",
        Clicks: cell(row, ["Clicks", "clicks"]),
        Impressions: cell(row, ["Impressions", "impressions"]),
        CTR: cell(row, ["CTR", "ctr"]),
        "Average Position": cell(row, ["Average Position", "avg position", "position"]),
        "Search Intent": cell(row, ["Search Intent", "intent"]),
        "Content Action": cell(row, ["Content Action", "action"]),
        Notes: cell(row, ["Notes", "notes"]) || `Normalized from Bing Webmaster export; source file ${path.basename(args.sourceFile)}.`,
      };
    })
    .filter(Boolean);
}

function normalizeMetric(value) {
  const text = String(value || "").trim().replaceAll(",", "");
  if (!text) return "";
  return text.replace(/%$/, "");
}

function normalizeCtr(value) {
  const text = String(value || "").trim().replaceAll(",", "");
  if (!text) return "";
  if (/%$/.test(text)) {
    const number = Number(text.replace(/%$/, ""));
    return Number.isFinite(number) ? String(number / 100) : "";
  }
  return text;
}

function normalizeGscRows(args, rows) {
  return rows
    .map((row) => {
      const query = cell(row, ["query", "Query", "search query", "Search Query", "top queries", "Top queries", "keyword", "Search term"]);
      if (!query) return null;
      const pageUrl = cell(row, ["page_url", "Page URL", "Page", "page", "landing page", "Landing Page", "url", "URL"]);
      return {
        date: importDate(args, row),
        source: "google_search_console",
        source_export_id:
          cell(row, ["source_export_id", "source export id", "export_id", "export id"]) ||
          args.sourceExportId ||
          `google_search_console:${path.basename(args.sourceFile)}:${args.runDate}`,
        source_file: cell(row, ["source_file", "source file"]) || path.basename(args.sourceFile),
        property_id: cell(row, ["property_id", "property", "site", "site_url", "search console property", "gsc property"]) || args.propertyId,
        timezone: cell(row, ["timezone", "time zone"]) || args.timezone,
        captured_by: cell(row, ["captured_by", "captured by"]) || args.capturedBy,
        reviewed_by: cell(row, ["reviewed_by", "reviewed by", "reviewer"]) || args.reviewedBy,
        query,
        page_url: pageUrl,
        slug: cell(row, ["slug"]),
        device: cell(row, ["device", "Device"]),
        country: cell(row, ["country", "Country", "country/region", "Country/Region"]) || args.country || "US",
        clicks: normalizeMetric(cell(row, ["clicks", "Clicks"])),
        impressions: normalizeMetric(cell(row, ["impressions", "Impressions"])),
        ctr: normalizeCtr(cell(row, ["ctr", "CTR", "click-through rate", "click through rate"])),
        avg_position: normalizeMetric(cell(row, ["avg_position", "average_position", "position", "Position", "average position", "Average Position"])),
        search_intent: cell(row, ["search_intent", "search intent", "Search Intent"]),
        serp_features: cell(row, ["serp_features", "serp features"]),
        content_action: cell(row, ["content_action", "content action", "Content Action"]) || "monitor",
        notes: cell(row, ["notes", "Notes"]) || `Normalized from Google Search Console export; source file ${path.basename(args.sourceFile)}.`,
      };
    })
    .filter(Boolean);
}

function uniqueRows(headers, rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = headers.map((header) => row[header] || "").join("\u0001").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function run() {
  const root = process.cwd();
  if (hasFlag("--help") || hasFlag("-h")) {
    usage();
    return;
  }

  const args = {
    runDate: validateIsoDate(arg("--date", today()), "--date"),
    candidateId: arg("--candidate"),
    importType: arg("--type"),
    sourceFile: arg("--source-file"),
    sourceName: arg("--source-name"),
    validationSource: arg("--validation-source"),
    reviewedBy: arg("--reviewed-by"),
    validatedDemand: arg("--validated-demand", "yes"),
    observedAt: arg("--observed-at"),
    sourceExportId: arg("--source-export-id"),
    propertyId: arg("--property-id"),
    timezone: arg("--timezone", "America/Los_Angeles"),
    capturedBy: arg("--captured-by", "scripts/seo-aeo/import-reviewed-demand-export.mjs"),
    country: arg("--country", "US"),
    language: arg("--language", "en"),
    trendWindow: arg("--trend-window"),
    apply: hasFlag("--apply"),
    dryRun: hasFlag("--dry-run"),
    replace: hasFlag("--replace"),
  };
  const argErrors = validateArgs(args);
  if (argErrors.length) throw new Error(argErrors.join(" "));

  const sourcePath = path.resolve(root, args.sourceFile);
  if (!fs.existsSync(sourcePath)) throw new Error(`Source file not found: ${args.sourceFile}`);
  if (!isAllowedReviewedSourcePath(root, args, sourcePath)) {
    throw new Error("Source file must be under imports/ or research/ so reviewed inputs are auditable. GSC import types may also use analytics/search_query_daily.csv from the local OAuth pull.");
  }

  const manifestRow = candidateRow(root, args.runDate, args.candidateId, args.importType);
  const stagingPath = path.resolve(root, manifestRow.staging_csv_path);
  const packDir = path.join(root, "research", "daily-content-plan", args.runDate, "demand-import-pack");
  if (!isInside(packDir, stagingPath)) throw new Error("Resolved staging path is outside the demand import pack.");

  const parsed = readCsv(sourcePath);
  if (!parsed.rows.length) throw new Error("Source export has no rows.");
  const headers = HEADERS_BY_TYPE[args.importType];
  let normalizedRows = [];
  if (args.importType === "reviewed_generic_query_tool_export") normalizedRows = normalizeGenericRows(args, parsed.rows);
  if (args.importType === "gsc_search_query_export" || args.importType === "gsc_emerging_query_export") normalizedRows = normalizeGscRows(args, parsed.rows);
  if (args.importType === "google_trends_csv_export") normalizedRows = normalizeGoogleTrendsRows(args, parsed.rows, manifestRow.query_or_topic_to_validate);
  if (args.importType === "bing_webmaster_query_export") normalizedRows = normalizeBingRows(args, parsed.rows);
  normalizedRows = uniqueRows(headers, normalizedRows);
  if (!normalizedRows.length) throw new Error("No rows with recognizable query/search-term fields were found.");

  const current = readCsv(stagingPath, headers);
  const outputRows = args.replace ? normalizedRows : uniqueRows(headers, [...current.rows, ...normalizedRows]);
  const sourceFileRelative = relative(root, sourcePath);
  const report = {
    schema_version: "1.0",
    run_date: args.runDate,
    generated_at: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry_run",
    candidate_id: args.candidateId,
    import_type: args.importType,
    source_file: sourceFileRelative,
    staging_csv_path: relative(root, stagingPath),
    final_destination_path: manifestRow.final_destination_path,
    source_rows: parsed.rows.length,
    normalized_rows: normalizedRows.length,
    existing_staging_rows: current.rows.length,
    output_staging_rows: outputRows.length,
    applied: args.apply,
    rule: "This normalizer writes reviewed rows only into staging. It does not promote imports, rebuild discovery, scaffold packets, approve publishing, or make discovery-only data factual evidence.",
  };

  const reportPath = path.join(packDir, `${args.runDate}-reviewed-demand-import-${args.candidateId}-${args.importType}.report.json`);
  if (args.apply) writeCsvAtomic(stagingPath, headers, outputRows);
  writeJsonAtomic(reportPath, report);
  const nextCommand = args.apply
    ? `node scripts/seo-aeo/run-demand-promotion.mjs --date ${args.runDate} --dry-run`
    : stageCommand(args, sourceFileRelative, "--apply");
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: report.mode,
        candidate_id: report.candidate_id,
        import_type: report.import_type,
        source_rows: report.source_rows,
        normalized_rows: report.normalized_rows,
        staging_csv_path: report.staging_csv_path,
        report_path: relative(root, reportPath),
        next_command: nextCommand,
      },
      null,
      2
    )
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
