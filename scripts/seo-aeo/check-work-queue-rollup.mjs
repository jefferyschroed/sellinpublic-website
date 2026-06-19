#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-02-01";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFixture(root) {
  const runDir = path.join(root, "automation-runs", RUN_DATE);
  const planDir = path.join(root, "research", "daily-content-plan", RUN_DATE);
  writeJson(path.join(runDir, "subagent-dispatch", "ready-batch.json"), {
    run_date: RUN_DATE,
    dispatch_mode: "default",
    source_request_status: "",
    selected_tasks: [
      {
        task_id: "canonical-fixture",
        role: "Source Registry Agent",
        phase: "source_readiness",
        candidate_id: "query-100",
        topic: "employee generated content examples",
        artifact_path: `research/daily-content-plan/${RUN_DATE}/source-gaps-query-100.md`,
        prompt_path: `automation-runs/${RUN_DATE}/subagent-dispatch/prompts/canonical-fixture.prompt.md`,
        dispatch_status: "ready",
      },
    ],
    blocked_tasks: [],
    completed_tasks: [],
  });
  writeJson(path.join(runDir, "ai-citation-capture-tasks", "tasks.json"), {
    run_date: RUN_DATE,
    status: "tasks_ready",
    tasks: [
      {
        task_id: "ai-citation-fixture",
        capture_id: "fixture-capture:chatgpt",
        query: "what is employee-generated content",
        surface: "chatgpt",
        report_path: `automation-runs/${RUN_DATE}/ai-citation-capture-tasks/reports/ai-citation-fixture.md`,
        row_csv_path: `automation-runs/${RUN_DATE}/ai-citation-capture-tasks/rows/ai-citation-fixture.csv`,
        prompt_path: `automation-runs/${RUN_DATE}/ai-citation-capture-tasks/prompts/ai-citation-fixture.prompt.md`,
        status: "not_started",
        allowed_use: "visibility_monitoring_only",
      },
      {
        task_id: "ai-citation-complete-fixture",
        capture_id: "fixture-capture:perplexity",
        query: "employee-generated content examples",
        surface: "perplexity",
        report_path: `automation-runs/${RUN_DATE}/ai-citation-capture-tasks/reports/ai-citation-complete-fixture.md`,
        prompt_path: `automation-runs/${RUN_DATE}/ai-citation-capture-tasks/prompts/ai-citation-complete-fixture.prompt.md`,
        status: "captured_observation",
        allowed_use: "visibility_monitoring_only",
      },
    ],
  });
  writeJson(path.join(runDir, "skill-steward-review-tasks", "tasks.json"), {
    run_date: RUN_DATE,
    status: "tasks_ready",
    tasks: [
      {
        task_id: "skill-review-fixture",
        candidate_id: "fixture-learning",
        target_skill: "sellinpublic-blog-qa",
        proposed_change: "Add a reusable fixture guard.",
        report_path: `automation-runs/${RUN_DATE}/skill-steward-review-tasks/reports/skill-review-fixture.md`,
        prompt_path: `automation-runs/${RUN_DATE}/skill-steward-review-tasks/prompts/skill-review-fixture.prompt.md`,
        status: "not_started",
        allowed_use: "process_learning_review_only",
      },
    ],
  });
  writeJson(path.join(planDir, "gap-ledger.json"), {
    run_date: RUN_DATE,
    row_count: 4,
    active_row_count: 3,
    stale_row_count: 1,
    rows: [
      {
        candidate_id: "query-100",
        topic: "employee-generated content examples",
        artifact_identity_status: "current_candidate",
        gap_type: "source_readiness",
        gap_code: "source_readiness_needs_source_refresh",
        owner: "source_registry_agent",
        status: "open",
        source_path: `research/daily-content-plan/${RUN_DATE}/topic-candidates.csv`,
        required_action: "Resolve source readiness before packet intake.",
      },
      {
        candidate_id: "query-100",
        topic: "employee-generated content examples",
        artifact_identity_status: "current_candidate",
        gap_type: "source_readiness",
        gap_code: "source_readiness_needs_source_refresh",
        owner: "source_registry_agent",
        status: "open",
        source_path: `research/daily-content-plan/${RUN_DATE}/source-gaps-query-100.md`,
        required_action: "Resolve source readiness before packet intake.",
      },
      {
        candidate_id: "query-101",
        topic: "employee advocacy",
        artifact_identity_status: "current_candidate",
        gap_type: "validated_demand",
        gap_code: "validated_demand_not_validated",
        owner: "query_intelligence_agent",
        status: "open",
        required_action: "Resolve validated_demand before packet intake.",
      },
      {
        candidate_id: "query-001",
        artifact_identity_status: "stale_artifact_candidate_missing",
        gap_type: "artifact_lineage",
        gap_code: "stale_artifact_candidate_missing",
        owner: "orchestrator",
        status: "stale_artifact",
        required_action: "Do not route stale artifacts.",
      },
    ],
  });
  writeJson(path.join(runDir, "run-status.json"), {
    run_date: RUN_DATE,
    overall_status: "blocked_before_generation",
    demand_acquisition_report_rollup: {
      source_request: {
        status: "escalation_required",
        source_probe_lock: { active: true },
      },
    },
  });
  writeJson(path.join(runDir, "owner-actions.json"), {
    run_date: RUN_DATE,
    overall_status: "blocked_before_generation",
    source_handoff: { active_lock: true },
    next_action: { action: "fixture" },
  });
}

