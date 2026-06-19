#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const REPORT_HEADERS = [
  "date",
  "candidate_id",
  "import_rank",
  "primary_recommended_import",
  "priority_reason",
  "recommended_import_type",
  "staging_csv_path",
  "final_destination_path",
  "status",
  "row_count",
  "errors",
  "warnings",
];

function approvalMarkerFor(runDate) {
  return `DEMAND-PROMOTION-APPROVED:${runDate}`;
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

function cell(row, header) {
  const found = Object.entries(row).find(([key]) => key.trim().toLowerCase() === header.trim().toLowerCase());
  return String(found?.[1] ?? "").trim();
}

function hasAny(row, headers) {
  return headers.some((header) => cell(row, header));
}

function requireHeaders(headers, required, errors) {
  const normalized = new Set(headers.map((header) => header.trim().toLowerCase()));
  for (const header of required) {
    if (!normalized.has(header.trim().toLowerCase())) errors.push(`missing_header:${header}`);
  }
}

function validationStatusFor(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["yes", "true", "validated", "approved", "reviewed"].includes(text);
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

function isGoogleSearchConsoleSource(value) {
  return /\bgoogle[_\s-]*search[_\s-]*console\b|\bsearch[_\s-]*console\b|\bgsc\b/i.test(String(value || ""));
}

function isGscImportType(importType) {
  return importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export";
}

function isKnownImportType(importType) {
  return isGscImportType(importType) || ["google_trends_csv_export", "bing_webmaster_query_export", "reviewed_generic_query_tool_export"].includes(importType);
}

function isPlaceholderValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return /^(todo|tbd|replace|replace_me|example|sample|dummy|fake|placeholder|lorem ipsum|xxx|n\/a|null|none)$/i.test(text) ||
    /\b(replace me|sample data|dummy data|fake data|example only|placeholder)\b/i.test(text);
}

function requireCell(row, header, rowNumber, errors) {
  const value = cell(row, header);
  if (!value) {
    errors.push(`row_${rowNumber}:missing_${header}`);
    return "";
  }
  if (isPlaceholderValue(value)) errors.push(`row_${rowNumber}:placeholder_${header}`);
  return value;
}

function checkRequiredCells(row, headers, rowNumber, errors) {
  for (const header of headers) requireCell(row, header, rowNumber, errors);
}

function expectedHeadersFor(importType) {
  if (isGscImportType(importType)) return ["date", "source", "property_id", "reviewed_by", "query"];
  if (importType === "google_trends_csv_export") {
    return [
      "date",
      "source",
      "source_file",
      "captured_at",
      "captured_by",
      "reviewed_by",
      "query",
      "country",
      "language",
      "trend_delta",
      "trend_window",
      "geo",
      "category",
      "property",
      "source_row_count",
    ];
  }
  if (importType === "bing_webmaster_query_export") return ["source", "Date", "Search Keywords", "Clicks", "Impressions"];
  if (importType === "reviewed_generic_query_tool_export") {
    return ["source", "query", "validated_demand", "validation_source", "reviewed_by"];
  }
  return [];
}

function validateRows(importType, headers, rows) {
  const errors = [];
  const warnings = [];
  if (!isKnownImportType(importType)) {
    return {
      errors: [`unknown_import_type:${importType || "missing"}`],
      warnings,
      status: "blocked",
    };
  }
  if (!rows.length) {
    return {
      errors: [],
      warnings,
      status: "empty_staging",
    };
  }
  requireHeaders(headers, expectedHeadersFor(importType), errors);

  if (isGscImportType(importType)) {
    rows.forEach((row, index) => {
      checkRequiredCells(row, ["date", "source", "property_id", "reviewed_by", "query"], index + 1, errors);
      if (!isGoogleSearchConsoleSource(cell(row, "source"))) errors.push(`row_${index + 1}:source_not_google_search_console`);
      if (!hasAny(row, ["clicks", "impressions", "avg_position"])) errors.push(`row_${index + 1}:missing_clicks_impressions_or_avg_position`);
      if (!hasAny(row, ["page_url", "device", "country"])) warnings.push(`row_${index + 1}:missing_gsc_dimension_context`);
    });
  } else if (importType === "google_trends_csv_export") {
    rows.forEach((row, index) => {
      checkRequiredCells(row, expectedHeadersFor(importType), index + 1, errors);
      const source = `${cell(row, "source")} ${cell(row, "surface")} ${cell(row, "notes")} ${cell(row, "trend_window")}`;
      if (/rss|feed|headline|public\s*trend|trending\s*rss/i.test(source)) {
        errors.push(`row_${index + 1}:google_trends_csv_must_not_be_rss_or_public_trend_feed`);
      }
      const sourceRowCount = Number(cell(row, "source_row_count"));
      if (!Number.isFinite(sourceRowCount) || sourceRowCount <= 0) errors.push(`row_${index + 1}:invalid_source_row_count`);
      const trendDelta = Number(cell(row, "trend_delta"));
      if (!Number.isFinite(trendDelta)) errors.push(`row_${index + 1}:trend_delta_not_numeric`);
      if (!hasAny(row, ["term", "topic"])) warnings.push(`row_${index + 1}:missing_term_or_topic`);
      if (!hasAny(row, ["trend_delta", "trend_window", "notes"])) {
        warnings.push(`row_${index + 1}:missing_trend_context`);
      }
    });
  } else if (importType === "bing_webmaster_query_export") {
    rows.forEach((row, index) => {
      checkRequiredCells(row, ["source", "Date", "Search Keywords"], index + 1, errors);
      if (!hasAny(row, ["Clicks", "Impressions"])) errors.push(`row_${index + 1}:missing_clicks_or_impressions`);
      const source = cell(row, "source").toLowerCase();
      if (source && !/bing|webmaster|search performance/.test(source)) {
        warnings.push(`row_${index + 1}:source_not_obviously_bing_webmaster`);
      }
    });
  } else if (importType === "reviewed_generic_query_tool_export") {
    rows.forEach((row, index) => {
      checkRequiredCells(row, ["source", "query", "validation_source", "reviewed_by"], index + 1, errors);
      if (!validationStatusFor(cell(row, "validated_demand"))) errors.push(`row_${index + 1}:validated_demand_not_approved`);
      if (isDiscoveryOnlySource(cell(row, "source")) && !isDemandBearingValidationSource(cell(row, "validation_source"))) {
        errors.push(`row_${index + 1}:discovery_source_without_separate_demand_validation`);
      }
      if (!hasAny(row, ["volume", "impressions", "clicks", "trend_delta"]) && !isDemandBearingValidationSource(cell(row, "validation_source"))) {
        warnings.push(`row_${index + 1}:missing_demand_metric_context`);
      }
    });
  } else {
    warnings.push(`unknown_import_type:${importType}`);
  }

  return {
    errors,
    warnings,
    status: errors.length ? "blocked" : "valid_for_promotion",
  };
}

function isInside(parentDir, filePath) {
  const relativePath = path.relative(parentDir, filePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function writeMarkdown(filePath, report) {
  const lines = report.rows
    .map(
      (row) =>
        `- ${row.status}: rank ${row.import_rank || "unranked"} ${row.primary_recommended_import === "yes" ? "primary " : ""}${row.recommended_import_type} for ${row.candidate_id} (${row.row_count} row(s)) - \`${row.staging_csv_path}\` -> \`${row.final_destination_path}\`${row.priority_reason ? `; priority: ${row.priority_reason}` : ""}${row.errors ? `; errors: ${row.errors}` : ""}${row.warnings ? `; warnings: ${row.warnings}` : ""}`
    )
    .join("\n");
  const markdown = `# Demand Import Pack Validation

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Mode: ${report.apply ? "apply" : "dry-run"}
Valid for promotion: ${report.valid_for_promotion}
Already promoted: ${report.already_promoted}
Promoted: ${report.promoted}
Blocked: ${report.blocked}
Empty staging files: ${report.empty_staging}

## Rule

Dry-run validation never copies data into \`imports/\`. Promotion requires \`--apply\`, non-empty staging CSVs, and source-specific review checks. This validator does not create demand data.

${lines || "- No staged rows found."}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function copyAtomic(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  const tmpPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${process.pid}.tmp`);
  fs.copyFileSync(sourcePath, tmpPath);
  fs.renameSync(tmpPath, destinationPath);
}

function filesMatch(leftPath, rightPath) {
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return false;
  return fs.readFileSync(leftPath).equals(fs.readFileSync(rightPath));
}

function reviewRows(root, runDate, manifest) {
  const manifestRows = Array.isArray(manifest.review_rows) ? manifest.review_rows : [];
  if (manifestRows.length) return manifestRows;
  const requestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  const sourceRequest = readJson(requestPath, {});
  if (!String(sourceRequest.status || "").startsWith("escalation_required")) return [];
  return (sourceRequest.requested_exports || []).map((row) => ({
    date: runDate,
    candidate_id: row.candidate_id || "",
    import_rank: row.import_rank || "",
    primary_recommended_import: row.primary_recommended_import || "",
    priority_reason: row.fallback_reason || sourceRequest.requested_export_source || "source_request",
    recommended_import_type: row.recommended_import_type || "",
    staging_csv_path: row.staging_csv_path || "",
    final_destination_path: row.final_destination_path || "",
    query_or_topic_to_validate: row.query_or_topic_to_validate || "",
  }));
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const apply = hasFlag("--apply");
  const approvalMarker = arg("--approval-marker", "");
  if (apply && approvalMarker !== approvalMarkerFor(runDate)) {
    throw new Error(`--apply requires --approval-marker ${approvalMarkerFor(runDate)}`);
  }
  const packDir = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack");
  const manifestPath = path.join(packDir, "manifest.json");
  const manifest = readJson(manifestPath, {});
  const reportRows = [];
  const destinationCounts = new Map();
  let promoted = 0;
  let alreadyPromoted = 0;

  for (const row of reviewRows(root, runDate, manifest)) {
    const stagingPath = path.resolve(root, row.staging_csv_path);
    const destinationPath = path.resolve(root, row.final_destination_path);
    const errors = [];
    const warnings = [];
    if (!isInside(packDir, stagingPath)) errors.push("staging_file_outside_pack");
    if (!isInside(path.join(root, "imports"), destinationPath)) errors.push("destination_outside_imports");
    if (!fs.existsSync(stagingPath)) errors.push("missing_staging_file");
    const destinationKey = normalizePath(destinationPath);
    destinationCounts.set(destinationKey, (destinationCounts.get(destinationKey) || 0) + 1);
    if (destinationCounts.get(destinationKey) > 1) errors.push("destination_duplicate_in_pack");

    let parsed = { headers: [], rows: [] };
    if (!errors.length) parsed = readCsv(stagingPath);
    const validation = errors.length
      ? { errors, warnings, status: "blocked" }
      : validateRows(row.recommended_import_type, parsed.headers, parsed.rows);
    let status = validation.status;
    if (status === "valid_for_promotion" && fs.existsSync(destinationPath)) {
      if (filesMatch(stagingPath, destinationPath)) {
        status = "already_promoted";
        alreadyPromoted += 1;
      } else {
        validation.errors.push("destination_collision_existing_file");
        status = "blocked";
      }
    }

    if (apply && status === "valid_for_promotion") {
      copyAtomic(stagingPath, destinationPath);
      promoted += 1;
    }

    reportRows.push({
      date: runDate,
      candidate_id: row.candidate_id,
      import_rank: row.import_rank,
      primary_recommended_import: row.primary_recommended_import,
      priority_reason: row.priority_reason,
      recommended_import_type: row.recommended_import_type,
      staging_csv_path: row.staging_csv_path,
      final_destination_path: row.final_destination_path,
      status: apply && status === "valid_for_promotion" ? "promoted" : status,
      row_count: parsed.rows.length,
      errors: validation.errors.join(" | "),
      warnings: validation.warnings.join(" | "),
    });
  }

  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    apply,
    valid_for_promotion: reportRows.filter((row) => row.status === "valid_for_promotion").length,
    already_promoted: alreadyPromoted,
    promoted,
    blocked: reportRows.filter((row) => row.status === "blocked").length,
    empty_staging: reportRows.filter((row) => row.status === "empty_staging").length,
    rows: reportRows,
  };
  const jsonPath = path.join(packDir, "validation-report.json");
  const csvPath = path.join(packDir, "validation-report.csv");
  const mdPath = path.join(packDir, "validation-report.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, REPORT_HEADERS, reportRows);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        mode: apply ? "apply" : "dry-run",
        valid_for_promotion: report.valid_for_promotion,
        already_promoted: report.already_promoted,
        promoted,
        blocked: report.blocked,
        empty_staging: report.empty_staging,
        report_json: relative(root, jsonPath),
        report_md: relative(root, mdPath),
      },
      null,
      2
    )
  );

  if (
    (hasFlag("--fail-on-blocked") && report.blocked > 0) ||
    (hasFlag("--fail-on-empty-staging") && report.empty_staging > 0) ||
    (hasFlag("--fail-on-none-valid") && report.valid_for_promotion === 0 && report.promoted === 0 && report.already_promoted === 0)
  ) {
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
