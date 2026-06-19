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

function cleanup(root, runDate) {
  fs.rmSync(path.join(root, "research", "daily-content-plan", runDate), { recursive: true, force: true });
  fs.rmSync(path.join(root, "automation-runs", runDate), { recursive: true, force: true });
}

function writeFixture(root, runDate) {
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  const runDir = path.join(root, "automation-runs", runDate);
  const packDir = path.join(planDir, "demand-import-pack");
  const promptDir = path.join(runDir, "demand-acquisition-tasks", "prompts");
  const reportDir = path.join(runDir, "demand-acquisition-tasks", "reports");
  ensureDir(packDir);
  ensureDir(promptDir);
  ensureDir(reportDir);

  fs.writeFileSync(
    path.join(runDir, "run-status.json"),
    `${JSON.stringify({ run_date: runDate, overall_status: "needs_validated_query_demand" }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic_id,pillar_id,parent_topic,topic,canonical_topic,intent,aeo_question,topic_score_guess,gate_reasons,source_readiness,packet_intake_status,topic_decision,coverage_status,coverage_role,authority_match\n" +
      `${runDate},query-fixture,topic-fixture,pillar-fixture,,fixture topic,Fixture Topic,definition,What is fixture topic?,90,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n`
  );
  fs.writeFileSync(
    path.join(planDir, "demand-import-worklist.json"),
    `${JSON.stringify({ run_date: runDate, request_count: 0, rows: [] }, null, 2)}\n`
  );

  const taskId = "query-fixture-acquire-rank1-reviewed-generic-query-tool-export";
  const stagingPath = `research/daily-content-plan/${runDate}/demand-import-pack/${runDate}-fixture.draft.csv`;
  const reportPath = `automation-runs/${runDate}/demand-acquisition-tasks/reports/${taskId}.md`;
  const promptPath = `automation-runs/${runDate}/demand-acquisition-tasks/prompts/${taskId}.prompt.md`;
  fs.writeFileSync(path.join(root, stagingPath), "date,source,query,validated_demand,validation_source,reviewed_by\n");
  fs.writeFileSync(
    path.join(root, reportPath),
    `# Demand Acquisition Report

task_id: ${taskId}
candidate_id: query-fixture
status: not_started
source_used:
rows_added: 0
blocked_reason:
reviewer:
`
  );
  fs.writeFileSync(path.join(root, promptPath), "Do not edit any other files. Fill only the staging CSV and acquisition report.\n");
  fs.writeFileSync(
    path.join(runDir, "demand-acquisition-tasks", "tasks.json"),
    `${JSON.stringify(
      {
        run_date: runDate,
        task_count: 1,
        tasks: [
          {
            run_date: runDate,
            task_id: taskId,
            priority: "P0",
            candidate_id: "query-fixture",
            topic_id: "topic-fixture",
            pillar_id: "pillar-fixture",
            topic: "fixture topic",
            import_rank: 1,
            primary_recommended_import: "yes",
            recommended_import_type: "reviewed_generic_query_tool_export",
            acquisition_method: "reviewed_query_tool_or_first_party_export",
            query_or_topic_to_validate: "What is fixture topic?",
            staging_csv_path: stagingPath,
            final_destination_path: `imports/query-exports/${runDate}-fixture.csv`,
            report_path: reportPath,
            prompt_path: promptPath,
            status: "needs_browser_or_export_acquisition",
            report_status: "not_started",
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

function writeSourceRequestLock(root, runDate) {
  const requestDir = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks");
  ensureDir(requestDir);
  fs.writeFileSync(
    path.join(requestDir, "source-request.json"),
    `${JSON.stringify(
      {
        run_date: runDate,
        status: "escalation_required",
        source_probe_lock: {
          active: true,
          reason: "fixture lock",
        },
        requested_export_count: 1,
      },
      null,
      2
    )}\n`
  );
}

function run() {
  const root = process.cwd();
  const runDate = "2099-01-09";
  cleanup(root, runDate);
  try {
    writeFixture(root, runDate);
    runNode(root, ["scripts/seo-aeo/build-subagent-queue.mjs", "--date", runDate, "--limit", "1"]);
    runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", runDate, "--max", "3"]);

    const queue = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-queue.json"), "utf8"));
    const dispatch = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json"), "utf8"));
    assert(queue.demand_acquisition_task_count === 1, `expected one acquisition task, got ${queue.demand_acquisition_task_count}`);
    assert(queue.tasks[0].task_type === "demand_acquisition", `expected first queue task to be demand_acquisition, got ${queue.tasks[0].task_type}`);
    assert(queue.tasks.some((task) => task.role === "Orchestrator"), "fixture should include a ready lifecycle task after acquisition.");
    assert(dispatch.counts.ready_tasks >= 2, `expected acquisition plus lifecycle ready tasks, got ${dispatch.counts.ready_tasks}`);
    assert(dispatch.dispatch_mode === "demand_acquisition", `expected demand_acquisition dispatch mode, got ${dispatch.dispatch_mode}`);
    assert(dispatch.suppressed_ready_task_count >= 1, `expected suppressed ready tasks, got ${dispatch.suppressed_ready_task_count}`);
    assert(dispatch.selected_tasks.length === 1, `expected one selected acquisition task, got ${dispatch.selected_tasks.length}`);
    const [selected] = dispatch.selected_tasks;
    assert(selected.task_type === "demand_acquisition", `expected demand_acquisition task, got ${selected.task_type}`);
    assert(selected.phase === "demand_acquisition", `expected demand_acquisition phase, got ${selected.phase}`);
    assert(selected.artifact_path.endsWith(".md"), "selected acquisition artifact should be the report markdown.");
    assert(selected.write_scope.includes(".draft.csv") && selected.write_scope.includes(".md"), "write scope should include staging CSV and report.");
    assert(selected.prompt_path.endsWith(".prompt.md"), "selected task should have a prompt path.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand_acquisition_dispatch",
          selected_task: selected.task_id,
          ready_tasks: dispatch.counts.ready_tasks,
        },
        null,
        2
      )
    );
  } finally {
    cleanup(root, runDate);
  }

  const lockedRunDate = "2099-01-11";
  cleanup(root, lockedRunDate);
  try {
    writeFixture(root, lockedRunDate);
    writeSourceRequestLock(root, lockedRunDate);
    runNode(root, ["scripts/seo-aeo/build-subagent-queue.mjs", "--date", lockedRunDate, "--limit", "1"]);
    runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", lockedRunDate, "--max", "3"]);
    const queue = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", lockedRunDate, "subagent-queue.json"), "utf8"));
    const dispatch = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", lockedRunDate, "subagent-dispatch", "ready-batch.json"), "utf8"));
    assert(queue.source_request_lock.active === true, "queue should record active source request lock.");
    assert(queue.demand_acquisition_task_count === 0, `locked queue should suppress acquisition tasks, got ${queue.demand_acquisition_task_count}`);
    assert(queue.demand_acquisition_suppressed_task_count === 1, `locked queue should suppress one acquisition task, got ${queue.demand_acquisition_suppressed_task_count}`);
    assert(dispatch.dispatch_mode === "source_lock_local_handoff", `locked dispatch should use source_lock_local_handoff, got ${dispatch.dispatch_mode}`);
    assert(dispatch.selected_tasks.length >= 1, `locked dispatch should select safe local tasks, got ${dispatch.selected_tasks.length}`);
    assert(dispatch.selected_tasks.every((task) => task.task_type !== "demand_acquisition"), "locked dispatch must not select demand acquisition tasks.");
    assert(dispatch.selected_tasks.some((task) => task.role === "Orchestrator"), "locked dispatch should allow the safe local Orchestrator handoff.");
    for (const args of [["--role", "Orchestrator"], ["--candidate", "query-fixture"]]) {
      runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", lockedRunDate, "--max", "3", ...args]);
      const filteredDispatch = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", lockedRunDate, "subagent-dispatch", "ready-batch.json"), "utf8"));
      assert(
        filteredDispatch.dispatch_mode === "source_lock_local_handoff",
        `locked filtered dispatch ${args.join(" ")} should use source_lock_local_handoff, got ${filteredDispatch.dispatch_mode}`
      );
      assert(filteredDispatch.selected_tasks.length >= 1, `locked filtered dispatch ${args.join(" ")} should select safe local tasks.`);
      assert(
        filteredDispatch.selected_tasks.every((task) => task.task_type !== "demand_acquisition"),
        `locked filtered dispatch ${args.join(" ")} must not select demand acquisition tasks.`
      );
    }
    runNode(root, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", lockedRunDate, "--max", "3", "--include-blocked"]);
    const includeBlockedDispatch = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", lockedRunDate, "subagent-dispatch", "ready-batch.json"), "utf8"));
    assert(
      includeBlockedDispatch.selected_tasks.every((task) => task.task_type !== "demand_acquisition"),
      "locked include-blocked dispatch must still suppress demand acquisition tasks."
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand_acquisition_dispatch_source_lock",
          suppressed_tasks: queue.demand_acquisition_suppressed_task_count,
          dispatch_mode: dispatch.dispatch_mode,
          selected_safe_tasks: dispatch.selected_tasks.length,
        },
        null,
        2
      )
    );
  } finally {
    cleanup(root, lockedRunDate);
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
