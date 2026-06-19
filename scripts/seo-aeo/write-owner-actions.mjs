#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";

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

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function actionRank(action) {
  const priority = String(action.priority || "P9").toUpperCase();
  const match = priority.match(/^P(\d+)/);
  return match ? Number(match[1]) : 9;
}

function actionTieBreak(action) {
  const order = {
    regenerate_deploy_review_packet: 0,
    fix_live_deployment_routes: 1,
    review_deploy_packet_for_approval: 2,
    run_demand_promotion: 3,
    provide_reviewed_demand_source_access: 4,
  };
  return order[action.action] ?? 50;
}

function canonicalNextAction(actions) {
  return [...actions]
    .filter((action) => action && action.action)
    .sort((a, b) => actionRank(a) - actionRank(b) || actionTieBreak(a) - actionTieBreak(b))[0] || null;
}

function demandAcquisition(runStatus, actions) {
  const action =
    actions.find((item) => item.action === "use_demand_acquisition_brief") ||
    actions.find((item) => item.action === "satisfy_demand_readiness_prerequisites") ||
    null;
  const next = runStatus.demand_readiness?.next_unambiguous_action || runStatus.demand_acquisition?.next_action || {};
  const firstTask = runStatus.demand_acquisition_tasks?.first_task || {};
  return {
    action,
    candidate_id: firstTask.candidate_id || next.candidate_id || next.candidate || "",
    topic: firstTask.topic || next.topic || "",
    staging_csv_path: firstTask.staging_csv_path || next.staging_csv_path || "",
    final_destination_path: firstTask.final_destination_path || next.final_destination_path || "",
    acquisition_brief_path: runStatus.demand_acquisition?.markdown_path || "research/daily-content-plan/<date>/demand-acquisition-brief.md",
    task_count: runStatus.demand_acquisition_tasks?.task_count || 0,
    task_batch_path: runStatus.demand_acquisition_tasks?.markdown_path || "",
    first_task_id: firstTask.task_id || "",
    first_task_prompt_path: firstTask.prompt_path || "",
    first_task_report_path: firstTask.report_path || "",
    first_task_report_status: firstTask.report_status || "",
    first_task_blocked_reason: firstTask.blocked_reason || "",
    report_rollup_path: runStatus.demand_acquisition_report_rollup?.markdown_path || "",
    blocked_report_count: runStatus.demand_acquisition_report_rollup?.blocked_no_reviewed_rows || 0,
    current_staged_reviewed_rows: runStatus.demand_acquisition_report_rollup?.current_staged_reviewed_rows || 0,
    stale_staged_reviewed_rows: runStatus.demand_acquisition_report_rollup?.stale_staged_reviewed_rows || 0,
    report_rollup_recommended_action: runStatus.demand_acquisition_report_rollup?.recommended_action || "",
    source_request_path: runStatus.demand_acquisition_report_rollup?.source_request?.markdown_path || "",
    source_request_status: runStatus.demand_acquisition_report_rollup?.source_request?.status || "",
    source_request_count: runStatus.demand_acquisition_report_rollup?.source_request?.requested_export_count ?? "",
  };
}

function selectedTasks(dispatch) {
  return (dispatch.selected_tasks || []).map((task) => ({
    task_id: task.task_id,
    task_type: task.task_type || "",
    role: task.role,
    phase: task.phase,
    candidate_id: task.candidate_id,
    topic: task.topic,
    artifact_path: task.artifact_path,
    prompt_path: task.prompt_path,
  }));
}

