#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanup(root, runDate) {
  fs.rmSync(path.join(root, "automation-runs", runDate), { recursive: true, force: true });
  fs.rmSync(path.join(root, "research", "daily-content-plan", runDate), { recursive: true, force: true });
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `${args.join(" ")} failed with ${result.status}: ${output}`);
  return output;
}

function writeFixture(root, runDate) {
  const runDir = path.join(root, "automation-runs", runDate);
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  ensureDir(runDir);
  ensureDir(planDir);
  fs.writeFileSync(
    path.join(planDir, "old-artifact.md"),
    "# Old Artifact\n\nThis old handoff belongs to a prior queue shape and must not complete the current task.\n"
  );
  fs.writeFileSync(
    path.join(runDir, "subagent-queue.json"),
    `${JSON.stringify(
      {
        run_date: runDate,
        tasks: [
          {
            task_id: "fixture-stale-completion",
            run_date: runDate,
            candidate_id: "fixture",
            role: "Outline Agent",
            phase: "outline",
            depends_on: [],
            write_scope: `research/daily-content-plan/${runDate}/new-artifact.md`,
            artifact_path: `research/daily-content-plan/${runDate}/new-artifact.md`,
            prompt: "Fixture prompt.",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(runDir, "subagent-status.json"),
    `${JSON.stringify(
      {
        run_date: runDate,
        tasks: {
          "fixture-stale-completion": {
            status: "completed",
            output_artifacts: [`research/daily-content-plan/${runDate}/old-artifact.md`],
            completed_at: "2099-01-15T00:00:00.000Z",
            completion_source: "artifact_sync",
          },
          "fixture-old-history": {
            status: "completed",
            output_artifacts: [`research/daily-content-plan/${runDate}/old-prior-queue-artifact.md`],
            completed_at: "2099-01-14T00:00:00.000Z",
            completion_source: "artifact_sync",
          },
        },
      },
      null,
      2
    )}\n`
  );
}

function run() {
  const root = process.cwd();
  const runDate = "2099-01-15";
  cleanup(root, runDate);
  try {
    writeFixture(root, runDate);
    const sync = JSON.parse(runNode(root, ["scripts/seo-aeo/subagent-queue.mjs", "sync-completions", "--date", runDate]));
    assert(sync.stale_completed_reset === 1, `expected one stale completion reset, got ${sync.stale_completed_reset}`);
    assert(sync.status_ledger.out_of_current_queue_entry_count === 1, "sync output should report one out-of-current-queue history entry.");
    const status = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-status.json"), "utf8"));
    const taskStatus = status.tasks["fixture-stale-completion"];
    assert(taskStatus.status === "queued", `stale completed task should reset to queued, got ${taskStatus.status}`);
    assert(taskStatus.stale_completion?.expected_artifact?.endsWith("new-artifact.md"), "stale completion should record expected current artifact.");
    assert(status.tasks["fixture-old-history"]?.status === "completed", "out-of-current-queue history should remain in the ledger.");
    const statusAudit = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-status-audit.json"), "utf8"));
    assert(statusAudit.queue_task_count === 1, `expected one queue task in status audit, got ${statusAudit.queue_task_count}`);
    assert(statusAudit.ledger_entry_count === 2, `expected two ledger entries in status audit, got ${statusAudit.ledger_entry_count}`);
    assert(
      statusAudit.out_of_current_queue_entry_count === 1,
      `expected one out-of-current-queue status entry, got ${statusAudit.out_of_current_queue_entry_count}`
    );
    assert(
      statusAudit.out_of_current_queue_tasks.some((task) => task.task_id === "fixture-old-history"),
      "status audit should list the preserved out-of-current-queue task."
    );
    const artifactCheck = JSON.parse(
      runNode(root, ["scripts/seo-aeo/check-subagent-artifacts.mjs", "--date", runDate])
    );
    assert(artifactCheck.ok === true, "stale reset should prevent completed artifact checker failure.");
    assert(
      artifactCheck.status_ledger.out_of_current_queue_entry_count === 1,
      "artifact check output should carry the out-of-current-queue history count."
    );
    const dispatch = JSON.parse(runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", runDate]));
    assert(dispatch.selected === 1, `dispatch should select the current queued fixture task only, got ${dispatch.selected}`);
    const readyBatch = JSON.parse(
      fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json"), "utf8")
    );
    assert(
      readyBatch.selected_tasks.every((task) => task.task_id !== "fixture-old-history"),
      "dispatch must not select out-of-current-queue history tasks."
    );
    assert(
      readyBatch.status_ledger.out_of_current_queue_entry_count === 1,
      "ready batch should report the preserved out-of-current-queue history count."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "subagent_stale_completions",
          stale_completed_reset: sync.stale_completed_reset,
          out_of_current_queue_entry_count: statusAudit.out_of_current_queue_entry_count,
        },
        null,
        2
      )
    );
  } finally {
    cleanup(root, runDate);
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
