#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const TASK_HEADERS = [
  "run_date",
  "task_id",
  "capture_id",
  "capture_status",
  "query_set_id",
  "query_set_version",
  "query_id",
  "query",
  "surface",
  "intent",
  "priority",
  "target_page_url",
  "capture_method",
  "report_path",
  "row_csv_path",
  "prompt_path",
  "status",
  "allowed_use",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function captureMethodForSurface(surface) {
  if (surface === "google_search") return "manual_serp_observation";
  if (surface === "google_ai_overview") return "manual_ai_overview_observation";
  if (["chatgpt", "perplexity", "gemini", "bing_copilot"].includes(surface)) return "manual_ai_answer_observation";
  return "manual_ai_answer_observation";
}

function taskIdFor(row) {
  return `ai-citation-${slugify(row.capture_id || `${row.query_id}-${row.surface}`)}`;
}

function markdownField(source, name) {
  const match = String(source || "").match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match ? String(match[1] || "").trim() : "";
}

function reportStatus(root, task) {
  const reportPath = path.join(root, task.report_path);
  if (!fs.existsSync(reportPath)) return "not_started";
  const source = fs.readFileSync(reportPath, "utf8");
  return markdownField(source, "status") || "report_present_needs_review";
}

function promptFor(task) {
  return `You are not alone in the codebase; do not revert or overwrite edits by others.

Use this AI citation monitoring contract.

Task ID: ${task.task_id}
Capture ID: ${task.capture_id}
Run date: ${task.run_date}
Query set: ${task.query_set_id} ${task.query_set_version}
Query: ${task.query}
Surface: ${task.surface}
Target page: ${task.target_page_url}
Allowed use: visibility_monitoring_only

Write scope:
- Report: ${task.report_path}
- Optional one-row import CSV only if you complete the capture: ${task.row_csv_path}

Hard boundaries:
- Do not scrape unofficial ChatGPT, Claude, Perplexity, Gemini, Google, or Bing network responses.
- Do not automate bulk answer-engine scraping.
- Do not cite answer-engine output as factual article evidence.
- Do not copy long answer text. Summarize the answer angle and missing angle briefly.
- Do not edit analytics/ai_citation_log.csv, imports/ai-citations, blog files, packets, feeds, sitemaps, or publish artifacts.
- If login, CAPTCHA, paid access, consent, or unclear account state blocks a safe manual observation, write a blocked report instead of guessing.

Task:
Manually review the exact query on the named surface, using normal browser interaction or an official export only. Record whether Sell In Public or the target page is cited, the cited URL/domain if visible, citation position if visible, competing domains cited, answer angle, accuracy, missing angle, and recommended action.

Report format:
\`\`\`md
# AI Citation Capture: ${task.capture_id}

status: captured_observation | blocked_access_required | blocked_surface_unavailable | blocked_manual_review_needed
capture_id: ${task.capture_id}
query_id: ${task.query_id}
surface: ${task.surface}
rows_added: 0 | 1
row_csv_path: ${task.row_csv_path}
blocked_reason:

## Observation

## Recommended Action

## Evidence Boundary

Rows are visibility monitoring only. They do not validate demand or support factual article claims.
\`\`\`

If captured, create ${task.row_csv_path} with exactly one CSV row using the standard ai_citation_log import headers. The row must include source_export_id, source_file, captured_by, reviewer, and at least one importer signal field: cited_url, missing_angle, or recommended_action. Leave blocked captures without a row CSV. Do not create placeholder import rows.`;
}

function writeMarkdown(filePath, report) {
  const taskLines = report.tasks.length
    ? report.tasks
        .map(
          (task, index) => `${index + 1}. \`${task.task_id}\` - ${task.query} on ${task.surface}
   - Report: \`${task.report_path}\`
   - Prompt: \`${task.prompt_path}\``
        )
        .join("\n")
    : "- None. No AI citation capture tasks are needed.";

  const markdown = `# AI Citation Capture Tasks

Run date: ${report.run_date}
Status: ${report.status}
Capture pack: \`${report.capture_pack_csv}\`

## Summary

- Tasks: ${report.task_count}
- Not started: ${report.not_started_count}
- Completed or blocked reports present: ${report.report_present_count}
- Prompts directory: \`${report.prompts_dir}\`
- Reports directory: \`${report.reports_dir}\`
- Row CSV directory: \`${report.rows_dir}\`

## Tasks

${taskLines}

## Rule

Launch one subagent per task when completing AI citation monitoring. These tasks are monitoring inputs only: they do not validate demand, support factual article claims, generate content, publish pages, or edit analytics directly. The task generator intentionally does not create row CSV files; those files are written only by capture subagents after completed observations.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const capturePackPath = path.resolve(root, arg("--capture-pack", `automation-runs/${runDate}/ai-citation-capture-pack.csv`));
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate, "ai-citation-capture-tasks"));
  const promptsDir = ensureDir(path.join(outputDir, "prompts"));
  const reportsDir = ensureDir(path.join(outputDir, "reports"));
  const rowsDir = ensureDir(path.join(outputDir, "rows"));
  const capturePack = readCsv(capturePackPath);
  const sourceRows = capturePack.rows.filter((row) => String(row.capture_id || "").trim());
  const tasks = sourceRows.map((row) => {
    const taskId = taskIdFor(row);
    const task = {
      run_date: runDate,
      task_id: taskId,
      capture_id: row.capture_id || "",
      capture_status: row.capture_status || "",
      query_set_id: row.query_set_id || "",
      query_set_version: row.query_set_version || "",
      query_id: row.query_id || "",
      query: row.query || "",
      surface: row.surface || "",
      intent: row.intent || "",
      priority: row.priority || "",
      target_page_url: row.target_page_url || "",
      capture_method: captureMethodForSurface(row.surface || ""),
      report_path: relative(root, path.join(reportsDir, `${taskId}.md`)),
      row_csv_path: relative(root, path.join(rowsDir, `${taskId}.csv`)),
      prompt_path: relative(root, path.join(promptsDir, `${taskId}.prompt.md`)),
      status: "not_started",
      allowed_use: row.allowed_use || "visibility_monitoring_only",
    };
    task.status = reportStatus(root, task);
    return task;
  });

  for (const task of tasks) {
    fs.writeFileSync(path.join(root, task.prompt_path), `${promptFor(task).trim()}\n`);
  }

  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: tasks.length ? "tasks_ready" : "ready",
    capture_pack_csv: relative(root, capturePackPath),
    output_dir: relative(root, outputDir),
    prompts_dir: relative(root, promptsDir),
    reports_dir: relative(root, reportsDir),
    rows_dir: relative(root, rowsDir),
    task_count: tasks.length,
    not_started_count: tasks.filter((task) => task.status === "not_started").length,
    report_present_count: tasks.filter((task) => task.status !== "not_started").length,
    completed_row_count: tasks.filter((task) => fs.existsSync(path.join(root, task.row_csv_path))).length,
    tasks,
    rule:
      "AI citation capture tasks are manual or official-export monitoring work only. They do not validate demand, support factual claims, generate content, or publish pages. Row CSV files are not scaffolded; capture subagents create them only after completed observations.",
  };

  const jsonPath = path.join(outputDir, "tasks.json");
  const csvPath = path.join(outputDir, "tasks.csv");
  const markdownPath = path.join(outputDir, "tasks.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, TASK_HEADERS, tasks);
  writeMarkdown(markdownPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        status: report.status,
        task_count: report.task_count,
        not_started_count: report.not_started_count,
        tasks_json: relative(root, jsonPath),
        tasks_csv: relative(root, csvPath),
        tasks_md: relative(root, markdownPath),
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