function aiCitationCapture(runStatus) {
  const querySet = runStatus.analytics?.ai_citation_query_set || {};
  const capturePack = querySet.capture_pack || {};
  const captureTasks = querySet.capture_tasks || {};
  const captureRowStaging = querySet.capture_row_staging || {};
  const importPreflight = querySet.import_preflight || {};
  return {
    status: querySet.status || "",
    expected_captures: querySet.expected_captures || 0,
    reviewed_captures: querySet.reviewed_captures || 0,
    missing_captures: querySet.missing_captures || 0,
    capture_pack_status: capturePack.status || "",
    capture_rows: capturePack.capture_rows || 0,
    capture_pack_csv: capturePack.capture_pack_csv || "",
    import_skeleton_csv: capturePack.import_skeleton_csv || "",
    markdown_path: capturePack.markdown_path || "",
    task_batch_status: captureTasks.status || "",
    task_count: captureTasks.task_count || 0,
    task_not_started_count: captureTasks.not_started_count || 0,
    task_completed_row_count: captureTasks.completed_row_count || 0,
    task_markdown_path: captureTasks.markdown_path || "",
    task_prompts_dir: captureTasks.prompts_dir || "",
    first_task_prompt_path: captureTasks.first_task?.prompt_path || "",
    first_task_report_path: captureTasks.first_task?.report_path || "",
    first_task_row_csv_path: captureTasks.first_task?.row_csv_path || "",
    row_staging_status: captureRowStaging.status || "",
    row_staging_valid_rows: captureRowStaging.valid_completed_rows || 0,
    row_staging_blockers: captureRowStaging.row_blockers || 0,
    row_staging_blocked_reports: captureRowStaging.blocked_reports || 0,
    row_staging_not_started: captureRowStaging.not_started || 0,
    row_staging_markdown_path: captureRowStaging.markdown_path || "",
    row_staging_import_csv: captureRowStaging.import_csv || "",
    import_preflight_status: importPreflight.status || "",
    import_preflight_valid_rows: importPreflight.valid_rows || 0,
    import_preflight_invalid_rows: importPreflight.invalid_rows || 0,
    import_preflight_markdown_path: importPreflight.markdown_path || "",
  };
}

function manualRedditCapture(runStatus) {
  return runStatus.discovery?.manual_reddit_capture || {
    lane_status: "",
    import_dir: "imports/reddit-manual-captures",
    template_path: "docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv",
    input_file_count: 0,
    input_row_count: 0,
    normalized_row_count: 0,
    source_count: 0,
    api_step_status: "",
    api_skipped: true,
    api_used: false,
    fixture_step_status: "",
    fixture_unsafe_rows_rejected: null,
    rule:
      "Sanitized manual Reddit captures can route topic/source-gap work only. They cannot validate demand, support factual claims, or unlock packet intake without separate validated demand and source readiness.",
  };
}

function skillSteward(runStatus) {
  const steward = runStatus.skill_steward || {};
  return {
    decision: "missing",
    path: "",
    markdown_path: "",
    learning_candidate_count: 0,
    valid_candidate_count: 0,
    invalid_candidate_count: 0,
    learning_candidate_files: [],
    review_tasks: {
      status: "missing",
      task_count: 0,
      not_started_count: 0,
      report_present_count: 0,
      markdown_path: "",
      first_task: null,
    },
    rule:
      "Skill learning candidates are review inputs only. Promotion still requires evidence, validation, forward testing, and human approval before any repo-local or global skill change.",
    ...steward,
  };
}

function deployReview(runStatus) {
  return runStatus.deploy_review || {
    status: "missing",
    freshness_status: "missing",
    path: "",
    markdown_path: "",
    approval_required: true,
    deploy_static_changed_count: 0,
    netlify_build_support_changed_count: 0,
    process_review_changed_count: 0,
    local_only_count: 0,
    uncategorized_changed_count: 0,
    blockers: [],
    next_action: "",
  };
}

function isDemandAcquisitionTask(task) {
  return task.task_type === "demand_acquisition" || task.phase === "demand_acquisition";
}

function dispatchAlignment(report) {
  const expectedTaskId = report.demand_acquisition?.first_task_id || "";
  const selected = report.ready_subagent_tasks || [];
  const selectedDemand = selected.filter(isDemandAcquisitionTask);
  if (report.subagent_dispatch?.mode === "source_lock_local_handoff") {
    return {
      status: "source_lock_local_handoff_selected",
      expected_task_id: expectedTaskId,
      canonical_dispatch_path: report.subagent_dispatch.path || "",
      required_action: "launch_only_selected_safe_local_handoff_prompts",
    };
  }
  if (!expectedTaskId && report.overall_status !== "needs_validated_query_demand") {
    return {
      status: "not_applicable",
      expected_task_id: "",
      canonical_dispatch_path: report.subagent_dispatch.path || "",
      required_action: "",
    };
  }
  if (expectedTaskId && selected.length === 1 && selectedDemand[0]?.task_id === expectedTaskId) {
    return {
      status: "aligned_demand_acquisition_ready_batch",
      expected_task_id: expectedTaskId,
      canonical_dispatch_path: report.subagent_dispatch.path || "",
      required_action: "launch_exactly_one_ready_batch_demand_acquisition_prompt",
    };
  }
  return {
    status: "mismatch_ready_batch_does_not_include_exactly_one_demand_acquisition_task",
    expected_task_id: expectedTaskId,
    canonical_dispatch_path: report.subagent_dispatch.path || "",
    required_action: "rebuild_subagent_queue_and_dispatch_after_demand_acquisition_tasks",
  };
}

