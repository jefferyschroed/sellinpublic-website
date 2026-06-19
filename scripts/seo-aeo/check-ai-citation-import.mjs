#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJsonIfExists, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const REPORT_HEADERS = ["file", "row", "status", "query_id", "surface", "issues", "warnings"];
const SAFE_CAPTURE_METHODS = new Set([
  "manual_serp_observation",
  "manual_search_observation",
  "manual_ai_answer_observation",
  "manual_ai_overview_observation",
  "official_ai_performance_export",
  "official_search_performance_export",
]);
const UNSAFE_CAPTURE_METHOD =
  /unofficial|network\s*(tab|response|scrap|capture)|devtools|developer\s*tools|hidden\s*quer(y|ies)|cookie|local\s*storage|session\s*storage|browser\s*storage|scrap(e|ing|ed|er)/i;
const SUPPLEMENTAL_SURFACES = new Set(["manual_url_check", "live_url_check"]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
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

function csvFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  if (!fs.statSync(dirPath).isDirectory()) throw new Error(`Import path is not a directory: ${dirPath}`);
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function activeQuerySet(root, filePath) {
  const querySet = readJsonIfExists(path.resolve(root, filePath));
  const querySetId = querySet.query_set_id || "";
  const querySetVersion = querySet.query_set_version || "";
  const activeSurfaces = new Set(
    (querySet.surfaces || []).filter((surface) => surface.active !== false).map((surface) => surface.surface_id)
  );
  const activeQueries = new Map(
    (querySet.queries || [])
      .filter((query) => query.active !== false)
      .map((query) => [query.query_id, query])
  );
  return { querySet, querySetId, querySetVersion, activeSurfaces, activeQueries };
}

function cell(row, header) {
  const found = Object.entries(row).find(([key]) => key.trim().toLowerCase() === header.trim().toLowerCase());
  return String(found?.[1] ?? "").trim();
}

function rowText(row) {
  return [
    cell(row, "source_export_id"),
    cell(row, "source_file"),
    cell(row, "capture_method"),
    cell(row, "captured_by"),
    cell(row, "reviewer"),
    cell(row, "reviewed_by"),
    cell(row, "notes"),
  ].join(" ");
}

function isSupplemental(row) {
  const surface = cell(row, "surface");
  return !cell(row, "query_set_id") && !cell(row, "query_set_version") && !cell(row, "query_id") && SUPPLEMENTAL_SURFACES.has(surface);
}

function validateRow(row, context) {
  const issues = [];
  const warnings = [];
  const querySetId = cell(row, "query_set_id");
  const querySetVersion = cell(row, "query_set_version");
  const queryId = cell(row, "query_id");
  const query = cell(row, "query");
  const surface = cell(row, "surface");
  const targetPageUrl = cell(row, "target_page_url");
  const sourceExportId = cell(row, "source_export_id");
  const sourceFile = cell(row, "source_file");
  const captureMethod = cell(row, "capture_method");
  const reviewer = cell(row, "reviewer") || cell(row, "reviewed_by");
  const notes = cell(row, "notes");

  if (isSupplemental(row)) {
    if (!sourceExportId || !sourceFile) issues.push("supplemental_missing_source_provenance");
    if (!reviewer) issues.push("supplemental_missing_reviewer");
    return { issues, warnings: [...warnings, "supplemental_not_part_of_fixed_query_set"], status: issues.length ? "invalid" : "supplemental" };
  }

  if (!querySetId) issues.push("missing_query_set_id");
  if (!querySetVersion) issues.push("missing_query_set_version");
  if (!queryId) issues.push("missing_query_id");
  if (!query) issues.push("missing_query");
  if (!surface) issues.push("missing_surface");
  if (!targetPageUrl) issues.push("missing_target_page_url");
  if (!sourceExportId || !sourceFile) issues.push("missing_source_provenance");
  if (!reviewer) issues.push("missing_reviewer");
  if (!captureMethod) issues.push("missing_capture_method");
  if (captureMethod && !SAFE_CAPTURE_METHODS.has(captureMethod)) issues.push("unsupported_capture_method");
  if (UNSAFE_CAPTURE_METHOD.test(rowText(row))) issues.push("unsafe_capture_method");

  if (querySetId && querySetId !== context.querySetId) issues.push("query_set_id_mismatch");
  if (querySetVersion && querySetVersion !== context.querySetVersion) issues.push("query_set_version_mismatch");
  if (surface && !context.activeSurfaces.has(surface)) issues.push("unsupported_surface");

  const expected = queryId ? context.activeQueries.get(queryId) : null;
  if (queryId && !expected) {
    issues.push("query_id_not_in_active_query_set");
  } else if (expected) {
    if (query && query !== expected.query) issues.push("query_text_mismatch");
    if (targetPageUrl && targetPageUrl !== expected.target_page_url) issues.push("target_page_url_mismatch");
  }

  if (!cell(row, "cited_url") && !cell(row, "answer_angle") && !cell(row, "missing_angle") && !cell(row, "recommended_action")) {
    issues.push("missing_observation_detail");
  }
  if (!notes) warnings.push("missing_notes");

  return { issues, warnings, status: issues.length ? "invalid" : "valid" };
}

function writeMarkdown(filePath, report) {
  const rows = report.rows
    .map((row) => `- ${row.status}: ${row.file}:${row.row} ${row.query_id || "no-query-id"} ${row.surface || "no-surface"}${row.issues ? `; issues: ${row.issues}` : ""}${row.warnings ? `; warnings: ${row.warnings}` : ""}`)
    .join("\n");
  const markdown = `# AI Citation Import Preflight

Run date: ${report.run_date}
Status: ${report.status}
Query set: ${report.query_set_id} ${report.query_set_version}

## Summary

- Valid rows: ${report.valid_rows}
- Supplemental rows: ${report.supplemental_rows}
- Invalid rows: ${report.invalid_rows}
- Files checked: ${report.files_checked}

## Rows

${rows || "- No import rows found."}

## Rule

Rows for the fixed AI-citation query set must match the active query set, active surfaces, reviewer attribution, source provenance, and approved/manual or official-export capture methods. Supplemental URL checks can be logged separately but do not count toward fixed query-set coverage.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const strict = hasFlag("--strict");
  const inputDir = path.resolve(root, arg("--input-dir", "imports/ai-citations"));
  const querySetPath = arg("--query-set", "docs/seo-aeo/ai-citation-query-set.json");
  const context = activeQuerySet(root, querySetPath);
  if (!context.querySetId || !context.querySetVersion) throw new Error(`Invalid AI citation query set: ${querySetPath}`);

  const reportRows = [];
  for (const filePath of csvFiles(inputDir)) {
    const parsed = parseCsv(fs.readFileSync(filePath, "utf8"));
    parsed.rows.forEach((row, index) => {
      const validation = validateRow(row, context);
      reportRows.push({
        file: relative(root, filePath),
        row: index + 2,
        status: validation.status,
        query_id: cell(row, "query_id"),
        surface: cell(row, "surface"),
        issues: validation.issues.join(" | "),
        warnings: validation.warnings.join(" | "),
      });
    });
  }

  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: reportRows.some((row) => row.status === "invalid") ? "blocked" : "ready",
    strict,
    query_set_id: context.querySetId,
    query_set_version: context.querySetVersion,
    query_set_path: querySetPath,
    input_dir: relative(root, inputDir),
    files_checked: new Set(reportRows.map((row) => row.file)).size,
    valid_rows: reportRows.filter((row) => row.status === "valid").length,
    supplemental_rows: reportRows.filter((row) => row.status === "supplemental").length,
    invalid_rows: reportRows.filter((row) => row.status === "invalid").length,
    rows: reportRows,
  };
  const jsonPath = path.join(outputDir, "ai-citation-import-preflight.json");
  const csvPath = path.join(outputDir, "ai-citation-import-preflight.csv");
  const mdPath = path.join(outputDir, "ai-citation-import-preflight.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, REPORT_HEADERS, reportRows);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        ok: report.status === "ready",
        status: report.status,
        valid_rows: report.valid_rows,
        supplemental_rows: report.supplemental_rows,
        invalid_rows: report.invalid_rows,
        report_json: relative(root, jsonPath),
        report_md: relative(root, mdPath),
      },
      null,
      2
    )
  );
  if (strict && report.status !== "ready") process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
