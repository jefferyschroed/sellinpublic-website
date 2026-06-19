#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-20";
const CAPTURE_HEADERS = [
  "run_date",
  "capture_status",
  "capture_id",
  "query_set_id",
  "query_set_version",
  "query_id",
  "query",
  "surface",
  "target_page_url",
  "intent",
  "priority",
  "latest_capture_date",
  "reviewed_match_count",
  "operator_instruction",
  "allowed_use",
];
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

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeQuerySet(root) {
  const filePath = path.join(root, "docs/seo-aeo/ai-citation-query-set.json");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        schema_version: "1.0",
        query_set_id: "fixture-ai-citation",
        query_set_version: RUN_DATE,
        status: "active",
        surfaces: [{ surface_id: "chatgpt", active: true }],
        queries: [1, 2, 3, 4, 5].map((index) => ({
          query_id: `q${index}`,
          query: `fixture ai citation query ${index}`,
          target_page_url: `https://sellinpublic.co/blog/example-${index}/`,
          active: true,
        })),
      },
      null,
      2
    )}\n`
  );
}

function captureRow(index) {
  return {
    run_date: RUN_DATE,
    capture_status: "missing_capture",
    capture_id: `q${index}:chatgpt`,
    query_set_id: "fixture-ai-citation",
    query_set_version: RUN_DATE,
    query_id: `q${index}`,
    query: `fixture ai citation query ${index}`,
    surface: "chatgpt",
    target_page_url: `https://sellinpublic.co/blog/example-${index}/`,
    intent: "fixture",
    priority: "core",
    latest_capture_date: "",
    reviewed_match_count: "",
    operator_instruction: "Fixture capture row.",
    allowed_use: "visibility_monitoring_only",
  };
}

function writeCapturePack(root) {
  const filePath = path.join(root, "automation-runs", RUN_DATE, "ai-citation-capture-pack.csv");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(CAPTURE_HEADERS, [1, 2, 3, 4, 5].map(captureRow)));
}

function runCommand(repo, tempRoot, script, args = []) {
  return spawnSync(process.execPath, [path.join(repo, "scripts/seo-aeo", script), ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: process.env,
  });
}

function runBuilder(repo, tempRoot) {
  const result = runCommand(repo, tempRoot, "build-ai-citation-capture-tasks.mjs", ["--date", RUN_DATE]);
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`task builder failed: ${output}`);
}

function readTasks(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "automation-runs", RUN_DATE, "ai-citation-capture-tasks", "tasks.json"), "utf8")
  ).tasks;
}

function reportFor(task, status, rowsAdded = 0) {
  const source = `# AI Citation Capture: ${task.capture_id}

status: ${status}
capture_id: ${task.capture_id}
query_id: ${task.query_id}
surface: ${task.surface}
rows_added: ${rowsAdded}
row_csv_path: ${task.row_csv_path}
blocked_reason: ${status.startsWith("blocked") ? "fixture blocked" : ""}

## Observation

Fixture observation.

## Recommended Action

monitor

## Evidence Boundary

Rows are visibility monitoring only.
`;
  return source;
}

function validRow(task, overrides = {}) {
  return {
    capture_date: RUN_DATE,
    query_set_id: task.query_set_id,
    query_set_version: task.query_set_version,
    query_id: task.query_id,
    query: task.query,
    surface: task.surface,
    capture_method: task.capture_method,
    source_export_id: `${task.task_id}-manual-capture`,
    source_file: task.row_csv_path,
    captured_by: "ai-citation-capture-subagent",
    reviewer: "qa",
    target_page_url: task.target_page_url,
    cited_url: "",
    cited_domain: "",
    is_sell_in_public: "false",
    citation_position: "",
    answer_angle: "Fixture answer angle.",
    answer_accuracy: "accurate",
    competitors_cited: "example.com",
    missing_angle: "Fixture missing angle.",
    recommended_action: "monitor",
    notes: `capture_id=${task.capture_id}; fixture completed observation.`,
    ...overrides,
  };
}

function writeReport(root, task, status, rowsAdded = 0) {
  const filePath = path.join(root, task.report_path);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, reportFor(task, status, rowsAdded));
}

