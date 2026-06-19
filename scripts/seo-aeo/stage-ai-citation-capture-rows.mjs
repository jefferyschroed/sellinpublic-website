#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJsonIfExists, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const IMPORT_HEADERS = [
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
];

const BLOCKED_STATUSES = new Set([
  "blocked_access_required",
  "blocked_surface_unavailable",
  "blocked_manual_review_needed",
]);
const CAPTURED_STATUS = "captured_observation";
const UNSAFE_CAPTURE_TEXT =
  /unofficial|network\s*(tab|response|scrap|capture)|devtools|developer\s*tools|hidden\s*quer(y|ies)|browser\s*traffic|traffic\s*capture|chatgpt\s*network|cookie|local\s*storage|session\s*storage|browser\s*storage|scrap(e|ing|ed|er)/i;

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

function markdownField(source, name) {
  const match = String(source || "").match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match ? String(match[1] || "").trim() : "";
}

function readReport(root, task) {
  const reportPath = path.join(root, task.report_path || "");
  if (!task.report_path || !fs.existsSync(reportPath)) {
    return {
      task_id: task.task_id,
      status: "not_started",
      rows_added: 0,
      row_csv_path: task.row_csv_path || "",
      report_path: task.report_path || "",
      blocked_reason: "",
    };
  }
  const source = fs.readFileSync(reportPath, "utf8");
  return {
    task_id: task.task_id,
    status: markdownField(source, "status") || "report_present_needs_review",
    rows_added: Number(markdownField(source, "rows_added") || 0),
    row_csv_path: markdownField(source, "row_csv_path") || task.row_csv_path || "",
    report_path: task.report_path || "",
    blocked_reason: markdownField(source, "blocked_reason"),
  };
}

function rowText(row) {
  return [
    row.capture_method,
    row.source_export_id,
    row.source_file,
    row.captured_by,
    row.reviewer,
    row.notes,
  ].join(" ");
}

function validateRow(task, report, parsed) {
  const issues = [];
  if (parsed.rows.length !== 1) issues.push(`expected_exactly_one_row_got_${parsed.rows.length}`);
  const missingHeaders = IMPORT_HEADERS.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length) issues.push(`missing_headers:${missingHeaders.join("|")}`);
  const row = { ...(parsed.rows[0] || {}) };
  if (!row.source_export_id) row.source_export_id = `ai-citation-task:${task.capture_id || task.task_id}:${task.run_date}`;
  if (!row.source_file) row.source_file = task.row_csv_path || "";

  const expected = {
    query_set_id: task.query_set_id || "",
    query_set_version: task.query_set_version || "",
    query_id: task.query_id || "",
    query: task.query || "",
    surface: task.surface || "",
    target_page_url: task.target_page_url || "",
    capture_method: task.capture_method || "",
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (expectedValue && String(row[field] || "").trim() !== expectedValue) issues.push(`${field}_mismatch`);
  }
  if (row.capture_date && row.capture_date !== task.run_date) issues.push("capture_date_mismatch");
  if (!row.capture_date) issues.push("missing_capture_date");
  if (!row.source_export_id || !row.source_file) issues.push("missing_source_provenance");
  if (!row.captured_by) issues.push("missing_captured_by");
  if (!row.reviewer) issues.push("missing_reviewer");
  if (!row.cited_url && !row.missing_angle && !row.recommended_action) {
    issues.push("missing_observation_detail");
  }
  if (UNSAFE_CAPTURE_TEXT.test(rowText(row))) issues.push("unsafe_capture_method");
  if (report.status !== CAPTURED_STATUS || Number(report.rows_added || 0) !== 1) {
    issues.push("row_without_captured_report");
  }

  return {
    row,
    issues,
  };
}

function evaluateTask(root, task) {
  const report = readReport(root, task);
  const rowPath = path.join(root, task.row_csv_path || "");
  const rowExists = Boolean(task.row_csv_path && fs.existsSync(rowPath));
  const result = {
    task_id: task.task_id,
    capture_id: task.capture_id || "",
    query_id: task.query_id || "",
    surface: task.surface || "",
    report_status: report.status,
    rows_added: report.rows_added,
    report_path: task.report_path || "",
    row_csv_path: task.row_csv_path || "",
    status: "not_started",
    issues: [],
    row: null,
  };

  if (report.status === "not_started") {
    if (rowExists) {
      result.status = "blocked_invalid_row";
      result.issues.push("row_without_report");
    }
    return result;
  }

  if (BLOCKED_STATUSES.has(report.status)) {
    result.status = "blocked_report";
    if (rowExists) {
      result.status = "blocked_invalid_row";
      result.issues.push("row_exists_for_blocked_report");
    }
    return result;
  }

  if (report.status !== CAPTURED_STATUS) {
    result.status = "blocked_report_needs_review";
    if (rowExists) result.issues.push("row_exists_for_unrecognized_report_status");
    return result;
  }

  if (Number(report.rows_added || 0) !== 1) {
    result.status = "blocked_invalid_row";
    result.issues.push("captured_report_rows_added_not_one");
  }
  if (!rowExists) {
    result.status = "blocked_invalid_row";
    result.issues.push("captured_report_missing_row_csv");
    return result;
  }
  if (report.row_csv_path && normalizePath(report.row_csv_path) !== normalizePath(task.row_csv_path || "")) {
    result.status = "blocked_invalid_row";
    result.issues.push("report_row_csv_path_mismatch");
  }

  const parsed = parseCsv(fs.readFileSync(rowPath, "utf8"));
  const validation = validateRow(task, report, parsed);
  result.issues.push(...validation.issues);
  if (result.issues.length) {
    result.status = "blocked_invalid_row";
    return result;
  }

  result.status = "valid_completed_row";
  result.row = validation.row;
  return result;
}

