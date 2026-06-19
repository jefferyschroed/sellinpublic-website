#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { dependencyReadiness } from "./lib/subagent-dispatch-readiness.mjs";
import { markdownSubagentStatusLedger, summarizeSubagentStatusLedger } from "./lib/subagent-status-ledger.mjs";

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

function safeRelativePath(root, value) {
  const normalized = normalizePath(value);
  if (!normalized || normalized.includes("|") || normalized.includes("*")) return "";
  const absolute = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) return "";
  return relative(root, absolute);
}

function readQueue(root, runDate) {
  const queuePath = path.join(root, "automation-runs", runDate, "subagent-queue.json");
  if (!fs.existsSync(queuePath)) {
    throw new Error(`Subagent queue not found: ${relative(root, queuePath)}. Run build-subagent-queue first.`);
  }
  const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  if (!Array.isArray(queue.tasks)) throw new Error(`Subagent queue has no tasks array: ${relative(root, queuePath)}`);
  return { queuePath, queue };
}

function readStatus(root, runDate) {
  const statusPath = path.join(root, "automation-runs", runDate, "subagent-status.json");
  if (!fs.existsSync(statusPath)) return { statusPath, status: { run_date: runDate, tasks: {} } };
  const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  if (!status.tasks || typeof status.tasks !== "object") status.tasks = {};
  return { statusPath, status };
}

function readRunStatus(root, runDate) {
  const statusPath = path.join(root, "automation-runs", runDate, "run-status.json");
  if (!fs.existsSync(statusPath)) return { statusPath, status: {} };
  return { statusPath, status: JSON.parse(fs.readFileSync(statusPath, "utf8")) };
}

function readSourceRequest(root, runDate) {
  const requestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  if (!fs.existsSync(requestPath)) return { requestPath, request: {} };
  return { requestPath, request: JSON.parse(fs.readFileSync(requestPath, "utf8")) };
}

function statusFor(status, taskId) {
  return status.tasks?.[taskId] || { status: "queued" };
}

function artifactPathFor(root, task) {
  return safeRelativePath(root, task.artifact_path || task.write_scope);
}