function topBlockers(gates) {
  return (gates.blockers || []).slice(0, 8).map((blocker) => ({
    code: blocker.code,
    detail: blocker.detail,
    evidence: blocker.evidence,
  }));
}

function commandSequenceFor(runDate, request) {
  const dryRun =
    request.normalization_command ||
    `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${request.candidate_id || "<candidate-id>"} --type ${request.recommended_import_type || "<import-type>"} --source-file <raw-export.csv> --reviewed-by <name> --dry-run`;
  const apply = dryRun.includes("--dry-run") ? dryRun.replace("--dry-run", "--apply") : `${dryRun} --apply`;
  return [
    dryRun,
    apply,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}`,
  ];
}

function scaffoldCommandFor(runDate) {
  return `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --scaffold-limit 1`;
}

function validationKey(row) {
  return `${row.candidate_id || ""}|${row.recommended_import_type || ""}|${row.staging_csv_path || ""}`;
}

function sourceHandoff(root, runDate) {
  const sourceRequestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  const validationPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json");
  const sourceRequest = readJson(sourceRequestPath, {});
  const validation = readJson(validationPath, {});
  const validationRows = Array.isArray(validation.rows) ? validation.rows : [];
  const validationByKey = new Map(validationRows.map((row) => [validationKey(row), row]));
  const requestedExports = (sourceRequest.requested_exports || []).map((request) => {
    const validationRow =
      validationByKey.get(validationKey(request)) ||
      validationRows.find((row) => row.candidate_id === request.candidate_id && row.recommended_import_type === request.recommended_import_type) ||
      {};
    return {
      request_id: request.request_id || "",
      priority: request.priority || "",
      candidate_id: request.candidate_id || "",
      topic: request.topic || "",
      topic_id: request.topic_id || "",
      pillar_id: request.pillar_id || "",
      import_rank: request.import_rank || "",
      recommended_import_type: request.recommended_import_type || "",
      query_or_topic_to_validate: request.query_or_topic_to_validate || "",
      staging_csv_path: request.staging_csv_path || "",
      final_destination_path: request.final_destination_path || "",
      required_review_fields: request.required_review_fields || "",
      owner_must_provide: request.owner_must_provide || "",
      validation_status: validationRow.status || "missing_validation_row",
      row_count: validationRow.row_count ?? "",
      errors: validationRow.errors || "",
      warnings: validationRow.warnings || "",
      command_sequence: commandSequenceFor(runDate, request),
      optional_scaffold_command_after_packet_approval: scaffoldCommandFor(runDate),
      scaffold_command_requires_approval: true,
      scaffold_command_gate:
        "The scaffolded apply command is optional. Run it only after plain promotion has completed, the promotion report shows a ready handoff, and packet scaffolding has been approved.",
    };
  });
  const firstEligibleRequest =
    requestedExports.find((request) => request.validation_status === "valid_for_promotion" || request.validation_status === "already_promoted") ||
    requestedExports.find((request) => request.validation_status === "empty_staging" || request.validation_status === "missing_validation_row") ||
    requestedExports[0] ||
    null;
  return {
    active_lock: String(sourceRequest.status || "").startsWith("escalation_required"),
    status: sourceRequest.status || "",
    recommended_action: sourceRequest.recommended_action || "",
    requested_export_count: sourceRequest.requested_export_count ?? requestedExports.length,
    requested_export_source: sourceRequest.requested_export_source || "",
    normalization_guidance: sourceRequest.normalization_guidance || "",
    source_specific_alternate_route: sourceRequest.source_specific_alternate_route || "",
    source_request_json: fs.existsSync(sourceRequestPath) ? relative(root, sourceRequestPath) : "",
    source_request_markdown: sourceRequest.source_request_markdown || sourceRequest.markdown_path || `automation-runs/${runDate}/demand-acquisition-tasks/source-request.md`,
    validation_report_json: fs.existsSync(validationPath) ? relative(root, validationPath) : "",
    validation_summary: {
      valid_for_promotion: validation.valid_for_promotion ?? "",
      already_promoted: validation.already_promoted ?? "",
      promoted: validation.promoted ?? "",
      blocked: validation.blocked ?? "",
      empty_staging: validation.empty_staging ?? "",
    },
    first_eligible_request: firstEligibleRequest,
    requested_exports: requestedExports,
    rule:
      "Source handoff rows are validated-demand intake only. They do not approve article claims, sources, drafting, generation, publishing, or skill changes.",
  };
}

function liveDeploymentBlocksDemandWork(report) {
  return (
    report.overall_status === "needs_live_deployment" ||
    report.next_action?.action === "fix_live_deployment_routes" ||
    report.live_deployment?.status === "blocked"
  );
}

function ownerPrompt(report) {
  if (report.next_action?.action === "regenerate_deploy_review_packet") {
    return `${report.next_action.detail || "Regenerate the deploy review packet before deploy approval."} Do not deploy, promote demand, scaffold packets, or generate content from stale deployment evidence.`;
  }
  if (report.next_action?.action === "fix_live_deployment_routes") {
    return `${report.next_action.detail || "Review the deploy review packet, deploy only after explicit approval, and rerun the live deployment check."} Do not run demand promotion, demand acquisition, content generation, or packet scaffolding until the live deploy blocker is resolved or explicitly deferred.`;
  }
  if (report.next_action?.action === "review_deploy_packet_for_approval") {
    return `${report.next_action.detail || `Review ${report.deploy_review.markdown_path || "automation-runs/<date>/deploy-review-packet.md"} before any deploy.`} Deployment approval is separate from content generation and publish approval.`;
  }
  const promotionReadyCount = Number(report.source_handoff?.validation_summary?.valid_for_promotion || 0);
  if (promotionReadyCount > 0) {
    return `${promotionReadyCount} reviewed demand staging file(s) are valid or already promoted for the guarded promotion chain. Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --dry-run\`, inspect the report, then run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${report.run_date}\` if approved. Run the scaffolded apply only after the promotion report shows a ready handoff and human packet approval exists. Do not launch more demand_acquisition subagents first.`;
  }
  if (report.next_action?.action === "complete_ai_citation_capture_pack") {
    return `Launch one subagent per AI citation capture task from ${report.ai_citation_capture.task_markdown_path || "automation-runs/<date>/ai-citation-capture-tasks/tasks.md"}. Each subagent may write only its listed report and, if captured, its one-row CSV. Do not use unofficial answer-engine scraping and do not create placeholder import rows.`;
  }
  if (report.next_action?.action === "fix_ai_citation_capture_row_blockers") {
    return `Review ${report.ai_citation_capture.row_staging_markdown_path || "automation-runs/<date>/ai-citation-capture-row-staging.md"} and fix the invalid AI citation task rows. Do not edit analytics directly; rerun \`node scripts/seo-aeo/stage-ai-citation-capture-rows.mjs --date ${report.run_date} --apply\` after correcting the task reports/rows.`;
  }
  if (report.next_action?.action === "fix_ai_citation_import_preflight") {
    return `Review ${report.ai_citation_capture.import_preflight_markdown_path || "automation-runs/<date>/ai-citation-import-preflight.md"} before importing AI citation analytics rows. Fix the staged CSV or remove invalid rows, then rerun the stage, preflight, and import commands.`;
  }
  if (report.next_action?.action === "review_skill_learning_candidates") {
    return `Launch one report-only Skill Steward subagent per task from ${report.skill_steward.review_tasks?.markdown_path || "automation-runs/<date>/skill-steward-review-tasks/tasks.md"}. Do not edit skills, SOPs, scripts, analytics, content, or global Codex files; each subagent writes only its review report and human approval remains required before any patch.`;
  }
  if (String(report.demand_acquisition?.source_request_status || "").startsWith("escalation_required")) {
    return `Do not launch another demand_acquisition subagent yet. Review ${report.demand_acquisition.source_request_path || "automation-runs/<date>/demand-acquisition-tasks/source-request.md"} and provide one reviewed demand-bearing export or verified source access with real rows. Then follow that file's per-export command sequence: staging dry-run, staging apply, promotion dry-run, and promotion apply only if the dry run passes. Do not invent demand data.`;
  }
  if (report.dispatch_alignment?.status === "aligned_demand_acquisition_ready_batch") {
    const rollupNote =
      Number(report.demand_acquisition.blocked_report_count || 0) >= 3
        ? `Review ${report.demand_acquisition.report_rollup_path || "the demand acquisition report rollup"} and ${report.demand_acquisition.source_request_path || "the demand source request"} first; ${report.demand_acquisition.blocked_report_count} acquisition attempt(s) found no reviewed rows. `
        : "";
    return `${rollupNote}Launch exactly one demand_acquisition subagent from ${report.subagent_dispatch.path} for ${report.dispatch_alignment.expected_task_id}. Do not dispatch demand-acquisition-tasks prompts directly. Do not launch gap-resolution or lifecycle prompts until validated demand is resolved. Do not invent demand data.`;
  }
  if (report.dispatch_alignment?.status === "mismatch_ready_batch_does_not_include_exactly_one_demand_acquisition_task") {
    return `Rebuild the subagent queue and dispatch batch after demand acquisition tasks. If the source-request lock is active, launch only safe local tasks selected by the canonical ready batch; do not launch demand acquisition/import/apply, packet scaffolding, generation, publishing, distribution, analytics-feedback, or content-movement work until validated demand is resolved or explicitly deferred. Do not invent demand data.`;
  }
  if (report.ready_subagent_tasks.length) {
    const lockNote = report.source_handoff?.active_lock
      ? " Source-request lock is active, so selected prompts are limited to safe local orchestration/gap/steward work; do not launch demand acquisition/import/apply, packet scaffolding, generation, publishing, distribution, analytics-feedback, or content-movement work."
      : "";
    return `Launch one subagent per prompt in ${report.subagent_dispatch.path}. Do not merge prompts. Each subagent writes only its listed artifact.${lockNote}`;
  }
  if (report.demand_acquisition?.staging_csv_path) {
    if (report.demand_acquisition.first_task_report_status === "blocked_no_reviewed_rows") {
      const reason = String(report.demand_acquisition.first_task_blocked_reason || "no reviewed demand-bearing source was available").replace(/[.]+$/, "");
      return `The first demand acquisition task is blocked: ${reason}. Use the task batch to dispatch the next approved source/candidate only after choosing a real accessible reviewed source. Do not invent demand data.`;
    }
    if (
      Number(report.demand_acquisition.blocked_report_count || 0) >= 3 &&
      report.demand_acquisition.report_rollup_recommended_action === "acquire_reviewed_export_from_external_tool_before_more_exact_query_attempts"
    ) {
      return `Review ${report.demand_acquisition.report_rollup_path || "the demand acquisition report rollup"} and ${report.demand_acquisition.source_request_path || "the demand source request"} before launching another exact-query worker. Acquire a real reviewed export from an approved source first, then place rows in ${report.demand_acquisition.staging_csv_path} and run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --dry-run\`. If a real accessible reviewed source is chosen for the queued task, launch exactly one subagent using ${report.demand_acquisition.first_task_prompt_path}. Do not invent demand data.`;
    }
    if (report.demand_acquisition.first_task_prompt_path) {
      const rollupNote =
        Number(report.demand_acquisition.blocked_report_count || 0) >= 3
          ? ` Review ${report.demand_acquisition.report_rollup_path || "the demand acquisition report rollup"} first because ${report.demand_acquisition.blocked_report_count} previous acquisition attempt(s) found no reviewed rows.`
          : "";
      return `${rollupNote} Launch exactly one demand acquisition subagent using ${report.demand_acquisition.first_task_prompt_path}. It may write only the listed staging CSV/report. After it finishes, run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --dry-run\`, then \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${report.run_date}\` only if dry-run passes and promotion is approved. Review the promotion report before any scaffolded apply. Do not invent demand data.`.trim();
    }
    return `Acquire one real reviewed demand export for ${report.demand_acquisition.candidate_id || "the next candidate"} (${report.demand_acquisition.topic}). Fill ${report.demand_acquisition.staging_csv_path}, run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --dry-run\`, then \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${report.run_date}\` only if dry-run passes and promotion is approved. Review the promotion report before any scaffolded apply. Do not invent demand data.`;
  }
  if (report.next_action) {
    return `${report.next_action.owner || "Owner"}: ${report.next_action.action} - ${report.next_action.detail || ""}`;
  }
  return "Review run-status and run gates before dispatching any subagent or generation work.";
}

