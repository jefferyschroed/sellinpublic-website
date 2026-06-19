#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJsonIfExists, writeJsonAtomic } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const TASK_HEADERS = [
  "run_date",
  "task_id",
  "candidate_id",
  "candidate_path",
  "validation_status",
  "source_type",
  "source_path",
  "target_skill",
  "review_family",
  "proposed_change",
  "report_path",
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

function field(source, name) {
  const match = String(source || "").match(new RegExp(`^\\s*${name}:\\s*['"]?([^'"\\r\\n]+)`, "m"));
  return match ? String(match[1] || "").trim() : "";
}

function markdownField(source, name) {
  const match = String(source || "").match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match ? String(match[1] || "").trim() : "";
}

function taskIdFor(candidatePath, candidate) {
  return `skill-review-${slugify(candidate.candidate_id || path.basename(candidatePath, path.extname(candidatePath)))}`;
}

function reviewFamily(candidate) {
  const text = `${candidate.candidate_id || ""} ${candidate.observed_problem || ""} ${candidate.proposed_change || ""}`.toLowerCase();
  if (text.includes("skill-validator") || text.includes("validator")) return "repo_local_skill_validator";
  if (text.includes("candidate-identity") || text.includes("identity") || text.includes("handoff")) {
    return "candidate_identity_handoff_reconciliation";
  }
  if (text.includes("analytics") && text.includes("dispatch")) return "analytics_feedback_dispatch_readiness";
  if (text.includes("section") || text.includes("faq")) return "section_faq_dispatch_readiness";
  return slugify(candidate.target_skill || candidate.source_type || "general_process_learning").replaceAll("-", "_");
}

function readCandidate(root, candidatePath) {
  const absolutePath = path.resolve(root, candidatePath);
  const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
  return {
    candidate_id: field(source, "candidate_id"),
    source_type: field(source, "source_type"),
    target_skill: field(source, "target_skill"),
    source_path: field(source, "source_path"),
    observed_problem: field(source, "observed_problem"),
    proposed_change: field(source, "proposed_change"),
    risk: field(source, "risk"),
  };
}

function reportStatus(root, task) {
  const reportPath = path.join(root, task.report_path);
  if (!fs.existsSync(reportPath)) return "not_started";
  const source = fs.readFileSync(reportPath, "utf8");
  return markdownField(source, "status") || "report_present_needs_review";
}

function promptFor(task) {
  return `You are not alone in the codebase; do not revert or overwrite edits by others.

Use this governed Skill Steward review contract.

Task ID: ${task.task_id}
Run date: ${task.run_date}
Candidate ID: ${task.candidate_id || "missing"}
Candidate file: ${task.candidate_path}
Source type: ${task.source_type || "missing"}
Source path: ${task.source_path || "missing"}
Target skill/SOP: ${task.target_skill || "missing"}
Review family: ${task.review_family || "general"}
Proposed change: ${task.proposed_change || "missing"}

Write scope:
- Report only: ${task.report_path}

Hard boundaries:
- Do not edit .codex/skills, ~/.codex/skills, docs, scripts, content packets, analytics files, blog output, feeds, sitemap, or publishing artifacts.
- Do not promote a repo-local skill or global skill.
- Do not apply a SOP, prompt, or skill patch.
- Do not run write-skill-steward-closeout.mjs, content-runner.mjs, dispatch builders, generators, publish commands, promotion --apply commands, or any script that writes repo artifacts.
- Do not treat analytics keywords, transient rankings, or one-off copy issues as writing-skill rules.
- Do not approve your own proposed patch for promotion. Human approval remains required.

Task:
Review only this candidate independently. Read only its candidate file, its candidate source_path/evidence files, the named target skill/SOP, and validator scripts. Decide whether it is a reusable process improvement, a one-off issue, a duplicate/superseded candidate, or blocked by weak evidence. Re-run:

\`\`\`sh
node scripts/seo-aeo/check-skill-learning.mjs --file ${task.candidate_path}
\`\`\`

Then inspect the candidate's evidence and source_path if local. If you recommend a future patch, write only a minimal patch proposal and forward-test plan in your report. Do not edit the target file.

Report format:
\`\`\`md
# Skill Steward Review: ${task.candidate_id || task.task_id}

status: approve_for_human_review | reject_one_off_or_unsupported | merge_as_duplicate_reinforcement | blocked_missing_evidence | blocked_needs_human_review
task_id: ${task.task_id}
candidate_id: ${task.candidate_id || ""}
candidate_path: ${task.candidate_path}
source_path: ${task.source_path || ""}
target_skill: ${task.target_skill || ""}
review_family: ${task.review_family || ""}
rows_added: 0
patch_applied: false
human_approval_required: true
blocked_reason:

## Evidence Review

## Reusability Decision

## Minimal Patch Proposal

## Forward Test Plan

## Risks

## Boundary

No skill, SOP, script, content, analytics, generation, publishing, or global Codex change was applied by this review.
\`\`\`
`;
}