function writeRow(root, task, rows) {
  const filePath = path.join(root, task.row_csv_path);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(IMPORT_HEADERS, rows));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-ai-citation-row-staging-"));
  try {
    writeQuerySet(tempRoot);
    writeCapturePack(tempRoot);
    runBuilder(repo, tempRoot);
    const tasks = readTasks(tempRoot);
    const byQuery = new Map(tasks.map((task) => [task.query_id, task]));

    writeReport(tempRoot, byQuery.get("q1"), "captured_observation", 1);
    writeRow(tempRoot, byQuery.get("q1"), [validRow(byQuery.get("q1"))]);

    writeReport(tempRoot, byQuery.get("q2"), "blocked_access_required", 0);

    writeReport(tempRoot, byQuery.get("q3"), "captured_observation", 1);

    writeRow(tempRoot, byQuery.get("q4"), [validRow(byQuery.get("q4"))]);

    writeReport(tempRoot, byQuery.get("q5"), "captured_observation", 1);
    writeRow(tempRoot, byQuery.get("q5"), [validRow(byQuery.get("q5")), validRow(byQuery.get("q5"))]);

    let result = runCommand(repo, tempRoot, "stage-ai-citation-capture-rows.mjs", ["--date", RUN_DATE, "--apply"]);
    let output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected staging to complete non-strict. Output: ${output}`);
    const staging = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-capture-row-staging.json"), "utf8"));
    assert(staging.status === "blocked_invalid_rows", `expected blocked_invalid_rows, got ${staging.status}`);
    assert(staging.valid_completed_rows === 1, `expected one valid row, got ${staging.valid_completed_rows}`);
    assert(staging.blocked_reports === 1, `expected one blocked report, got ${staging.blocked_reports}`);
    assert(staging.row_blockers === 3, `expected three row blockers, got ${staging.row_blockers}`);
    assert(!fs.existsSync(path.join(tempRoot, "imports", "ai-citations", `${RUN_DATE}-ai-citation-capture-tasks.csv`)), "mixed blockers must not write aggregate import CSV.");

    result = runCommand(repo, tempRoot, "stage-ai-citation-capture-rows.mjs", ["--date", RUN_DATE, "--strict"]);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 1, `expected strict staging to fail on row blockers. Output: ${output}`);

    fs.rmSync(path.join(tempRoot, byQuery.get("q3").report_path), { force: true });
    fs.rmSync(path.join(tempRoot, byQuery.get("q4").row_csv_path), { force: true });
    fs.rmSync(path.join(tempRoot, byQuery.get("q5").report_path), { force: true });
    fs.rmSync(path.join(tempRoot, byQuery.get("q5").row_csv_path), { force: true });

    result = runCommand(repo, tempRoot, "stage-ai-citation-capture-rows.mjs", ["--date", RUN_DATE, "--apply"]);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected clean staging to complete. Output: ${output}`);
    const cleanStaging = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-capture-row-staging.json"), "utf8"));
    assert(cleanStaging.status === "staged_valid_rows", `expected staged_valid_rows, got ${cleanStaging.status}`);
    assert(cleanStaging.valid_completed_rows === 1, `expected one clean valid row, got ${cleanStaging.valid_completed_rows}`);
    assert(cleanStaging.row_blockers === 0, `expected zero clean row blockers, got ${cleanStaging.row_blockers}`);

    const importCsv = parseCsv(fs.readFileSync(path.join(tempRoot, "imports", "ai-citations", `${RUN_DATE}-ai-citation-capture-tasks.csv`), "utf8"));
    assert(importCsv.rows.length === 1, `expected one staged import row, got ${importCsv.rows.length}`);
    assert(importCsv.rows[0].query_id === "q1", `expected q1 staged row, got ${importCsv.rows[0].query_id}`);

    result = runCommand(repo, tempRoot, "import-analytics-exports.mjs", ["--date", RUN_DATE, "--strict", "--dry-run"]);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected strict import dry-run to accept staged valid row. Output: ${output}`);

    console.log(JSON.stringify({ ok: true, fixture: "ai-citation-capture-row-staging" }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
