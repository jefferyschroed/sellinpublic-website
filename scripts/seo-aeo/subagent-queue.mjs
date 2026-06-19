#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { dependencyReadiness } from "./lib/subagent-dispatch-readiness.mjs";
import { markdownSubagentStatusLedger, summarizeSubagentStatusLedger } from "./lib/subagent-status-ledger.mjs";

function usage(exitCode = 2) {
  console.log(`Usage:
  node scripts/seo-aeo/subagent-queue.mjs list-ready --date yyyy-mm-dd [--max 10]
  node scripts/seo-aeo/subagent-queue.mjs show <task_id> --date yyyy-mm-dd
  node scripts/seo-aeo/subagent-queue.mjs write-prompt <task_id> --date yyyy-mm-dd
  node scripts/seo-aeo/subagent-queue.mjs claim <task_id> --date yyyy-mm-dd --operator <name> [--thread-id <id>]
  node scripts/seo-aeo/subagent-queue.mjs complete <task_id> --date yyyy-mm-dd --artifact <path> [--thread-id <id>]
  node scripts/seo-aeo/subagent-queue.mjs block <task_id> --date yyyy-mm-dd --reason <reason> [--thread-id <id>]
  node scripts/seo-aeo/subagent-queue.mjs sync-completions --date yyyy-mm-dd

Each command operates on automation-runs/<date>/subagent-queue.json and automation-runs/<date>/subagent-status.json.`);
  process.exit(exitCode);
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
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

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function paths(root, runDate) {
  const runDir = path.join(root, "automation-runs", runDate);
  return {
    runDir,
    queuePath: path.join(runDir, "subagent-queue.json"),
    statusPath: path.join(runDir, "subagent-status.json"),
    promptDir: path.join(runDir, "subagent-prompts"),
  };
}

function loadState(root, runDate) {
  const statePaths = paths(root, runDate);
  if (!fs.existsSync(statePaths.queuePath)) {
    throw new Error(`Missing subagent queue: ${relative(root, statePaths.queuePath)}. Run build-subagent-queue first.`);
  }
  const queue = readJson(statePaths.queuePath, {});
  const status = readJson(statePaths.statusPath, { run_date: runDate, tasks: {} });
  if (!Array.isArray(queue.tasks)) throw new Error(`Queue has no tasks array: ${relative(root, statePaths.queuePath)}`);
  if (!status.tasks || typeof status.tasks !== "object") status.tasks = {};
  return { ...statePaths, queue, status };
}

function taskById(queue) {
  return new Map(queue.tasks.map((task) => [task.task_id, task]));
}

function statusFor(status, taskId) {
  return status.tasks[taskId] || { status: "queued" };
}

function artifactPathFor(root, task) {
  return safeRelativePath(root, task.artifact_path || task.write_scope);
}

function artifactExists(root, task) {
  const artifactPath = artifactPathFor(root, task);
  if (!artifactPath) return false;
  const absolute = path.join(root, artifactPath);
  return fs.existsSync(absolute) && fs.statSync(absolute).isFile() && fs.statSync(absolute).size > 0;
}

function outputArtifactsFor(root, current) {
  return Array.isArray(current.output_artifacts)
    ? current.output_artifacts.map((value) => safeRelativePath(root, value)).filter(Boolean)
    : [];
}

function completedStatusMatchesTask(root, task, current) {
  if (current.status !== "completed") return true;
  const expectedArtifact = artifactPathFor(root, task);
  if (!expectedArtifact) return false;
  const outputs = outputArtifactsFor(root, current);
  return outputs.includes(expectedArtifact) && artifactExists(root, task);
}

function isComplete(root, task, status) {
  const taskStatus = statusFor(status, task.task_id);
  return taskStatus.status === "completed" || artifactExists(root, task);
}

function classify(root, queue, status) {
  const byId = taskById(queue);
  return queue.tasks.map((task, index) => {
    const taskStatus = statusFor(status, task.task_id);
    const artifactPath = artifactPathFor(root, task);
    const dependencyBlockers = (task.depends_on || []).flatMap((dependencyId) => {
      const dependency = byId.get(dependencyId);
      const readiness = dependencyReadiness(root, dependency, task, {
        artifactPathFor,
        isComplete: (dependencyTask) => isComplete(root, dependencyTask, status),
      });
      return readiness.ready ? [] : [{ task_id: dependencyId, reason: readiness.reason }];
    });
    const missingDependencies = dependencyBlockers.map((blocker) => blocker.task_id);

    let computed_status = taskStatus.status || "queued";
    if (computed_status === "queued" && !artifactPath) computed_status = "blocked_invalid_artifact_path";
    else if (computed_status === "queued" && missingDependencies.length) computed_status = "blocked_waiting_dependency";
    else if (computed_status === "queued" && artifactExists(root, task)) computed_status = "completed_artifact_present";
    else if (computed_status === "queued") computed_status = "ready";

    return {
      ...task,
      queue_index: index,
      artifact_path: artifactPath || task.artifact_path || task.write_scope || "",
      computed_status,
      ledger_status: taskStatus,
      missing_dependencies: missingDependencies,
      dependency_blockers: dependencyBlockers,
    };
  });
}

function writeStatus(statusPath, status) {
  writeJsonAtomic(statusPath, {
    ...status,
    updated_at: new Date().toISOString(),
  });
}

function promptFileName(task) {
  return `${task.task_id.replace(/[^a-z0-9._-]+/gi, "-")}.prompt.md`;
}

function writePrompt(root, promptDir, task) {
  ensureDir(promptDir);
  const promptPath = path.join(promptDir, promptFileName(task));
  fs.writeFileSync(promptPath, `${task.prompt.trim()}\n`);
  return relative(root, promptPath);
}

function requireTask(state, taskId) {
  const task = taskById(state.queue).get(taskId);
  if (!task) throw new Error(`Unknown task_id: ${taskId}`);
  return task;
}

function listReady(root, state) {
  const max = Number(arg("--max", "10"));
  const ready = classify(root, state.queue, state.status)
    .filter((task) => task.computed_status === "ready")
    .slice(0, max);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: state.status.run_date,
        ready: ready.length,
        tasks: ready.map((task) => ({
          task_id: task.task_id,
          role: task.role,
          phase: task.phase,
          candidate_id: task.candidate_id,
          topic: task.topic,
          artifact_path: task.artifact_path,
        })),
      },
      null,
      2
    )
  );
}