function runBuilder(repo, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/build-work-queue-rollup.mjs"), "--date", RUN_DATE],
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-work-queue-rollup-"));
  try {
    writeFixture(tempRoot);
    const output = runBuilder(repo, tempRoot);
    assert(output.status === "ready_to_dispatch", `expected ready_to_dispatch, got ${output.status}`);
    assert(output.safe_to_dispatch === 3, `expected 3 safe tasks, got ${output.safe_to_dispatch}`);

    const runDir = path.join(tempRoot, "automation-runs", RUN_DATE);
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "work-queue-rollup.json"), "utf8"));
    assert(report.summary.source_request_lock_active === true, "expected source lock active.");
    assert(report.summary.safe_to_dispatch_count === 3, `expected 3 safe tasks, got ${report.summary.safe_to_dispatch_count}`);
    assert(report.summary.demand_gap_rows === 1, `expected 1 demand gap excluded, got ${report.summary.demand_gap_rows}`);
    assert(report.summary.routed_gap_groups === 1, `expected grouped gap count 1, got ${report.summary.routed_gap_groups}`);

    const safeSources = report.tasks.filter((task) => task.safe_to_dispatch).map((task) => task.source).sort();
    assert(
      safeSources.join(",") === "ai_citation_capture,canonical_subagent_dispatch,skill_steward_review",
      `unexpected safe sources: ${safeSources.join(",")}`
    );
    assert(!report.tasks.some((task) => /validated_demand/.test(`${task.queue_id} ${task.blocked_reason} ${task.next_action}`)), "demand gaps should be excluded.");
    const gap = report.tasks.find((task) => task.source === "gap_ledger");
    assert(gap && gap.safe_to_dispatch === false, "expected routing-only gap item.");
    assert(gap.source_refs.length === 2, `expected grouped gap refs, got ${gap.source_refs.length}`);

    const csv = parseCsv(fs.readFileSync(path.join(runDir, "work-queue-rollup.csv"), "utf8"));
    assert(csv.rows.length === report.tasks.length, "CSV row count should match JSON tasks.");
    const markdown = fs.readFileSync(path.join(runDir, "work-queue-rollup.md"), "utf8");
    assert(markdown.includes("Launch one subagent per safe task"), "expected one-subagent rule in markdown.");
    assert(markdown.includes("Demand/query-handoff gap rows excluded"), "expected demand gap summary in markdown.");

    console.log(JSON.stringify({ ok: true, fixture: "work-queue-rollup" }, null, 2));
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