function writeMarkdown(filePath, report) {
  const taskLines = report.tasks.length
    ? report.tasks
        .map(
          (task, index) => `${index + 1}. \`${task.task_id}\` - ${task.target_skill || "missing target"} (${task.source_type || "missing source"})
   - Candidate: \`${task.candidate_path}\`
   - Prompt: \`${task.prompt_path}\`
   - Report: \`${task.report_path}\`
   - Status: ${task.status}`
        )
        .join("\n")
    : "- None. No valid learning candidates require review.";

  const markdown = `# Skill Steward Review Tasks

Run date: ${report.run_date}
Status: ${report.status}
Closeout: \`${report.closeout_path}\`

## Summary

- Tasks: ${report.task_count}
- Not started: ${report.not_started_count}
- Report present: ${report.report_present_count}
- Prompts directory: \`${report.prompts_dir}\`
- Reports directory: \`${report.reports_dir}\`

## Tasks

${taskLines}

## Rule

Launch one subagent per learning candidate. Do not merge review families until after all per-candidate reports exist. These reviews are report-only and cannot change repo-local skills, global skills, SOP docs, scripts, content, analytics, publishing, or generated blog output. Human approval is required before any future patch or promotion.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const closeoutPath = path.resolve(root, arg("--closeout", `automation-runs/${runDate}/skill-steward-closeout.json`));
  const closeout = readJsonIfExists(closeoutPath);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate, "skill-steward-review-tasks"));
  const promptsDir = ensureDir(path.join(outputDir, "prompts"));
  const reportsDir = ensureDir(path.join(outputDir, "reports"));
  const validFiles = new Set((closeout.validations || []).filter((item) => item.status === "valid").map((item) => item.file));
  const candidatePaths = (closeout.learning_candidate_files || []).filter((candidatePath) => validFiles.has(candidatePath));

  const tasks = candidatePaths.map((candidatePath) => {
    const candidate = readCandidate(root, candidatePath);
    const taskId = taskIdFor(candidatePath, candidate);
    const task = {
      run_date: runDate,
      task_id: taskId,
      candidate_id: candidate.candidate_id || "",
      candidate_path: candidatePath,
      validation_status: "valid",
      source_type: candidate.source_type || "",
      source_path: candidate.source_path || "",
      target_skill: candidate.target_skill || "",
      review_family: reviewFamily(candidate),
      proposed_change: candidate.proposed_change || "",
      report_path: relative(root, path.join(reportsDir, `${taskId}.md`)),
      prompt_path: relative(root, path.join(promptsDir, `${taskId}.prompt.md`)),
      status: "not_started",
      allowed_use: "process_learning_review_only",
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
    status: tasks.length ? "tasks_ready" : "no_valid_learning_candidates",
    closeout_path: fs.existsSync(closeoutPath) ? relative(root, closeoutPath) : "",
    output_dir: relative(root, outputDir),
    prompts_dir: relative(root, promptsDir),
    reports_dir: relative(root, reportsDir),
    task_count: tasks.length,
    not_started_count: tasks.filter((task) => task.status === "not_started").length,
    report_present_count: tasks.filter((task) => task.status !== "not_started").length,
    tasks,
    rule:
      "Skill Steward review tasks are report-only. They do not promote skills or edit SOPs; human approval is required before any future patch.",
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