function showTask(state, taskId) {
  const task = requireTask(state, taskId);
  console.log(task.prompt);
}

function writeTaskPrompt(root, state, taskId) {
  const task = requireTask(state, taskId);
  const promptPath = writePrompt(root, state.promptDir, task);
  console.log(JSON.stringify({ ok: true, task_id: taskId, prompt_path: promptPath }, null, 2));
}

function claimTask(state, taskId) {
  requireTask(state, taskId);
  const operator = arg("--operator", "");
  if (!operator) throw new Error("claim requires --operator <name>.");
  state.status.tasks[taskId] = {
    ...statusFor(state.status, taskId),
    status: "claimed",
    operator,
    thread_id: arg("--thread-id", statusFor(state.status, taskId).thread_id || ""),
    claimed_at: new Date().toISOString(),
  };
  writeStatus(state.statusPath, state.status);
  console.log(JSON.stringify({ ok: true, task_id: taskId, status: "claimed" }, null, 2));
}

function completeTask(root, state, taskId) {
  const task = requireTask(state, taskId);
  const expectedArtifact = artifactPathFor(root, task);
  if (!expectedArtifact) throw new Error(`Task has no safe declared artifact path: ${taskId}`);
  const artifact = safeRelativePath(root, arg("--artifact", expectedArtifact));
  if (!artifact) throw new Error("complete requires a safe --artifact path.");
  if (artifact !== expectedArtifact) {
    throw new Error(`Completion artifact must match the task write scope. Expected ${expectedArtifact}; received ${artifact}.`);
  }
  const absolute = path.join(root, artifact);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size === 0) {
    throw new Error(`Completion artifact is missing or empty: ${artifact}`);
  }
  state.status.tasks[taskId] = {
    ...statusFor(state.status, taskId),
    status: "completed",
    thread_id: arg("--thread-id", statusFor(state.status, taskId).thread_id || ""),
    output_artifacts: [artifact],
    completed_at: new Date().toISOString(),
  };
  writeStatus(state.statusPath, state.status);
  console.log(JSON.stringify({ ok: true, task_id: taskId, status: "completed", artifact }, null, 2));
}

