#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";

const FIXTURE_DATE = "2099-01-13";

function cleanup(root) {
  fs.rmSync(path.join(root, "automation-runs", FIXTURE_DATE), { recursive: true, force: true });
  fs.rmSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE), { recursive: true, force: true });
}

function writeBaseFixture(root, stagingHasRows) {
  const planDir = ensureDir(path.join(root, "research", "daily-content-plan", FIXTURE_DATE));
  const packDir = ensureDir(path.join(planDir, "demand-import-pack"));
  const reportDir = ensureDir(path.join(root, "automation-runs", FIXTURE_DATE, "demand-acquisition-tasks", "reports"));
  const stagingPath = path.join(packDir, "fixture.draft.csv");
  const stagingRelative = path.relative(root, stagingPath).split(path.sep).join("/");
  const destinationRelative = `imports/query-exports/${FIXTURE_DATE}-fixture.csv`;

  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic,topic_id,pillar_id\n2099-01-13,query-001,fixture topic,topic-fixture,pillar-fixture\n"
  );
  fs.writeFileSync(stagingPath, `source,query,validated_demand,validation_source,reviewed_by\n${stagingHasRows ? "Ahrefs,fixture topic,yes,fixture export,Sell In Public QA\n" : ""}`);
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        run_date: FIXTURE_DATE,
        review_rows: [
          {
            candidate_id: "query-001",
            import_rank: "1",
            priority: "P0",
            priority_reason: "fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            staging_csv_path: stagingRelative,
            final_destination_path: destinationRelative,
            query_or_topic_to_validate: "fixture topic",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(reportDir, "query-001-acquire-rank1-reviewed-generic-query-tool-export.md"),
    `task_id: query-001-acquire-rank1-reviewed-generic-query-tool-export\ncandidate_id: query-001\nstatus: staged_reviewed_rows\nsource_used: fixture\nrows_added: 1\nblocked_reason:\n`
  );
}

function writeFallbackFixture(root) {
  const planDir = ensureDir(path.join(root, "research", "daily-content-plan", FIXTURE_DATE));
  const packDir = ensureDir(path.join(planDir, "demand-import-pack"));
  const reportDir = ensureDir(path.join(root, "automation-runs", FIXTURE_DATE, "demand-acquisition-tasks", "reports"));
  const stagingPath = path.join(packDir, "fixture-fallback.draft.csv");
  const stagingRelative = path.relative(root, stagingPath).split(path.sep).join("/");
  const finalRelative = `imports/query-exports/${FIXTURE_DATE}-fixture-fallback.csv`;

  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic,topic_id,pillar_id,topic_score_guess,aeo_question\n2099-01-13,query-007,current fallback topic,topic-fallback,pillar-fixture,86,How should the current fallback topic be validated?\n"
  );
  fs.writeFileSync(stagingPath, "source,query,validated_demand,validation_source,reviewed_by\n");
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify({ schema_version: "1.0", run_date: FIXTURE_DATE, review_rows: [] }, null, 2)}\n`
  );
  for (const rank of [1, 2, 3]) {
    fs.writeFileSync(
      path.join(reportDir, `query-007-acquire-rank${rank}-reviewed-generic-query-tool-export.md`),
      `task_id: query-007-acquire-rank${rank}-reviewed-generic-query-tool-export\ncandidate_id: query-007\nstatus: blocked_no_reviewed_rows\nsource_used: none\nrows_added: 0\nblocked_reason: blocked_missing_reviewed_export\n`
    );
  }
  fs.writeFileSync(
    path.join(planDir, "demand-import-review-query-007-rank1.md"),
    `# Demand Import Review: query-007 rank 1\n\ncandidate_id: query-007\nimport_status: blocked_missing_reviewed_export\nhandoff_status: blocked\n\n## Acquisition Brief\n\n- Approved source/import type: reviewed_generic_query_tool_export\n- Template path: \`docs/seo-aeo/templates/imports/generic-query-tool-export.csv\`\n- Query to run: \`How should the current fallback topic be validated?\`\n- Required review fields: \`source\`, \`query\`, \`validated_demand\`, \`validation_source\`, \`reviewed_by\`\n- Staging CSV: \`${stagingRelative}\`\n- Final destination: \`${finalRelative}\`\n`
  );
}

