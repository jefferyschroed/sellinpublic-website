#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const CSV_HEADERS = [
  "queue_id",
  "source",
  "task_id",
  "priority",
  "status",
  "dispatch_status",
  "safe_to_dispatch",
  "requires_approval",
  "owner",
  "role",
  "candidate_id",
  "topic",
  "prompt_path",
  "report_path",
  "artifact_path",
  "row_csv_path",
  "blocked_reason",
  "next_action",
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

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sourcePath(root, filePath) {
  return fs.existsSync(filePath) ? relative(root, filePath) : "";
}

function sourceState(root, filePath) {
  return {
    path: relative(root, filePath),
    exists: fs.existsSync(filePath),
  };
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function priorityRank(value) {
  const match = String(value || "").toUpperCase().match(/^P?(\d+)/);
  return match ? Number(match[1]) : 9;
}

function safeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function bySourceCounts(tasks) {
  return tasks.reduce((counts, task) => {
    counts[task.source] = (counts[task.source] || 0) + 1;
    return counts;
  }, {});
}

function byStatusCounts(tasks) {
  return tasks.reduce((counts, task) => {
    const key = task.dispatch_status || task.status || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

const DEMAND_GAP_PATTERN = /validated_demand|demand_import|query_handoff|needs_validated_query_demand/i;

function isStaleGap(row) {
  return String(row.status || "").startsWith("stale") || String(row.artifact_identity_status || "").startsWith("stale");
}

function isDemandGap(row) {
  return DEMAND_GAP_PATTERN.test(`${row.gap_type || ""} ${row.gap_code || ""} ${row.required_action || ""} ${row.notes || ""}`);
}

function sourceLockActive({ runStatus, ownerActions, readyBatch }) {
  return Boolean(
    readyBatch.source_request_status === "escalation_required" ||
      ownerActions.source_handoff?.active_lock ||
      ownerActions.demand_acquisition?.source_request_status === "escalation_required" ||
      runStatus.demand_acquisition_report_rollup?.source_request?.status === "escalation_required" ||
      runStatus.demand_acquisition_report_rollup?.source_request?.source_probe_lock?.active
  );
}

function canonicalTasks(readyBatch) {
  return (readyBatch.selected_tasks || []).map((task, index) => ({
    queue_id: `canonical:${safeId(task.task_id || `task-${index + 1}`)}`,
    source: "canonical_subagent_dispatch",
    task_id: task.task_id || "",
    priority: task.priority || task.queue_priority || "P1",
    status: "selected",
    dispatch_status: task.dispatch_status || "ready",
    safe_to_dispatch: true,
    requires_approval: false,
    approval_marker: "",
    owner: task.owner || "",
    role: task.role || "",
    candidate_id: task.candidate_id || "",
    topic: task.topic || "",
    prompt_path: task.prompt_path || "",
    report_path: "",
    artifact_path: task.artifact_path || "",
    row_csv_path: "",
    blocked_reason: "",
    next_action: "Launch exactly one subagent with the listed prompt. The subagent writes only the listed artifact.",
  }));
}

function aiCitationTasks(taskBatch) {
  return (taskBatch.tasks || []).map((task, index) => {
    const safe = task.status === "not_started" && text(task.allowed_use, "visibility_monitoring_only") === "visibility_monitoring_only";
    return {
      queue_id: `ai-citation:${safeId(task.task_id || `task-${index + 1}`)}`,
      source: "ai_citation_capture",
      task_id: task.task_id || "",
      priority: task.priority || "P2",
      status: task.status || "unknown",
      dispatch_status: safe ? "ready_report_only" : `blocked_${task.status || "unknown"}`,
      safe_to_dispatch: safe,
      requires_approval: false,
      approval_marker: "",
      owner: "AI Citation Capture Agent",
      role: "AI Citation Capture Agent",
      candidate_id: task.capture_id || "",
      topic: task.query || "",
      prompt_path: task.prompt_path || "",
      report_path: task.report_path || "",
      artifact_path: task.report_path || "",
      row_csv_path: task.row_csv_path || "",
      blocked_reason: safe ? "" : "Only not_started visibility-monitoring tasks are dispatch-ready from this rollup.",
      next_action: safe
        ? "Launch exactly one monitoring subagent. Manual/official-export observation only; no unofficial answer-engine scraping."
        : "Review existing report status before redispatch.",
    };
  });
}

function skillStewardTasks(taskBatch) {
  return (taskBatch.tasks || []).map((task, index) => {
    const safe = task.status === "not_started" && text(task.allowed_use, "process_learning_review_only") === "process_learning_review_only";
    return {
      queue_id: `skill-steward:${safeId(task.task_id || `task-${index + 1}`)}`,
      source: "skill_steward_review",
      task_id: task.task_id || "",
      priority: "P2",
      status: task.status || "unknown",
      dispatch_status: safe ? "ready_report_only" : `blocked_${task.status || "unknown"}`,
      safe_to_dispatch: safe,
      requires_approval: false,
      approval_marker: "",
      owner: "Skill Steward Agent",
      role: "Skill Steward Agent",
      candidate_id: task.candidate_id || "",
      topic: task.proposed_change || task.target_skill || "",
      prompt_path: task.prompt_path || "",
      report_path: task.report_path || "",
      artifact_path: task.report_path || "",
      row_csv_path: "",
      blocked_reason: safe ? "" : "Only not_started report-only skill reviews are dispatch-ready from this rollup.",
      next_action: safe
        ? "Launch exactly one report-only Skill Steward subagent. Do not edit skills, SOPs, scripts, content, or global Codex files."
        : "Review existing report status before redispatch.",
    };
  });
}

function gapRows(gapLedger) {
  const groups = new Map();
  for (const [index, row] of (gapLedger.rows || []).entries()) {
    if (isStaleGap(row) || isDemandGap(row)) continue;
    const key = [
      row.candidate_id || "missing",
      row.gap_type || "gap",
      row.gap_code || "open",
      row.owner || "orchestrator",
      row.required_action || "",
    ].join("\u0001");
    const current = groups.get(key) || { row, refs: [] };
    current.refs.push({
      path: row.source_path || "",
      index,
      row_key: `${row.candidate_id || ""}:${row.gap_type || ""}:${row.gap_code || ""}`,
    });
    groups.set(key, current);
  }

  return Array.from(groups.values()).map(({ row, refs }, index) => ({
      queue_id: `gap-ledger:${safeId(`${row.candidate_id || "missing"}:${row.gap_type || "gap"}:${row.gap_code || index + 1}:${row.owner || ""}`)}`,
      source: "gap_ledger",
      task_id: "",
      priority: row.priority || "P3",
      status: row.status || "open",
      dispatch_status: "routing_only",
      safe_to_dispatch: false,
      requires_approval: true,
      approval_marker: "",
      owner: row.owner || "",
      role: "",
      candidate_id: row.candidate_id || "",
      topic: row.topic || row.artifact_topic || "",
      prompt_path: "",
      report_path: "",
      artifact_path: row.source_path || "",
      row_csv_path: "",
      blocked_reason: "Gap ledger rows are routing candidates only until a canonical selected prompt exists.",
      next_action: row.required_action || "Use the canonical dispatch builder or a task-specific prompt before launching a subagent.",
      source_refs: refs,
      metadata: {
        gap_type: row.gap_type || "",
        gap_code: row.gap_code || "",
        artifact_identity_status: row.artifact_identity_status || "",
        current_topic_id: row.current_topic_id || "",
        grouped_row_count: refs.length,
        notes: row.notes || "",
      },
    }));
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.safe_to_dispatch !== b.safe_to_dispatch) return a.safe_to_dispatch ? -1 : 1;
    return priorityRank(a.priority) - priorityRank(b.priority) || a.source.localeCompare(b.source) || a.queue_id.localeCompare(b.queue_id);
  });
}

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function taskTable(tasks) {
  if (!tasks.length) return "| Source | Task | Owner | Topic | Prompt | Next action |\n|---|---|---|---|---|---|\n| None |  |  |  |  |  |";
  const rows = tasks
    .slice(0, 20)
    .map(
      (task) =>
        `| ${mdEscape(task.source)} | \`${mdEscape(task.task_id || task.queue_id)}\` | ${mdEscape(task.owner || task.role)} | ${mdEscape(task.topic).slice(0, 120)} | ${task.prompt_path ? `\`${mdEscape(task.prompt_path)}\`` : ""} | ${mdEscape(task.next_action)} |`
    );
  return `| Source | Task | Owner | Topic | Prompt | Next action |\n|---|---|---|---|---|---|\n${rows.join("\n")}`;
}

function blockedTable(tasks) {
  if (!tasks.length) return "| Source | Item | Status | Reason |\n|---|---|---|---|\n| None |  |  |  |";
  const rows = tasks
    .slice(0, 20)
    .map(
      (task) =>
        `| ${mdEscape(task.source)} | \`${mdEscape(task.task_id || task.queue_id)}\` | ${mdEscape(task.dispatch_status)} | ${mdEscape(task.blocked_reason || task.next_action)} |`
    );
  return `| Source | Item | Status | Reason |\n|---|---|---|---|\n${rows.join("\n")}`;
}