function artifactExists(root, task) {
  const artifactPath = artifactPathFor(root, task);
  if (!artifactPath) return false;
  const absolute = path.join(root, artifactPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size === 0) return false;
  if (task.task_type === "demand_acquisition") {
    const source = fs.readFileSync(absolute, "utf8");
    const status = source.match(/^status:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";
    if (!status || status === "not_started") return false;
    if (status === "blocked_no_reviewed_rows") {
      return Boolean(source.match(/^blocked_reason:[ \t]*\S/m));
    }
    return status === "staged_reviewed_rows";
  }
  return true;
}

function taskIsComplete(root, task, status) {
  return statusFor(status, task.task_id).status === "completed" || artifactExists(root, task);
}

function classifyTasks(root, tasks, status) {
  const byId = new Map(tasks.map((task, index) => [task.task_id, { ...task, queue_index: index }]));

  return tasks.map((task, index) => {
    const artifactPath = artifactPathFor(root, task);
    const invalidArtifactPath = !artifactPath;
    const ledgerStatus = statusFor(status, task.task_id);
    const completed = !invalidArtifactPath && taskIsComplete(root, task, status);
    const dependencyBlockers = (task.depends_on || []).flatMap((dependencyId) => {
      const dependency = byId.get(dependencyId);
      const readiness = dependencyReadiness(root, dependency, task, {
        artifactPathFor,
        isComplete: (dependencyTask) => taskIsComplete(root, dependencyTask, status),
      });
      return readiness.ready ? [] : [{ task_id: dependencyId, reason: readiness.reason }];
    });
    const missingDependencies = dependencyBlockers.map((blocker) => blocker.task_id);

    let dispatchStatus = "ready";
    if (completed) dispatchStatus = "completed_artifact_present";
    else if (invalidArtifactPath) dispatchStatus = "blocked_invalid_artifact_path";
    else if (ledgerStatus.status === "claimed") dispatchStatus = "blocked_claimed";
    else if (ledgerStatus.status === "blocked") dispatchStatus = "blocked_manual";
    else if (missingDependencies.length) dispatchStatus = "blocked_waiting_dependency";

    return {
      ...task,
      queue_index: index,
      artifact_path: artifactPath || task.artifact_path || task.write_scope || "",
      dispatch_status: dispatchStatus,
      ledger_status: ledgerStatus,
      missing_dependencies: missingDependencies,
      dependency_blockers: dependencyBlockers,
    };
  });
}

function isDemandAcquisitionTask(task) {
  return task.task_type === "demand_acquisition" || task.phase === "demand_acquisition";
}

const SOURCE_LOCK_SAFE_ROLES = new Set([
  "Orchestrator",
  "Topic Cartographer",
  "Query Intelligence Agent",
  "Trend Discovery Agent",
  "Source Registry Agent",
  "Research Synthesis Agent",
  "SME Notes Agent",
  "Outline Agent",
  "AEO/SEO QA Agent",
  "QA Agent",
  "Skill Steward Agent",
]);

const SOURCE_LOCK_BLOCKED_PHASE_PATTERN =
  /demand_acquisition|validated_demand|draft|claim_ledger|metadata_schema|asset|blog_generator|index_feed|publish_qa|distribution|analytics_feedback/i;

function isValidatedDemandTask(task) {
  return isDemandAcquisitionTask(task) || task.task_type === "validated_demand_import";
}

function sourceLockAllowsLocalTask(task) {
  if (isValidatedDemandTask(task)) return false;
  if (!SOURCE_LOCK_SAFE_ROLES.has(task.role)) return false;
  if (SOURCE_LOCK_BLOCKED_PHASE_PATTERN.test(task.phase || "")) return false;
  return true;
}

function sourceProbeLocked(sourceRequest) {
  return sourceRequest.status === "escalation_required" || sourceRequest.source_probe_lock?.active === true;
}

function selectedTasks(classified, { candidateId, role, phase, includeBlocked, maxTasks, sourceRequest }) {
  const filtered = classified.filter((task) => {
    if (candidateId && task.candidate_id !== candidateId) return false;
    if (role && task.role !== role) return false;
    if (phase && task.phase !== phase) return false;
    if (includeBlocked) return !task.dispatch_status.startsWith("completed_");
    return task.dispatch_status === "ready";
  });
  const defaultDispatch = !candidateId && !role && !phase && !includeBlocked;
  if (sourceProbeLocked(sourceRequest)) {
    const localTasks = filtered.filter(sourceLockAllowsLocalTask).slice(0, maxTasks);
    return {
      tasks: localTasks,
      dispatchMode: localTasks.length ? "source_lock_local_handoff" : "demand_source_escalation",
      selectionRule:
        "Source-request lock suppresses demand acquisition/import, demand apply, scaffolding, generation, publishing, distribution, analytics feedback, and content movement. Ready local gap/orchestration/steward tasks may continue only when selected here.",
      suppressedReadyTaskCount: Math.max(0, filtered.length - localTasks.length),
    };
  }
  const readyDemandAcquisitionTasks = filtered.filter(isDemandAcquisitionTask);
  if (defaultDispatch && readyDemandAcquisitionTasks.length) {
    const selected = readyDemandAcquisitionTasks.slice(0, 1);
    return {
      tasks: selected,
      dispatchMode: "demand_acquisition",
      selectionRule:
        "Validated-demand blockers select exactly one demand_acquisition prompt before gap-resolution or lifecycle work.",
      suppressedReadyTaskCount: Math.max(0, filtered.length - selected.length),
    };
  }
  return {
    tasks: filtered.slice(0, maxTasks),
    dispatchMode: defaultDispatch ? "default" : "filtered",
    selectionRule: "Select ready tasks in queue order up to max_tasks after applying requested filters.",
    suppressedReadyTaskCount: 0,
  };
}

function promptFileName(task) {
  return `${task.task_id.replace(/[^a-z0-9._-]+/gi, "-")}.prompt.md`;
}

function writePromptFiles(root, outputDir, tasks) {
  const promptDir = ensureDir(path.join(outputDir, "prompts"));
  for (const entry of fs.readdirSync(promptDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".prompt.md")) fs.rmSync(path.join(promptDir, entry.name));
  }
  return tasks.map((task) => {
    const filePath = path.join(promptDir, promptFileName(task));
    fs.writeFileSync(filePath, `${task.prompt.trim()}\n`);
    return {
      task_id: task.task_id,
      prompt_path: relative(root, filePath),
    };
  });
}