function runRollup(root) {
  return spawnSync(process.execPath, ["scripts/seo-aeo/summarize-demand-acquisition-reports.mjs", "--date", FIXTURE_DATE], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function readRollup(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "automation-runs", FIXTURE_DATE, "demand-acquisition-tasks", "report-rollup.json"), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCase(root, stagingHasRows, expectedCurrent, expectedAction) {
  cleanup(root);
  writeBaseFixture(root, stagingHasRows);
  const result = runRollup(root);
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `rollup fixture failed. Output: ${output}`);
  const rollup = readRollup(root);
  assert(Number(rollup.summary.current_staged_reviewed_rows || 0) === expectedCurrent, `expected current staged ${expectedCurrent}, got ${rollup.summary.current_staged_reviewed_rows}`);
  assert(rollup.recommended_action === expectedAction, `expected action ${expectedAction}, got ${rollup.recommended_action}`);
}

function run() {
  const root = process.cwd();
  try {
    runCase(root, false, 0, "continue_next_demand_acquisition_task");
    runCase(root, true, 1, "run_demand_promotion_dry_run");
    cleanup(root);
    writeFallbackFixture(root);
    const result = runRollup(root);
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `fallback rollup fixture failed. Output: ${output}`);
    const rollup = readRollup(root);
    assert(rollup.source_request.status === "escalation_required", `expected escalation_required source request, got ${rollup.source_request.status}`);
    assert(Number(rollup.source_request.requested_export_count || 0) === 1, `expected one fallback requested export, got ${rollup.source_request.requested_export_count}`);
    const sourceRequest = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", FIXTURE_DATE, "demand-acquisition-tasks", "source-request.json"), "utf8"));
    assert(sourceRequest.requested_export_source === "current_demand_import_review_artifacts", `expected review-artifact source, got ${sourceRequest.requested_export_source}`);
    assert(sourceRequest.requested_exports[0]?.candidate_id === "query-007", `expected query-007 fallback request, got ${sourceRequest.requested_exports[0]?.candidate_id}`);
    const sourceFile = path.join(root, "research", "daily-content-plan", FIXTURE_DATE, "fixture-reviewed-export.csv");
    fs.writeFileSync(sourceFile, "query,volume,validated_demand,validation_source,reviewed_by\nHow should the current fallback topic be validated?,10,yes,Ahrefs fixture,Sell In Public QA\n");
    let stage = spawnSync(
      process.execPath,
      [
        "scripts/seo-aeo/stage-reviewed-demand-export.mjs",
        "--date",
        FIXTURE_DATE,
        "--candidate",
        "query-007",
        "--type",
        "reviewed_generic_query_tool_export",
        "--source-file",
        path.relative(root, sourceFile).split(path.sep).join("/"),
        "--source-name",
        "Ahrefs",
        "--validation-source",
        "Ahrefs fixture",
        "--reviewed-by",
        "Sell In Public QA",
        "--apply",
      ],
      { cwd: root, encoding: "utf8", env: process.env }
    );
    assert(stage.status === 0, `source-request fallback staging should apply. Output: ${(stage.stdout || "") + (stage.stderr || "")}`);
    const validation = spawnSync(
      process.execPath,
      ["scripts/seo-aeo/validate-demand-import-pack.mjs", "--date", FIXTURE_DATE, "--fail-on-none-valid"],
      { cwd: root, encoding: "utf8", env: process.env }
    );
    assert(validation.status === 0, `source-request fallback validation should pass. Output: ${(validation.stdout || "") + (validation.stderr || "")}`);
    const validationReport = JSON.parse(fs.readFileSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE, "demand-import-pack", "validation-report.json"), "utf8"));
    assert(Number(validationReport.valid_for_promotion || 0) === 1, `expected one source-request row valid for promotion, got ${validationReport.valid_for_promotion}`);
    const refreshedRollupResult = runRollup(root);
    const refreshedOutput = `${refreshedRollupResult.stdout || ""}${refreshedRollupResult.stderr || ""}`.trim();
    assert(refreshedRollupResult.status === 0, `refreshed fallback rollup fixture failed. Output: ${refreshedOutput}`);
    const refreshedRollup = readRollup(root);
    assert(
      Number(refreshedRollup.summary.source_request_valid_for_promotion || 0) === 1,
      `expected refreshed rollup to count one source-request valid row, got ${refreshedRollup.summary.source_request_valid_for_promotion}`
    );
    assert(
      refreshedRollup.recommended_action === "run_demand_promotion_dry_run",
      `expected refreshed rollup to recommend promotion dry-run, got ${refreshedRollup.recommended_action}`
    );
  } finally {
    cleanup(root);
  }
  console.log(JSON.stringify({ ok: true, fixture: "demand-acquisition-rollup" }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