function formatCommandLine(command, index) {
  return `${index + 1}. \`${command}\``;
}

function sourceHandoffMarkdown(handoff, report) {
  if (!handoff?.active_lock) return "";
  const first = handoff.first_eligible_request || {};
  const liveBlocked = liveDeploymentBlocksDemandWork(report);
  const commandLines = liveBlocked
    ? `Demand promotion and packet scaffolding commands are deferred because live deployment is blocked. Resolve deployment first, or explicitly defer it with \`--live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:${report.run_date}\` after owner approval.`
    : (first.command_sequence || []).map(formatCommandLine).join("\n");
  const optionalScaffold = liveBlocked
    ? `Deferred by live deployment blocker. Do not run scaffolded apply until live deployment is ready or explicitly deferred, and packet scaffolding has separate approval.`
    : `\`${first.optional_scaffold_command_after_packet_approval || "n/a"}\``;
  const exportRows = (handoff.requested_exports || [])
    .slice(0, 12)
    .map(
      (request) =>
        `| \`${request.candidate_id}\` | ${request.recommended_import_type} | ${request.validation_status} | ${request.row_count} | \`${request.staging_csv_path}\` |`
    )
    .join("\n");
  return `## Source Handoff

- Active lock: ${handoff.active_lock ? "yes" : "no"}
- Status: ${handoff.status || "n/a"}
- Requested exports: ${handoff.requested_export_count || 0}
- Request source: ${handoff.requested_export_source || "n/a"}
- Source request: ${handoff.source_request_markdown || "n/a"}
- Validation report: ${handoff.validation_report_json || "n/a"}
- Validation summary: valid ${handoff.validation_summary.valid_for_promotion || 0}, already promoted ${handoff.validation_summary.already_promoted || 0}, blocked ${handoff.validation_summary.blocked || 0}, empty ${handoff.validation_summary.empty_staging || 0}
- Normalization guidance: ${handoff.normalization_guidance || "Follow the requested export command sequence."}
- Source-specific alternate route: ${handoff.source_specific_alternate_route || "n/a"}
- Scaffold gate: ${first.scaffold_command_gate || "Optional scaffolded apply requires separate packet approval."}

### First Eligible Request

- Candidate: ${first.candidate_id || "n/a"}
- Topic: ${first.topic || "n/a"}
- Query/topic: ${first.query_or_topic_to_validate || "n/a"}
- Required fields: ${first.required_review_fields || "n/a"}
- Staging CSV: ${first.staging_csv_path || "n/a"}
- Final destination: ${first.final_destination_path || "n/a"}

${commandLines || "- No command sequence available."}

Optional after plain promotion report review and packet approval:

${optionalScaffold}

### Requested Export Status

| Candidate | Type | Validation | Rows | Staging |
|---|---|---|---:|---|
${exportRows || "| None |  |  |  |  |"}

`;
}