function writeMarkdown(filePath, report) {
  const safeTasks = report.tasks.filter((task) => task.safe_to_dispatch);
  const blockedTasks = report.tasks.filter((task) => !task.safe_to_dispatch);
  const markdown = `# Work Queue Rollup

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}

## Summary

- Total queue items: ${report.summary.total_tasks}
- Safe to dispatch now: ${report.summary.safe_to_dispatch_count}
- Requires approval or routing: ${report.summary.requires_approval_count}
- Source-request lock active: ${report.summary.source_request_lock_active ? "yes" : "no"}
- Canonical selected tasks: ${report.summary.canonical_selected_count}
- AI citation tasks not started: ${report.summary.ai_citation_not_started_count}
- Skill Steward reviews not started: ${report.summary.skill_steward_not_started_count}
- Active gap rows: ${report.summary.active_gap_rows}
- Stale gap rows: ${report.summary.stale_gap_rows}
- Demand/query-handoff gap rows excluded from dispatch routing: ${report.summary.demand_gap_rows}
- Missing source files: ${report.missing_sources.length ? report.missing_sources.join(", ") : "none"}

## Safe To Dispatch

${taskTable(safeTasks)}

## Approval Or Routing Only

${blockedTable(blockedTasks)}

## Rules

- Launch one subagent per safe task. Do not combine queue items into broad assignments.
- Canonical dispatch, AI citation capture, and Skill Steward review prompts define the write scope.
- AI citation tasks are visibility monitoring only; no unofficial answer-engine scraping and no placeholder rows.
- Skill Steward tasks are report-only; no skill, SOP, script, content, analytics, publishing, or global Codex edits.
- Gap ledger rows are not dispatch prompts. They need canonical task selection or explicit human approval before work.
- This rollup never applies demand promotion, scaffolds packets, generates blogs, publishes pages, promotes skills, or imports analytics.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const runDir = path.join(root, "automation-runs", runDate);
  const dailyPlanDir = path.join(root, "research", "daily-content-plan", runDate);
  const outputJson = path.join(runDir, "work-queue-rollup.json");
  const outputMd = path.join(runDir, "work-queue-rollup.md");
  const outputCsv = path.join(runDir, "work-queue-rollup.csv");

  const readyBatchPath = path.join(runDir, "subagent-dispatch", "ready-batch.json");
  const aiTasksPath = path.join(runDir, "ai-citation-capture-tasks", "tasks.json");
  const skillTasksPath = path.join(runDir, "skill-steward-review-tasks", "tasks.json");
  const gapLedgerPath = path.join(dailyPlanDir, "gap-ledger.json");
  const runStatusPath = path.join(runDir, "run-status.json");
  const ownerActionsPath = path.join(runDir, "owner-actions.json");

  const readyBatch = readJson(readyBatchPath, {});
  const aiTaskBatch = readJson(aiTasksPath, {});
  const skillTaskBatch = readJson(skillTasksPath, {});
  const gapLedger = readJson(gapLedgerPath, {});
  const runStatus = readJson(runStatusPath, {});
  const ownerActions = readJson(ownerActionsPath, {});
  const sourceFiles = {
    ready_batch: sourceState(root, readyBatchPath),
    ai_citation_tasks: sourceState(root, aiTasksPath),
    skill_steward_review_tasks: sourceState(root, skillTasksPath),
    gap_ledger: sourceState(root, gapLedgerPath),
    run_status: sourceState(root, runStatusPath),
    owner_actions: sourceState(root, ownerActionsPath),
  };
  const missingSources = Object.entries(sourceFiles)
    .filter(([, source]) => !source.exists)
    .map(([key]) => key);
  const activeGapRows = (gapLedger.rows || []).filter((row) => !isStaleGap(row));
  const demandGapRows = activeGapRows.filter(isDemandGap);

  const tasks = sortTasks([
    ...canonicalTasks(readyBatch),
    ...aiCitationTasks(aiTaskBatch),
    ...skillStewardTasks(skillTaskBatch),
    ...gapRows(gapLedger),
  ]);
  const safeTasks = tasks.filter((task) => task.safe_to_dispatch);
  const approvalTasks = tasks.filter((task) => task.requires_approval || !task.safe_to_dispatch);
  const sourceLock = sourceLockActive({ runStatus, ownerActions, readyBatch });
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: missingSources.length ? "partial" : safeTasks.length ? "ready_to_dispatch" : "no_safe_dispatch_tasks",
    missing_sources: missingSources,
    source_files: Object.fromEntries(Object.entries(sourceFiles).map(([key, source]) => [key, source.path])),
    source_file_status: sourceFiles,
    summary: {
      total_tasks: tasks.length,
      safe_to_dispatch_count: safeTasks.length,
      requires_approval_count: approvalTasks.length,
      source_request_lock_active: sourceLock,
      canonical_selected_count: (readyBatch.selected_tasks || []).length,
      ai_citation_task_count: (aiTaskBatch.tasks || []).length,
      ai_citation_not_started_count: (aiTaskBatch.tasks || []).filter((task) => task.status === "not_started").length,
      skill_steward_task_count: (skillTaskBatch.tasks || []).length,
      skill_steward_not_started_count: (skillTaskBatch.tasks || []).filter((task) => task.status === "not_started").length,
      active_gap_rows: gapLedger.active_row_count ?? gapRows(gapLedger).length,
      stale_gap_rows: gapLedger.stale_row_count ?? (gapLedger.rows || []).filter((row) => String(row.status || "").startsWith("stale")).length,
      demand_gap_rows: demandGapRows.length,
      routed_gap_groups: tasks.filter((task) => task.source === "gap_ledger").length,
      by_source: bySourceCounts(tasks),
      by_status: byStatusCounts(tasks),
    },
    safe_task_ids: safeTasks.map((task) => task.queue_id),
    approval_or_routing_ids: approvalTasks.map((task) => task.queue_id),
    tasks,
    rules: [
      "Launch one subagent per safe task.",
      "Do not run demand promotion apply, packet scaffolding, generation, publishing, analytics import, or skill promotion from this rollup.",
      "AI citation rows are monitoring inputs only and require completed reports before staging/import.",
      "Skill Steward reviews are report-only and require human approval before any patch.",
      "Gap ledger rows are routing candidates only until canonical prompt selection.",
    ],
  };

  ensureDir(runDir);
  writeJsonAtomic(outputJson, report);
  writeCsvAtomic(outputCsv, CSV_HEADERS, tasks);
  writeMarkdown(outputMd, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        status: report.status,
        safe_to_dispatch: report.summary.safe_to_dispatch_count,
        requires_approval: report.summary.requires_approval_count,
        missing_sources: report.missing_sources,
        work_queue_rollup_json: relative(root, outputJson),
        work_queue_rollup_csv: relative(root, outputCsv),
        work_queue_rollup_md: relative(root, outputMd),
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
