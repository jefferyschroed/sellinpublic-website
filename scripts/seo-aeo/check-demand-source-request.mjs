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
  fs.rmSync(path.join(root, "research", "daily-content-plan", runDate), { recursive: true, force: true });
  fs.rmSync(path.join(root, "automation-runs", runDate), { recursive: true, force: true });
}

function writeBlockedReport(root, runDate, taskId, candidateId, reason) {
  const reportDir = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "reports");
  ensureDir(reportDir);
  fs.writeFileSync(
    path.join(reportDir, `${taskId}.md`),
    `# Demand Acquisition Report

task_id: ${taskId}
candidate_id: ${candidateId}
status: blocked_no_reviewed_rows
source_used: none
rows_added: 0
blocked_reason: ${reason}
reviewer: qa
`
  );
}

function writeFixture(root, runDate) {
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  const packDir = path.join(planDir, "demand-import-pack");
  ensureDir(packDir);
  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic_id,pillar_id,parent_topic,topic,canonical_topic,intent,aeo_question,topic_score_guess,gate_reasons,source_readiness,packet_intake_status,topic_decision,coverage_status,coverage_role,authority_match\n" +
      `${runDate},query-source-a,topic-a,pillar-a,,source request A,Source Request A,commercial,What is source request A?,91,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n` +
      `${runDate},query-source-b,topic-b,pillar-a,,source request B,Source Request B,commercial,What is source request B?,88,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n`
  );
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify(
      {
        review_rows: [
          {
            candidate_id: "query-source-a",
            import_rank: 1,
            recommended_import_type: "gsc_search_query_export",
            query_or_topic_to_validate: "What is source request A?",
            staging_csv_path: `research/daily-content-plan/${runDate}/demand-import-pack/${runDate}-gsc-a.draft.csv`,
            final_destination_path: `imports/query-exports/${runDate}-gsc-a.csv`,
            required_review_fields: "date,source,property_id,reviewed_by,query,impressions",
          },
          {
            candidate_id: "query-source-b",
            import_rank: 1,
            recommended_import_type: "reviewed_generic_query_tool_export",
            query_or_topic_to_validate: "What is source request B?",
            staging_csv_path: `research/daily-content-plan/${runDate}/demand-import-pack/${runDate}-generic-b.draft.csv`,
            final_destination_path: `imports/query-exports/${runDate}-generic-b.csv`,
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  writeBlockedReport(root, runDate, "query-old-001-acquire-rank1-reviewed-generic-query-tool-export", "query-old-001", "No accessible reviewed export.");
  writeBlockedReport(root, runDate, "query-old-002-acquire-rank1-reviewed-generic-query-tool-export", "query-old-002", "HTTP 429 from source.");
  writeBlockedReport(root, runDate, "query-old-003-acquire-rank1-reviewed-generic-query-tool-export", "query-old-003", "Only discovery-only inputs were available.");
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `${args.join(" ")} failed: ${output}`);
}

function run() {
  const root = process.cwd();
  const runDate = "2099-01-10";
  cleanup(root, runDate);
  try {
    const dailyRunnerSource = fs.readFileSync(path.join(root, "scripts", "seo-aeo", "daily-runner.mjs"), "utf8");
    const promotionRunnerSource = fs.readFileSync(path.join(root, "scripts", "seo-aeo", "run-demand-promotion.mjs"), "utf8");
    const summarizeIndex = dailyRunnerSource.indexOf('"Summarize demand acquisition reports"');
    const sourceRequestValidateIndex = dailyRunnerSource.indexOf('"Validate source-request demand import pack"');
    assert(summarizeIndex >= 0, "daily runner should summarize demand acquisition reports.");
    assert(sourceRequestValidateIndex > summarizeIndex, "daily runner should validate source-request demand rows after source-request generation.");
    assert(
      promotionRunnerSource.includes("Run plain --apply first") &&
        promotionRunnerSource.includes("Review the promotion report before any scaffolded apply."),
      "promotion dry-run guidance should require plain apply before scaffolded apply."
    );
    assert(
      !promotionRunnerSource.includes("Dry-run passed. If the rows are approved, run `node scripts/seo-aeo/run-demand-promotion.mjs --date ${args.runDate} --apply --scaffold-limit 1`"),
      "promotion dry-run guidance must not recommend scaffolded apply directly."
    );
    writeFixture(root, runDate);
    runNode(root, ["scripts/seo-aeo/summarize-demand-acquisition-reports.mjs", "--date", runDate]);
    const rollup = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "report-rollup.json"), "utf8"));
    const requestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
    const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
    const requestMarkdown = fs.readFileSync(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.md"), "utf8");
    assert(rollup.source_request.status === "escalation_required", `rollup should reference escalation_required, got ${rollup.source_request.status}`);
    assert(request.status === "escalation_required", `source request should be required, got ${request.status}`);
    assert(request.source_probe_lock.active === true, "source request should activate source probe lock.");
    assert(request.requested_export_count === 2, `expected two requested exports, got ${request.requested_export_count}`);
    assert(request.normalization_guidance, "source request should include normalization guidance.");
    assert(request.source_specific_alternate_route, "source request should include source-specific alternate-route guidance.");
    assert(
      request.requested_exports.some((item) => item.recommended_import_type === "gsc_search_query_export"),
      "source request should include GSC export ask."
    );
    assert(
      request.requested_exports.some((item) => item.recommended_import_type === "reviewed_generic_query_tool_export"),
      "source request should include reviewed generic export ask."
    );
    assert(request.next_commands_after_owner_input.length === 4, "source request should include the four-command default owner sequence.");
    assert(
      request.next_commands_after_owner_input[0].includes("stage-reviewed-demand-export.mjs") &&
        request.next_commands_after_owner_input[0].includes("--dry-run"),
      "source request first command should stage reviewed demand export in dry-run mode."
    );
    assert(
      request.next_commands_after_owner_input[1].includes("stage-reviewed-demand-export.mjs") &&
        request.next_commands_after_owner_input[1].includes("--apply"),
      "source request second command should apply staging rows."
    );
    assert(
      request.next_commands_after_owner_input[2] === `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
      "source request third command should dry-run promotion."
    );
    assert(
      request.next_commands_after_owner_input[3] === `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply`,
      "source request fourth command should apply promotion without scaffolding."
    );
    assert(
      request.optional_scaffold_command_after_packet_approval === `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --scaffold-limit 1`,
      "source request should expose scaffolded apply only as an optional packet-approval command."
    );
    assert(request.scaffold_command_requires_approval === true, "source request should mark scaffolded apply as approval-gated.");
    assert(requestMarkdown.includes("Google Search Console"), "source request markdown should name Google Search Console.");
    assert(requestMarkdown.includes("Ahrefs"), "source request markdown should name reviewed query-tool options.");
    assert(requestMarkdown.includes("Source probe lock: active"), "source request markdown should expose active source probe lock.");
    assert(requestMarkdown.includes("## Normalization Route"), "source request markdown should include normalization-route guidance.");
    assert(
      requestMarkdown.includes("Do not stage source-specific Google Search Console"),
      "source request markdown should clarify source-specific imports are not generic rows."
    );
    const commandSequenceIndex = requestMarkdown.indexOf("Command sequence:");
    const stageDryRunIndex = requestMarkdown.indexOf("stage-reviewed-demand-export.mjs", commandSequenceIndex);
    const stageApplyIndex = requestMarkdown.indexOf("--apply", stageDryRunIndex);
    const promotionDryRunIndex = requestMarkdown.indexOf("run-demand-promotion.mjs", stageApplyIndex);
    const promotionApplyIndex = requestMarkdown.indexOf(`run-demand-promotion.mjs --date ${runDate} --apply`, promotionDryRunIndex);
    const optionalScaffoldIndex = requestMarkdown.indexOf("Optional scaffold command after packet approval:", promotionApplyIndex);
    const scaffoldApplyIndex = requestMarkdown.indexOf("--apply --scaffold-limit 1", optionalScaffoldIndex);
    assert(commandSequenceIndex >= 0, "source request markdown should include per-export command sequences.");
    assert(stageDryRunIndex >= 0, "source request markdown should include staging dry-run command.");
    assert(stageApplyIndex > stageDryRunIndex, "source request markdown should include staging apply after dry-run.");
    assert(promotionDryRunIndex > stageApplyIndex, "source request markdown should include promotion dry-run after staging apply.");
    assert(promotionApplyIndex > promotionDryRunIndex, "source request markdown should include promotion apply after promotion dry-run.");
    assert(optionalScaffoldIndex > promotionApplyIndex, "source request markdown should label scaffold apply as optional after plain promotion apply.");
    assert(scaffoldApplyIndex > optionalScaffoldIndex, "source request markdown should include the optional scaffold command only under the optional label.");
    fs.writeFileSync(
      path.join(root, "automation-runs", runDate, "run-status.json"),
      `${JSON.stringify(
        {
          run_date: runDate,
          overall_status: "needs_validated_query_demand",
          demand_acquisition_report_rollup: {
            blocked_no_reviewed_rows: 3,
            source_request: rollup.source_request,
          },
          demand_acquisition_tasks: {
            task_count: 1,
            first_task: {
              task_id: "query-source-a-acquire-rank1-gsc-search-query-export",
              candidate_id: "query-source-a",
              topic: "source request A",
              staging_csv_path: `research/daily-content-plan/${runDate}/demand-import-pack/${runDate}-gsc-a.draft.csv`,
              report_path: `automation-runs/${runDate}/demand-acquisition-tasks/reports/query-source-a-acquire-rank1-gsc-search-query-export.md`,
              prompt_path: `automation-runs/${runDate}/demand-acquisition-tasks/prompts/query-source-a-acquire-rank1-gsc-search-query-export.prompt.md`,
            },
          },
        },
        null,
        2
      )}\n`
    );
    fs.writeFileSync(
      path.join(root, "automation-runs", runDate, "run-gates-daily.json"),
      `${JSON.stringify({ gate_status: "blocked", blockers: [] }, null, 2)}\n`
    );
    runNode(root, ["scripts/seo-aeo/write-owner-actions.mjs", "--date", runDate]);
    const ownerActions = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "owner-actions.json"), "utf8"));
    assert(ownerActions.owner_prompt.includes("source-request.md"), "owner prompt should point at source-request.md.");
    assert(ownerActions.owner_prompt.includes("staging dry-run"), "owner prompt should mention source-request staging dry-run.");
    assert(ownerActions.owner_prompt.includes("staging apply"), "owner prompt should mention source-request staging apply.");
    assert(ownerActions.owner_prompt.includes("promotion dry-run"), "owner prompt should mention promotion dry-run.");
    assert(ownerActions.source_handoff?.active_lock === true, "owner actions should include an active source_handoff lock.");
    assert(ownerActions.source_handoff?.requested_export_count === 2, "source_handoff should include requested export count.");
    assert(ownerActions.source_handoff?.normalization_guidance, "source_handoff should include normalization guidance.");
    assert(
      ownerActions.source_handoff?.first_eligible_request?.command_sequence?.some((command) => command.includes("stage-reviewed-demand-export.mjs") && command.includes("--apply")),
      "source_handoff should include staging apply command."
    );
    assert(
      ownerActions.source_handoff?.requested_exports?.every((request) => request.validation_status),
      "source_handoff should include validation status for each requested export."
    );
    assert(!ownerActions.owner_prompt.includes("Launch exactly one demand_acquisition subagent"), "owner prompt must not launch demand acquisition while locked.");
    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand_source_request",
          requested_export_count: request.requested_export_count,
          source_request_status: request.status,
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