function blockTask(state, taskId) {
  requireTask(state, taskId);
  const reason = arg("--reason", "");
  if (!reason) throw new Error("block requires --reason <reason>.");
  state.status.tasks[taskId] = {
    ...statusFor(state.status, taskId),
    status: "blocked",
    thread_id: arg("--thread-id", statusFor(state.status, taskId).thread_id || ""),
    blocked_at: new Date().toISOString(),
    blocker: reason,
  };
  writeStatus(state.statusPath, state.status);
  console.log(JSON.stringify({ ok: true, task_id: taskId, status: "blocked", reason }, null, 2));
}

function syncCompletions(root, state) {
  const synced = [];
  const skipped = [];
  const stale = [];

  for (const task of classify(root, state.queue, state.status)) {
    const current = statusFor(state.status, task.task_id);
    if (current.status === "completed") {
      if (!completedStatusMatchesTask(root, task, current)) {
        const staleCompletion = {
          previous_status: "completed",
          output_artifacts: outputArtifactsFor(root, current),
          completed_at: current.completed_at || "",
          completion_source: current.completion_source || "",
          stale_reason: "completed output no longer matches current task write scope",
          expected_artifact: task.artifact_path,
          reset_at: new Date().toISOString(),
        };
        state.status.tasks[task.task_id] = {
          status: "queued",
          thread_id: current.thread_id || "",
          stale_completion: staleCompletion,
        };
        stale.push({ task_id: task.task_id, expected_artifact: task.artifact_path, previous_artifacts: staleCompletion.output_artifacts });
        continue;
      }
      skipped.push({ task_id: task.task_id, reason: "already_completed" });
      continue;
    }
    if (!artifactExists(root, task)) continue;
    state.status.tasks[task.task_id] = {
      ...current,
      status: "completed",
      output_artifacts: [task.artifact_path],
      completed_at: current.completed_at || new Date().toISOString(),
      completion_source: current.completion_source || "artifact_sync",
    };
    synced.push({ task_id: task.task_id, artifact: task.artifact_path });
  }

  writeStatus(state.statusPath, state.status);
  const statusLedger = summarizeSubagentStatusLedger(state.queue, state.status);
  const auditJsonPath = path.join(state.runDir, "subagent-status-audit.json");
  const auditMarkdownPath = path.join(state.runDir, "subagent-status-audit.md");
  writeJsonAtomic(auditJsonPath, {
    schema_version: "1.0",
    run_date: state.status.run_date,
    generated_at: new Date().toISOString(),
    queue_path: relative(root, state.queuePath),
    status_path: relative(root, state.statusPath),
    ...statusLedger,
  });
  fs.writeFileSync(
    auditMarkdownPath,
    `# Subagent Status Audit\n\nRun date: ${state.status.run_date}\nQueue: \`${relative(root, state.queuePath)}\`\nStatus ledger: \`${relative(root, state.statusPath)}\`\n\n${markdownSubagentStatusLedger(statusLedger)}`
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: state.status.run_date,
        synced: synced.length,
        already_completed: skipped.length,
        stale_completed_reset: stale.length,
        status_path: relative(root, state.statusPath),
        status_audit_json: relative(root, auditJsonPath),
        status_audit_md: relative(root, auditMarkdownPath),
        status_ledger: {
          queue_task_count: statusLedger.queue_task_count,
          ledger_entry_count: statusLedger.ledger_entry_count,
          current_queue_entry_count: statusLedger.current_queue_entry_count,
          implicit_queued_current_task_count: statusLedger.implicit_queued_current_task_count,
          out_of_current_queue_entry_count: statusLedger.out_of_current_queue_entry_count,
          current_queue_by_status: statusLedger.current_queue_by_status,
          out_of_current_queue_by_status: statusLedger.out_of_current_queue_by_status,
        },
        tasks: synced,
        stale,
      },
      null,
      2
    )
  );
}

function run() {
  const [command, taskId] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!command || command === "--help" || command === "-h") usage(command ? 0 : 2);
  const root = process.cwd();
  const runDate = arg("--date", today());
  const state = loadState(root, runDate);

  if (command === "list-ready") return listReady(root, state);
  if (command === "sync-completions") return syncCompletions(root, state);
  if (!taskId) usage();
  if (command === "show") return showTask(state, taskId);
  if (command === "write-prompt") return writeTaskPrompt(root, state, taskId);
  if (command === "claim") return claimTask(state, taskId);
  if (command === "complete") return completeTask(root, state, taskId);
  if (command === "block") return blockTask(state, taskId);
  usage();
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
