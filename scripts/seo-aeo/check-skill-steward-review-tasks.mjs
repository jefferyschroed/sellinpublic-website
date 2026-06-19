#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-20";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeCandidate(root) {
  const filePath = path.join(root, "research/daily-content-plan", RUN_DATE, "skill-steward-fixture.md");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `# Skill Steward Fixture

\`\`\`yaml
learning_candidate:
  candidate_id: "fixture-skill-review"
  date: "${RUN_DATE}"
  source_type: analytics
  source_path: "research/daily-content-plan/${RUN_DATE}/analytics-feedback-fixture.md"
  observed_problem: "Analytics feedback was dispatched before evidence was available."
  affected_workflow: "analytics feedback dispatch readiness"
  target_skill: "docs/seo-aeo/daily-operating-system.md"
  root_cause: "Dispatch readiness did not require a signal-bearing evidence window."
  evidence:
    - "First repeated no-data analytics artifact."
    - "Second repeated no-data analytics artifact."
  repeat_count: 2
  reusability_classification: reusable_process_change
  proposed_change: "Add a pre-dispatch evidence readiness check for Analytics Feedback."
  risk: "Could skip useful audit-only no-data checks if no override is available."
  reviewer: "Codex"
\`\`\`
`
  );
  const sourcePath = path.join(root, "research/daily-content-plan", RUN_DATE, "analytics-feedback-fixture.md");
  fs.writeFileSync(sourcePath, "Fixture source evidence.\n");
  return `research/daily-content-plan/${RUN_DATE}/skill-steward-fixture.md`;
}

function writeCloseout(root, candidatePath, validationStatus = "valid") {
  const outputDir = path.join(root, "automation-runs", RUN_DATE);
  ensureDir(outputDir);
  fs.writeFileSync(
    path.join(outputDir, "skill-steward-closeout.json"),
    `${JSON.stringify(
      {
        run_date: RUN_DATE,
        decision: validationStatus === "valid" ? "review_valid_learning_candidates" : "no_skill_change_proposed",
        learning_candidate_files: [candidatePath],
        valid_candidate_count: validationStatus === "valid" ? 1 : 0,
        invalid_candidate_count: validationStatus === "valid" ? 0 : 1,
        validations: [
          {
            file: candidatePath,
            status: validationStatus,
            exit_code: validationStatus === "valid" ? 0 : 1,
            output: validationStatus,
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

function runBuilder(repo, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/build-skill-steward-review-tasks.mjs"), "--date", RUN_DATE],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`builder failed: ${output}`);
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-skill-steward-review-tasks-"));
  try {
    const candidatePath = writeCandidate(tempRoot);
    writeCloseout(tempRoot, candidatePath);
    const output = runBuilder(repo, tempRoot);
    assert(output.status === "tasks_ready", `expected tasks_ready, got ${output.status}`);
    assert(output.task_count === 1, `expected one task, got ${output.task_count}`);

    const taskDir = path.join(tempRoot, "automation-runs", RUN_DATE, "skill-steward-review-tasks");
    const tasks = JSON.parse(fs.readFileSync(path.join(taskDir, "tasks.json"), "utf8"));
    assert(tasks.task_count === 1, `expected manifest count 1, got ${tasks.task_count}`);
    const task = tasks.tasks[0];
    assert(task.candidate_id === "fixture-skill-review", `unexpected candidate_id ${task.candidate_id}`);
    assert(task.allowed_use === "process_learning_review_only", "expected process_learning_review_only allowed use.");
    assert(task.source_path === `research/daily-content-plan/${RUN_DATE}/analytics-feedback-fixture.md`, `unexpected source_path ${task.source_path}`);
    assert(task.review_family === "analytics_feedback_dispatch_readiness", `unexpected review_family ${task.review_family}`);
    assert(task.target_skill === "docs/seo-aeo/daily-operating-system.md", `unexpected target_skill ${task.target_skill}`);
    assert(task.status === "not_started", `expected not_started, got ${task.status}`);

    const prompt = fs.readFileSync(path.join(tempRoot, task.prompt_path), "utf8");
    assert(prompt.includes("Report only"), "expected report-only write scope in prompt.");
    assert(prompt.includes("Do not edit .codex/skills"), "expected prompt to forbid skill edits.");
    assert(prompt.includes("Do not run write-skill-steward-closeout.mjs"), "expected prompt to forbid write scripts.");
    assert(prompt.includes("Human approval remains required"), "expected prompt to require human approval.");
    assert(prompt.includes("node scripts/seo-aeo/check-skill-learning.mjs"), "expected prompt to require validator command.");

    const taskCsv = parseCsv(fs.readFileSync(path.join(taskDir, "tasks.csv"), "utf8"));
    assert(taskCsv.rows[0].allowed_use === "process_learning_review_only", "expected CSV allowed_use process_learning_review_only.");

    ensureDir(path.dirname(path.join(tempRoot, task.report_path)));
    fs.writeFileSync(
      path.join(tempRoot, task.report_path),
      `# Skill Steward Review: fixture-skill-review

status: blocked_needs_human_review
task_id: ${task.task_id}
candidate_id: fixture-skill-review
candidate_path: ${candidatePath}
target_skill: docs/seo-aeo/daily-operating-system.md
rows_added: 0
patch_applied: false
human_approval_required: true
blocked_reason: fixture review only
`
    );
    runBuilder(repo, tempRoot);
    const withReport = JSON.parse(fs.readFileSync(path.join(taskDir, "tasks.json"), "utf8"));
    assert(withReport.report_present_count === 1, `expected report_present_count 1, got ${withReport.report_present_count}`);
    assert(withReport.tasks[0].status === "blocked_needs_human_review", `expected report status, got ${withReport.tasks[0].status}`);

    writeCloseout(tempRoot, candidatePath, "invalid");
    const empty = runBuilder(repo, tempRoot);
    assert(empty.status === "no_valid_learning_candidates", `expected no_valid_learning_candidates, got ${empty.status}`);
    assert(empty.task_count === 0, `expected zero tasks, got ${empty.task_count}`);

    console.log(JSON.stringify({ ok: true, fixture: "skill-steward-review-tasks" }, null, 2));
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