function writeMarkdown(filePath, report) {
  const taskLines = report.task_results.length
    ? report.task_results
        .map((task) => `- ${task.status}: ${task.task_id} ${task.surface}${task.issues.length ? `; issues: ${task.issues.join(" | ")}` : ""}`)
        .join("\n")
    : "- No tasks.";
  const markdown = `# AI Citation Capture Row Staging

Run date: ${report.run_date}
Status: ${report.status}
Mode: ${report.apply ? "apply" : "dry-run"}

## Summary

- Tasks: ${report.task_count}
- Valid completed rows: ${report.valid_completed_rows}
- Blocked reports: ${report.blocked_reports}
- Row blockers: ${report.row_blockers}
- Not started: ${report.not_started}
- Preview CSV: ${report.preview_csv || "n/a"}
- Import CSV: ${report.import_csv || "n/a"}

## Task Results

${taskLines}

## Rule

Only captured-observation reports with exactly one validated row are staged. Blocked, missing, malformed, premature, or placeholder rows stay quarantined in the task folder and are not copied into imports.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const apply = hasFlag("--apply");
  const strict = hasFlag("--strict");
  const taskPath = path.resolve(root, arg("--tasks", `automation-runs/${runDate}/ai-citation-capture-tasks/tasks.json`));
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const tasksReport = readJsonIfExists(taskPath);
  const tasks = Array.isArray(tasksReport.tasks) ? tasksReport.tasks : [];
  const taskResults = tasks.map((task) => evaluateTask(root, task));
  const validRows = taskResults.filter((task) => task.status === "valid_completed_row").map((task) => task.row);
  const rowBlockers = taskResults.filter((task) => task.status === "blocked_invalid_row" || task.status === "blocked_report_needs_review");
  const blockedReports = taskResults.filter((task) => task.status === "blocked_report");
  const notStarted = taskResults.filter((task) => task.status === "not_started");

  const previewCsvPath = path.join(outputDir, "ai-citation-capture-row-staging.preview.csv");
  if (validRows.length) writeCsvAtomic(previewCsvPath, IMPORT_HEADERS, validRows);
  else if (fs.existsSync(previewCsvPath)) fs.rmSync(previewCsvPath, { force: true });

  const importCsvPath = path.join(root, "imports", "ai-citations", `${runDate}-ai-citation-capture-tasks.csv`);
  let importCsv = "";
  if (apply && validRows.length && !rowBlockers.length) {
    writeCsvAtomic(importCsvPath, IMPORT_HEADERS, validRows);
    importCsv = relative(root, importCsvPath);
  }

  const status = validRows.length
    ? rowBlockers.length
      ? "blocked_invalid_rows"
      : "staged_valid_rows"
    : rowBlockers.length
      ? "blocked_invalid_rows"
      : "no_completed_rows";
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status,
    apply,
    task_batch_path: fs.existsSync(taskPath) ? relative(root, taskPath) : "",
    task_count: tasks.length,
    valid_completed_rows: validRows.length,
    blocked_reports: blockedReports.length,
    row_blockers: rowBlockers.length,
    not_started: notStarted.length,
    preview_csv: validRows.length ? relative(root, previewCsvPath) : "",
    import_csv: importCsv,
    task_results: taskResults.map((task) => ({
      task_id: task.task_id,
      capture_id: task.capture_id,
      query_id: task.query_id,
      surface: task.surface,
      status: task.status,
      report_status: task.report_status,
      rows_added: task.rows_added,
      report_path: task.report_path,
      row_csv_path: task.row_csv_path,
      issues: task.issues,
    })),
    rule:
      "Only captured-observation reports with exactly one validated row are staged. Task rows are monitoring data only and never factual article evidence.",
  };
  const jsonPath = path.join(outputDir, "ai-citation-capture-row-staging.json");
  const mdPath = path.join(outputDir, "ai-citation-capture-row-staging.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        ok: rowBlockers.length === 0,
        run_date: runDate,
        status,
        apply,
        valid_completed_rows: validRows.length,
        row_blockers: rowBlockers.length,
        blocked_reports: blockedReports.length,
        not_started: notStarted.length,
        preview_csv: report.preview_csv,
        import_csv: report.import_csv,
        report_json: relative(root, jsonPath),
        report_md: relative(root, mdPath),
      },
      null,
      2
    )
  );

  if (strict && rowBlockers.length) process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