function writeMarkdown(filePath, report) {
  const readyLines = report.selected_tasks.length
    ? report.selected_tasks
        .map(
          (task, index) => `${index + 1}. \`${task.task_id}\` - ${task.role}, ${task.phase}
   - Candidate: ${task.topic}
   - Artifact: \`${task.artifact_path}\`
   - Prompt: \`${task.prompt_path}\``
        )
        .join("\n")
    : "- No ready tasks selected.";

  const blockedLines = report.blocked_tasks.length
    ? report.blocked_tasks
        .slice(0, 30)
        .map(
          (task) =>
            `- \`${task.task_id}\`: ${task.dispatch_status}${
              task.missing_dependencies?.length ? ` (${task.missing_dependencies.join(", ")})` : ""
            }${
              task.dependency_blockers?.length
                ? ` - ${task.dependency_blockers.map((blocker) => `${blocker.task_id}:${blocker.reason}`).join(", ")}`
                : ""
            }`
        )
        .join("\n")
    : "- None.";

  const completedLines = report.completed_tasks.length
    ? report.completed_tasks.slice(0, 30).map((task) => `- \`${task.task_id}\``).join("\n")
    : "- None.";

  const markdown = `# Subagent Dispatch

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Queue: \`${report.queue_path}\`
Status ledger: \`${report.status_path}\`

${markdownSubagentStatusLedger(report.status_ledger)}

## Rule

Launch one subagent per selected task. Do not merge selected tasks into a single broad assignment. Each subagent must write only its listed artifact path, then stop.

## Selected Ready Tasks

${readyLines}

## Blocked Or Waiting Tasks

${blockedLines}

## Completed Artifacts Already Present

${completedLines}
`;

  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const maxTasks = Number(arg("--max", "12"));
  const candidateId = arg("--candidate", "");
  const role = arg("--role", "");
  const phase = arg("--phase", "");
  const includeBlocked = hasFlag("--include-blocked");
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate, "subagent-dispatch"));
  const { queuePath, queue } = readQueue(root, runDate);
  const { statusPath, status } = readStatus(root, runDate);
  const { statusPath: runStatusPath, status: runStatus } = readRunStatus(root, runDate);
  const { requestPath: sourceRequestPath, request: sourceRequest } = readSourceRequest(root, runDate);
  const classified = classifyTasks(root, queue.tasks, status);
  const selection = selectedTasks(classified, { candidateId, role, phase, includeBlocked, maxTasks, sourceRequest });
  const selected = selection.tasks;
  const promptFiles = writePromptFiles(root, outputDir, selected);
  const promptPathByTask = new Map(promptFiles.map((item) => [item.task_id, item.prompt_path]));
  const selectedWithPrompts = selected.map((task) => ({
    ...task,
    prompt_path: promptPathByTask.get(task.task_id) || "",
  }));
  const blockedTasks = classified.filter((task) => task.dispatch_status.startsWith("blocked_"));
  const completedTasks = classified.filter((task) => task.dispatch_status.startsWith("completed_"));
  const statusLedger = summarizeSubagentStatusLedger(queue, status);

  const report = {
    run_date: runDate,
    generated_at: new Date().toISOString(),
    queue_path: relative(root, queuePath),
    status_path: relative(root, statusPath),
    run_status_path: fs.existsSync(runStatusPath) ? relative(root, runStatusPath) : "",
    run_status_overall: runStatus.overall_status || "",
    source_request_path: fs.existsSync(sourceRequestPath) ? relative(root, sourceRequestPath) : "",
    source_request_status: sourceRequest.status || "",
    output_dir: relative(root, outputDir),
    dispatch_mode: selection.dispatchMode,
    selection_rule: selection.selectionRule,
    suppressed_ready_task_count: selection.suppressedReadyTaskCount,
    status_ledger: statusLedger,
    filters: {
      candidate_id: candidateId,
      role,
      phase,
      include_blocked: includeBlocked,
      max_tasks: maxTasks,
    },
    counts: {
      total_tasks: classified.length,
      ready_tasks: classified.filter((task) => task.dispatch_status === "ready").length,
      selected_tasks: selectedWithPrompts.length,
      blocked_tasks: blockedTasks.length,
      completed_tasks: completedTasks.length,
    },
    selected_tasks: selectedWithPrompts,
    blocked_tasks: blockedTasks,
    completed_tasks: completedTasks,
  };

  const jsonPath = path.join(outputDir, "ready-batch.json");
  const markdownPath = path.join(outputDir, "ready-batch.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runDate,
        selected: selectedWithPrompts.length,
        ready: report.counts.ready_tasks,
        blocked: blockedTasks.length,
        completed: completedTasks.length,
        ready_batch_json: relative(root, jsonPath),
        ready_batch_md: relative(root, markdownPath),
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