function writeMarkdown(filePath, report) {
  const taskLines = report.ready_subagent_tasks.length
    ? report.ready_subagent_tasks
        .map((task, index) => `${index + 1}. \`${task.task_id}\` (${task.role}) -> \`${task.prompt_path}\``)
        .join("\n")
    : "- None.";
  const blockerLines = report.top_blockers.length
    ? report.top_blockers.map((blocker) => `- ${blocker.code}: ${blocker.detail}`).join("\n")
    : "- None.";
  const action = report.next_action
    ? `- ${report.next_action.priority || ""} ${report.next_action.owner || ""}: ${report.next_action.action} - ${report.next_action.detail || ""}`
    : "- None.";
  const liveBlocked = liveDeploymentBlocksDemandWork(report);
  const acquisitionRecommendation = liveBlocked && report.demand_acquisition.report_rollup_recommended_action
    ? `${report.demand_acquisition.report_rollup_recommended_action} (deferred by live deployment blocker)`
    : report.demand_acquisition.report_rollup_recommended_action || "n/a";
  const markdown = `# Owner Actions

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Overall status: ${report.overall_status}
Gate status: ${report.gate_status}

## Canonical Owner Prompt

${report.owner_prompt}

## Next Action

${action}

## Demand Acquisition

- Candidate: ${report.demand_acquisition.candidate_id || "n/a"}
- Topic: ${report.demand_acquisition.topic || "n/a"}
- Staging CSV: ${report.demand_acquisition.staging_csv_path || "n/a"}
- Final destination: ${report.demand_acquisition.final_destination_path || "n/a"}
- Brief: ${report.demand_acquisition.acquisition_brief_path || "n/a"}
- Acquisition task batch: ${report.demand_acquisition.task_batch_path || "n/a"}
- First acquisition prompt: ${report.demand_acquisition.first_task_prompt_path || "n/a"}
- First acquisition report: ${report.demand_acquisition.first_task_report_path || "n/a"}
- First acquisition report status: ${report.demand_acquisition.first_task_report_status || "n/a"}
- Acquisition blocked report count: ${report.demand_acquisition.blocked_report_count || 0}
- Current staged reviewed rows: ${report.demand_acquisition.current_staged_reviewed_rows || 0}
- Stale staged reports: ${report.demand_acquisition.stale_staged_reviewed_rows || 0}
- Acquisition report rollup: ${report.demand_acquisition.report_rollup_path || "n/a"}
- Acquisition rollup recommended action: ${acquisitionRecommendation}
- Demand source request: ${report.demand_acquisition.source_request_path || "n/a"}
- Demand source request status: ${report.demand_acquisition.source_request_status || "n/a"}
- Demand source requested exports: ${report.demand_acquisition.source_request_count || "n/a"}
- Dispatch alignment: ${report.dispatch_alignment.status}
- Expected dispatch task: ${report.dispatch_alignment.expected_task_id || "n/a"}
- Canonical dispatch path: ${report.dispatch_alignment.canonical_dispatch_path || "n/a"}
- Required dispatch action: ${report.dispatch_alignment.required_action || "n/a"}

## Deploy Review

- Status: ${report.deploy_review.status || "n/a"}
- Freshness: ${report.deploy_review.freshness_status || "n/a"}
- Approval required: ${report.deploy_review.approval_required ? "yes" : "no"}
- Deploy packet: ${report.deploy_review.markdown_path || report.deploy_review.path || "n/a"}
- Static deploy changes: ${report.deploy_review.deploy_static_changed_count || 0}
- Netlify build support changes: ${report.deploy_review.netlify_build_support_changed_count || 0}
- SEO/AEO process changes: ${report.deploy_review.process_review_changed_count || 0}
- Local-only paths listed: ${report.deploy_review.local_only_count || 0}
- Uncategorized paths: ${report.deploy_review.uncategorized_changed_count || 0}
- Blockers: ${(report.deploy_review.blockers || []).join(", ") || "none"}
- Next action: ${report.deploy_review.next_action || "n/a"}

${sourceHandoffMarkdown(report.source_handoff, report)}
## AI Citation Capture Pack

- Query-set status: ${report.ai_citation_capture.status || "n/a"}
- Reviewed captures: ${report.ai_citation_capture.reviewed_captures || 0}/${report.ai_citation_capture.expected_captures || 0}
- Missing captures: ${report.ai_citation_capture.missing_captures || 0}
- Capture rows: ${report.ai_citation_capture.capture_rows || 0}
- Capture pack: ${report.ai_citation_capture.markdown_path || report.ai_citation_capture.capture_pack_csv || "n/a"}
- Capture task batch: ${report.ai_citation_capture.task_batch_status || "n/a"}; tasks ${report.ai_citation_capture.task_count || 0}; not started ${report.ai_citation_capture.task_not_started_count || 0}; completed rows ${report.ai_citation_capture.task_completed_row_count || 0}
- Task manifest: ${report.ai_citation_capture.task_markdown_path || "n/a"}${report.ai_citation_capture.first_task_prompt_path ? `; first prompt ${report.ai_citation_capture.first_task_prompt_path}` : ""}${report.ai_citation_capture.first_task_report_path ? `; first report ${report.ai_citation_capture.first_task_report_path}` : ""}${report.ai_citation_capture.first_task_row_csv_path ? `; first row ${report.ai_citation_capture.first_task_row_csv_path}` : ""}
- Row staging: ${report.ai_citation_capture.row_staging_status || "n/a"}; valid rows ${report.ai_citation_capture.row_staging_valid_rows || 0}; blockers ${report.ai_citation_capture.row_staging_blockers || 0}; blocked reports ${report.ai_citation_capture.row_staging_blocked_reports || 0}; not started ${report.ai_citation_capture.row_staging_not_started || 0}
- Row staging report: ${report.ai_citation_capture.row_staging_markdown_path || "n/a"}${report.ai_citation_capture.row_staging_import_csv ? `; import CSV ${report.ai_citation_capture.row_staging_import_csv}` : ""}
- Import preflight: ${report.ai_citation_capture.import_preflight_status || "n/a"}; valid ${report.ai_citation_capture.import_preflight_valid_rows || 0}; invalid ${report.ai_citation_capture.import_preflight_invalid_rows || 0}; ${report.ai_citation_capture.import_preflight_markdown_path || "n/a"}
- Import skeleton: ${report.ai_citation_capture.import_skeleton_csv || "n/a"}
- Stage/import command after capture: \`node scripts/seo-aeo/stage-ai-citation-capture-rows.mjs --date ${report.run_date} --apply && node scripts/seo-aeo/check-ai-citation-import.mjs --date ${report.run_date} --strict && node scripts/seo-aeo/import-analytics-exports.mjs --date ${report.run_date} --strict\`
- Rule: launch one subagent per capture task; manual/official-export visibility monitoring only; no unofficial answer-engine scraping; no placeholder import rows.

## Manual Reddit Capture Lane

- Status: ${report.manual_reddit_capture.lane_status || "n/a"}
- Import folder: ${report.manual_reddit_capture.import_dir || "imports/reddit-manual-captures"}
- Template: ${report.manual_reddit_capture.template_path || "docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv"}
- Input files: ${report.manual_reddit_capture.input_file_count || 0}
- Input rows: ${report.manual_reddit_capture.input_row_count || 0}
- Normalized discovery rows: ${report.manual_reddit_capture.normalized_row_count || 0}
- Reddit API: ${report.manual_reddit_capture.api_skipped ? "skipped" : report.manual_reddit_capture.api_step_status || "n/a"}
- Safety fixture: ${report.manual_reddit_capture.fixture_step_status || "n/a"}${report.manual_reddit_capture.fixture_unsafe_rows_rejected !== null && report.manual_reddit_capture.fixture_unsafe_rows_rejected !== undefined ? `; unsafe rows rejected ${report.manual_reddit_capture.fixture_unsafe_rows_rejected}` : ""}
- Rule: ${report.manual_reddit_capture.rule || "Discovery-only; no demand/factual validation."}

## Skill Steward Review

- Decision: ${report.skill_steward.decision || "n/a"}
- Learning candidates: ${report.skill_steward.learning_candidate_count || 0}
- Valid candidates: ${report.skill_steward.valid_candidate_count || 0}
- Invalid candidates: ${report.skill_steward.invalid_candidate_count || 0}
- Closeout: ${report.skill_steward.markdown_path || report.skill_steward.path || "n/a"}
- Review task batch: ${report.skill_steward.review_tasks?.status || "n/a"}; tasks ${report.skill_steward.review_tasks?.task_count || 0}; not started ${report.skill_steward.review_tasks?.not_started_count || 0}; reports present ${report.skill_steward.review_tasks?.report_present_count || 0}; ${report.skill_steward.review_tasks?.markdown_path || "n/a"}
- First review prompt: ${report.skill_steward.review_tasks?.first_task?.prompt_path || "n/a"}
- First candidate files: ${(report.skill_steward.learning_candidate_files || []).slice(0, 5).join(", ") || "n/a"}
- Rule: ${report.skill_steward.rule || "Review only; no automatic skill promotion."}

## Ready Subagent Tasks

${taskLines}

## Top Blockers

${blockerLines}

## Rule

This is the canonical post-run owner handoff. Prefer this file over older content-run reports or stale dispatch summaries.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const runDir = ensureDir(path.join(root, "automation-runs", runDate));
  const runStatus = readJson(path.join(runDir, "run-status.json"), {});
  const nextActions = readJson(path.join(runDir, "next-actions.json"), {}).next_actions || runStatus.next_actions || [];
  const dispatchPath = path.join(runDir, "subagent-dispatch", "ready-batch.json");
  const dispatch = readJson(dispatchPath, {});
  const gates = readJson(path.join(runDir, "run-gates-daily.json"), {});
  const nextAction = canonicalNextAction(nextActions);
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    overall_status: runStatus.overall_status || "",
    gate_status: gates.gate_status || "",
    source_files: {
      run_status: relative(root, path.join(runDir, "run-status.json")),
      next_actions: fs.existsSync(path.join(runDir, "next-actions.json")) ? relative(root, path.join(runDir, "next-actions.json")) : "",
      run_gates: fs.existsSync(path.join(runDir, "run-gates-daily.json")) ? relative(root, path.join(runDir, "run-gates-daily.json")) : "",
      subagent_dispatch: fs.existsSync(dispatchPath) ? relative(root, dispatchPath) : "",
    },
    next_action: nextAction,
    demand_acquisition: demandAcquisition(runStatus, nextActions),
    deploy_review: deployReview(runStatus),
    ai_citation_capture: aiCitationCapture(runStatus),
    manual_reddit_capture: manualRedditCapture(runStatus),
    skill_steward: skillSteward(runStatus),
    source_handoff: sourceHandoff(root, runDate),
    subagent_dispatch: {
      path: fs.existsSync(dispatchPath) ? relative(root, dispatchPath) : "",
      mode: dispatch.dispatch_mode || "",
      counts: dispatch.counts || {},
    },
    ready_subagent_tasks: selectedTasks(dispatch),
    top_blockers: topBlockers(gates),
  };
  report.dispatch_alignment = dispatchAlignment(report);
  report.owner_prompt = ownerPrompt(report);

  const jsonPath = path.join(runDir, "owner-actions.json");
  const markdownPath = path.join(runDir, "owner-actions.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        owner_actions_json: relative(root, jsonPath),
        owner_actions_md: relative(root, markdownPath),
        ready_subagent_tasks: report.ready_subagent_tasks.length,
        next_action: report.next_action?.action || "",
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
