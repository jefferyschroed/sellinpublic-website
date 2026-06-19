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

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeCapturePack(root, rows) {
  const filePath = path.join(root, "automation-runs", RUN_DATE, "ai-citation-capture-pack.csv");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(CAPTURE_HEADERS, rows));
}

function captureRow(overrides = {}) {
  return {
    run_date: RUN_DATE,
    capture_status: "missing_capture",
    capture_id: "q1:chatgpt",
    query_set_id: "fixture-ai-citation",
    query_set_version: "2099-01-20",
    query_id: "q1",
    query: "what is employee generated content",
    surface: "chatgpt",
    target_page_url: "https://sellinpublic.co/blog/example/",
    intent: "definition",
    priority: "core",
    latest_capture_date: "",
    reviewed_match_count: "",
    operator_instruction:
      "Manually review this exact query on this surface. Do not use unofficial scraping or cite the answer as factual source evidence.",
    allowed_use: "visibility_monitoring_only",
    ...overrides,
  };
}

function runBuilder(repo, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/build-ai-citation-capture-tasks.mjs"), "--date", RUN_DATE],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`task builder failed: ${output}`);
  return JSON.parse(output);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-ai-citation-capture-tasks-"));
  try {
    writeCapturePack(tempRoot, [captureRow()]);
    const first = runBuilder(repo, tempRoot);
    assert(first.status === "tasks_ready", `expected tasks_ready, got ${first.status}`);
    assert(first.task_count === 1, `expected one task, got ${first.task_count}`);

    const outputDir = path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-capture-tasks");
    const tasks = readJson(path.join(outputDir, "tasks.json"));
    assert(tasks.task_count === 1, `expected task manifest count 1, got ${tasks.task_count}`);
    assert(tasks.completed_row_count === 0, `expected zero completed rows, got ${tasks.completed_row_count}`);
    const task = tasks.tasks[0];
    assert(task.task_id === "ai-citation-q1-chatgpt", `unexpected task_id ${task.task_id}.`);
    assert(task.capture_method === "manual_ai_answer_observation", `unexpected capture_method ${task.capture_method}.`);
    assert(task.status === "not_started", `expected not_started, got ${task.status}.`);
    assert(!fs.existsSync(path.join(tempRoot, task.row_csv_path)), "task builder must not create placeholder row CSVs.");

    const prompt = fs.readFileSync(path.join(tempRoot, task.prompt_path), "utf8");
    assert(prompt.includes("Do not scrape unofficial"), "expected prompt to forbid unofficial scraping.");
    assert(prompt.includes("Do not automate bulk answer-engine scraping"), "expected prompt to forbid bulk answer-engine scraping.");
    assert(prompt.includes("Do not cite answer-engine output as factual article evidence"), "expected prompt to enforce evidence boundary.");
    assert(prompt.includes("Do not create placeholder import rows"), "expected prompt to forbid placeholder row creation.");
    assert(prompt.includes("cited_url, missing_angle, or recommended_action"), "expected prompt to name importer signal fields.");
    assert(prompt.includes(task.row_csv_path), "expected prompt to include row CSV path.");

    const taskMarkdown = fs.readFileSync(path.join(outputDir, "tasks.md"), "utf8");
    assert(taskMarkdown.includes("Launch one subagent per task"), "expected task markdown to require one subagent per task.");
    assert(taskMarkdown.includes("intentionally does not create row CSV files"), "expected task markdown to document no-placeholder rule.");

    const taskCsv = parseCsv(fs.readFileSync(path.join(outputDir, "tasks.csv"), "utf8"));
    assert(taskCsv.rows[0].status === "not_started", "expected tasks.csv status not_started.");

    ensureDir(path.join(outputDir, "reports"));
    fs.writeFileSync(
      path.join(tempRoot, task.report_path),
      `# AI Citation Capture: ${task.capture_id}\n\nstatus: blocked_access_required\ncapture_id: ${task.capture_id}\nquery_id: ${task.query_id}\nsurface: ${task.surface}\nrows_added: 0\nrow_csv_path: ${task.row_csv_path}\nblocked_reason: login required\n`
    );
    runBuilder(repo, tempRoot);
    const blocked = readJson(path.join(outputDir, "tasks.json"));
    assert(blocked.tasks[0].status === "blocked_access_required", `expected blocked status, got ${blocked.tasks[0].status}.`);
    assert(blocked.completed_row_count === 0, `expected zero completed rows after blocked report, got ${blocked.completed_row_count}`);
    assert(!fs.existsSync(path.join(tempRoot, task.row_csv_path)), "blocked captures must not create row CSVs.");

    writeCapturePack(tempRoot, []);
    const empty = runBuilder(repo, tempRoot);
    assert(empty.status === "ready", `expected ready for empty pack, got ${empty.status}`);
    assert(empty.task_count === 0, `expected zero empty-pack tasks, got ${empty.task_count}`);

    console.log(JSON.stringify({ ok: true, fixture: "ai-citation-capture-tasks" }, null, 2));
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
