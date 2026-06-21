#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";

const MODES = new Set(["daily", "generate", "publish", "monitor"]);

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

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countBy(checks, field) {
  const counts = {};
  for (const check of checks) {
    const value = check[field] || "missing";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function addCheck(checks, { mode, code, ok, severity = "blocker", detail, evidence = "" }) {
  checks.push({
    mode,
    code,
    ok: Boolean(ok),
    severity: ok ? "pass" : severity,
    detail,
    evidence,
  });
}

function failedSteps(dailyReport) {
  return (dailyReport.steps || []).filter((step) => step.status === "failed");
}

function skippedRequiredSteps(dailyReport) {
  const optionalSkips = new Set([
    "Pull Bing Webmaster query metrics",
    "Pull Reddit discovery trends",
    "Pull Google Trends RSS discovery trends",
    "Validate current query intelligence",
    "Pull GSC fallback query metrics",
  ]);
  return (dailyReport.steps || []).filter((step) => /^skipped/.test(step.status || "") && !optionalSkips.has(step.name));
}

function publishBlockers(publishPlan, runStatus) {
  const blockedCount = Number(runStatus.publishing?.blocked_count ?? (publishPlan.blocked_packets || []).length ?? 0);
  const blockerCodes = Object.keys(runStatus.publishing?.blocker_counts || {});
  if (blockerCodes.length) return { blockedCount, blockerCodes };
  const codes = new Set();
  for (const packet of publishPlan.blocked_packets || []) {
    for (const reason of packet.reasons || []) codes.add(reason.code || "unknown");
  }
  return { blockedCount, blockerCodes: Array.from(codes) };
}

function publishPlanStageReady(publishPlan, runStatus) {
  const status = String(publishPlan.status || "").trim();
  const selectedCount = Number(runStatus.publishing?.selected_count ?? (publishPlan.selected_packets || []).length ?? 0);
  return selectedCount > 0 && ["ready", "generated", "dry_run_generated"].includes(status);
}

function runBlogCheck(root) {
  const result = spawnSync(process.execPath, ["scripts/blog-orchestrator.mjs", "check-all"], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    exit_code: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function baseChecks(root, runDate, inputs, mode) {
  const checks = [];
  const {
    dailyReport,
    runStatus,
    subagentCheck,
    codexAutomationAudit,
    aiCitationCapturePack,
    aiCitationCaptureTasks,
    aiCitationCaptureRowStaging,
    aiCitationImportPreflight,
    demandPromotionFreshness,
  } = inputs;

  addCheck(checks, {
    mode,
    code: "daily_report_present",
    ok: Boolean(dailyReport.run_date || dailyReport.status),
    detail: "Daily report must exist before enforcing downstream gates.",
    evidence: `automation-runs/${runDate}/daily-report.json`,
  });
  addCheck(checks, {
    mode,
    code: "daily_report_not_failed",
    ok: dailyReport.status && dailyReport.status !== "failed",
    detail: `Daily report status is ${dailyReport.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/daily-report.json:status`,
  });
  addCheck(checks, {
    mode,
    code: "no_failed_steps",
    ok: failedSteps(dailyReport).length === 0,
    detail: `Failed required step count: ${failedSteps(dailyReport).length}.`,
    evidence: failedSteps(dailyReport)
      .map((step) => step.name)
      .join(", "),
  });
  addCheck(checks, {
    mode,
    code: "no_required_setup_skips",
    ok: skippedRequiredSteps(dailyReport).length === 0,
    severity: "warning",
    detail: `Required setup skip count: ${skippedRequiredSteps(dailyReport).length}. Optional Bing/Reddit/current-query skips are handled by content gates.`,
    evidence: skippedRequiredSteps(dailyReport)
      .map((step) => step.name)
      .join(", "),
  });
  addCheck(checks, {
    mode,
    code: "google_credentials_present",
    ok: Boolean(runStatus.google?.credentials?.oauth_credentials?.exists || runStatus.google?.credentials?.service_account_credentials?.exists),
    detail: "GA4/GSC automation needs local OAuth or service-account credentials.",
    evidence: `automation-runs/${runDate}/run-status.json:google.credentials`,
  });
  addCheck(checks, {
    mode,
    code: "google_access_not_failed",
    ok: !["failed", "missing"].includes(runStatus.google?.ga4?.step_status) && !["failed", "missing"].includes(runStatus.google?.search_console?.step_status),
    detail: `GA4=${runStatus.google?.ga4?.step_status || "missing"}; GSC=${runStatus.google?.search_console?.step_status || "missing"}.`,
    evidence: `automation-runs/${runDate}/run-status.json:google`,
  });
  addCheck(checks, {
    mode,
    code: "measurement_not_config_risk",
    ok:
      runStatus.google?.ga4?.diagnostics?.zero_row_state !== "config_risk" &&
      runStatus.google?.search_console?.diagnostics?.zero_row_state !== "config_risk",
    detail: `GA4 diagnostic=${runStatus.google?.ga4?.diagnostics?.zero_row_state || "missing"}; GSC diagnostic=${runStatus.google?.search_console?.diagnostics?.zero_row_state || "missing"}.`,
    evidence: `automation-runs/${runDate}/measurement-diagnostics.json`,
  });
  addCheck(checks, {
    mode,
    code: "feedback_input_state_classified",
    ok: Boolean(runStatus.analytics?.feedback_input_state && runStatus.analytics.feedback_input_state !== "missing"),
    severity: "warning",
    detail: `Feedback input state is ${runStatus.analytics?.feedback_input_state || "missing"}.`,
    evidence: `automation-runs/${runDate}/run-status.json:analytics.feedback_input_state`,
  });
  const aiCitationCaptureRows = Number(
    aiCitationCapturePack.capture_rows ?? runStatus.analytics?.ai_citation_query_set?.capture_pack?.capture_rows ?? 0
  );
  const aiCitationTaskCount = Number(
    aiCitationCaptureTasks.task_count ?? runStatus.analytics?.ai_citation_query_set?.capture_tasks?.task_count ?? 0
  );
  addCheck(checks, {
    mode,
    code: "ai_citation_capture_tasks_match_pack",
    ok: aiCitationCaptureRows === 0 || (Boolean(aiCitationCaptureTasks.status) && aiCitationTaskCount === aiCitationCaptureRows),
    severity: "warning",
    detail: `AI citation capture rows=${aiCitationCaptureRows}; task batch status=${aiCitationCaptureTasks.status || "missing"}; task_count=${aiCitationTaskCount}.`,
    evidence: `automation-runs/${runDate}/ai-citation-capture-tasks/tasks.json`,
  });
  const aiCitationRowBlockers = Number(
    aiCitationCaptureRowStaging.row_blockers ?? runStatus.analytics?.ai_citation_query_set?.capture_row_staging?.row_blockers ?? 0
  );
  addCheck(checks, {
    mode,
    code: "ai_citation_capture_rows_clean_or_quarantined",
    ok: aiCitationRowBlockers === 0,
    severity: "warning",
    detail: `AI citation capture row staging blockers=${aiCitationRowBlockers}; status=${aiCitationCaptureRowStaging.status || runStatus.analytics?.ai_citation_query_set?.capture_row_staging?.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/ai-citation-capture-row-staging.json`,
  });
  const aiCitationPreflightInvalidRows = Number(
    aiCitationImportPreflight.invalid_rows ?? runStatus.analytics?.ai_citation_query_set?.import_preflight?.invalid_rows ?? 0
  );
  addCheck(checks, {
    mode,
    code: "ai_citation_import_preflight_clean",
    ok: aiCitationPreflightInvalidRows === 0,
    severity: "warning",
    detail: `AI citation import preflight invalid rows=${aiCitationPreflightInvalidRows}; status=${aiCitationImportPreflight.status || runStatus.analytics?.ai_citation_query_set?.import_preflight?.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/ai-citation-import-preflight.json`,
  });
  addCheck(checks, {
    mode,
    code: "demand_promotion_report_not_stale",
    ok: !demandPromotionFreshness.status || demandPromotionFreshness.ok !== false,
    severity: "warning",
    detail: `Demand promotion freshness=${demandPromotionFreshness.freshness_status || "missing"}; status=${demandPromotionFreshness.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/demand-promotion-freshness.json`,
  });
  addCheck(checks, {
    mode,
    code: "subagent_artifacts_dependency_safe",
    ok: !subagentCheck.status || ["passed", "missing"].includes(subagentCheck.status),
    detail: `Subagent artifact check status is ${subagentCheck.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/subagent-artifact-check.json`,
  });
  addCheck(checks, {
    mode,
    code: "codex_automations_not_stale",
    ok: !codexAutomationAudit.status || codexAutomationAudit.status === "ready",
    severity: "warning",
    detail: `Codex automation audit status is ${codexAutomationAudit.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/codex-automation-audit.json`,
  });

  return checks;
}

function strictDailyChecks(runDate, inputs, mode) {
  const checks = [];
  const { runStatus, completionAudit, demandValidation, demandReadiness, demandPromotionFreshness, publishPlan } = inputs;
  const { blockedCount, blockerCodes } = publishBlockers(publishPlan, runStatus);
  const validForPromotion = Number(demandValidation.valid_for_promotion || 0);

  addCheck(checks, {
    mode,
    code: "run_status_ready_for_next_stage",
    ok: runStatus.overall_status === "ready_for_publish_approval",
    detail: `Run status is ${runStatus.overall_status || "missing"}; strict daily mode requires ready_for_publish_approval before generation.`,
    evidence: `automation-runs/${runDate}/run-status.json:overall_status`,
  });
  addCheck(checks, {
    mode,
    code: "system_completion_operational",
    ok: ["operational", "operational_with_run_blockers"].includes(completionAudit.overall_status),
    detail: `System completion audit is ${completionAudit.overall_status || "missing"}.`,
    evidence: `automation-runs/${runDate}/system-completion-audit.json:overall_status`,
  });
  addCheck(checks, {
    mode,
    code: "query_handoff_ready",
    ok: runStatus.discovery?.query_handoff_status === "ready",
    detail: `Current query handoff is ${runStatus.discovery?.query_handoff_status || "missing"}.`,
    evidence: `automation-runs/${runDate}/run-status.json:discovery.query_handoff_status`,
  });
  addCheck(checks, {
    mode,
    code: "validated_demand_ready",
    ok:
      demandReadiness.projected?.hard_gate_status === "prerequisites_present_needs_discovery_rebuild" ||
      runStatus.discovery?.query_handoff_status === "ready",
    detail: `Demand readiness hard gate is ${demandReadiness.projected?.hard_gate_status || runStatus.demand_readiness?.hard_gate_status || "missing"}.`,
    evidence: `research/daily-content-plan/${runDate}/demand-readiness-preflight.json`,
  });
  addCheck(checks, {
    mode,
    code: "live_deployment_ready",
    ok: runStatus.live_deployment?.status === "ready",
    detail: `Live deployment status=${runStatus.live_deployment?.status || "missing"}; blocked_count=${runStatus.live_deployment?.blocked_count ?? "n/a"}.`,
    evidence: `automation-runs/${runDate}/live-deployment-check.json`,
  });
  addCheck(checks, {
    mode,
    code: "deploy_review_fresh",
    ok: runStatus.deploy_review?.freshness_status === "fresh",
    detail: `Deploy review freshness=${runStatus.deploy_review?.freshness_status || "missing"}; stale sources=${(runStatus.deploy_review?.stale_source_files || []).join(", ") || "none"}.`,
    evidence: `automation-runs/${runDate}/deploy-review-packet.json`,
  });
  addCheck(checks, {
    mode,
    code: "deploy_review_ready_for_approval",
    ok: runStatus.deploy_review?.status === "ready_for_deploy_approval" && Number((runStatus.deploy_review?.blockers || []).length) === 0,
    detail: `Deploy review status=${runStatus.deploy_review?.status || "missing"}; blockers=${(runStatus.deploy_review?.blockers || []).length}.`,
    evidence: `automation-runs/${runDate}/deploy-review-packet.json`,
  });
  addCheck(checks, {
    mode,
    code: "deploy_review_approval_required",
    ok: runStatus.deploy_review?.approval_required === true,
    detail: `Deploy review approval_required=${runStatus.deploy_review?.approval_required ?? "missing"}.`,
    evidence: `automation-runs/${runDate}/deploy-review-packet.json`,
  });
  addCheck(checks, {
    mode,
    code: "demand_pack_has_no_blocked_rows",
    ok: Number(demandValidation.blocked || 0) === 0,
    detail: `Blocked demand import rows: ${demandValidation.blocked ?? "missing"}.`,
    evidence: `research/daily-content-plan/${runDate}/demand-import-pack/validation-report.json`,
  });
  addCheck(checks, {
    mode,
    code: "demand_promotion_not_pending",
    ok: validForPromotion === 0,
    detail: `Valid reviewed demand rows pending promotion: ${validForPromotion}. Run demand promotion only after live deployment is ready or explicitly deferred.`,
    evidence: `research/daily-content-plan/${runDate}/demand-import-pack/validation-report.json:valid_for_promotion`,
  });
  addCheck(checks, {
    mode,
    code: "demand_promotion_freshness_current",
    ok: !demandPromotionFreshness.status || demandPromotionFreshness.ok !== false,
    detail: `Demand promotion freshness=${demandPromotionFreshness.freshness_status || "missing"}; status=${demandPromotionFreshness.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/demand-promotion-freshness.json`,
  });
  addCheck(checks, {
    mode,
    code: "publish_governor_selected_packets",
    ok: Number(runStatus.publishing?.selected_count || 0) > 0,
    detail: `Selected packets: ${runStatus.publishing?.selected_count ?? 0}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:selected_packets`,
  });
  addCheck(checks, {
    mode,
    code: "publish_governor_not_blocked",
    ok: publishPlanStageReady(publishPlan, runStatus),
    detail: `Publish plan status=${publishPlan.status || "missing"}; blocked_count=${blockedCount}; blockers=${blockerCodes.join(", ") || "none"}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:status`,
  });

  return checks;
}

function generateChecks(runDate, inputs, mode) {
  const checks = [];
  const { runStatus, publishPlan, demandValidation, demandPromotionFreshness, subagentCheck } = inputs;
  const { blockedCount, blockerCodes } = publishBlockers(publishPlan, runStatus);
  const validForPromotion = Number(demandValidation.valid_for_promotion || 0);

  addCheck(checks, {
    mode,
    code: "query_handoff_ready_for_generation",
    ok: runStatus.discovery?.query_handoff_status === "ready",
    detail: `Current query handoff is ${runStatus.discovery?.query_handoff_status || "missing"}.`,
    evidence: `automation-runs/${runDate}/run-status.json:discovery.query_handoff_status`,
  });
  addCheck(checks, {
    mode,
    code: "candidate_intake_ready",
    ok: Number(runStatus.candidates?.intake_ready || 0) > 0,
    detail: `Intake-ready candidates: ${runStatus.candidates?.intake_ready ?? 0}.`,
    evidence: `automation-runs/${runDate}/run-status.json:candidates.intake_ready`,
  });
  addCheck(checks, {
    mode,
    code: "publish_plan_has_selection",
    ok: Number(runStatus.publishing?.selected_count || (publishPlan.selected_packets || []).length || 0) > 0,
    detail: `Selected packets: ${runStatus.publishing?.selected_count ?? (publishPlan.selected_packets || []).length ?? 0}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:selected_packets`,
  });
  addCheck(checks, {
    mode,
    code: "publish_plan_not_blocked",
    ok: publishPlanStageReady(publishPlan, runStatus),
    detail: `Publish plan status=${publishPlan.status || "missing"}; blocked_count=${blockedCount}; blockers=${blockerCodes.join(", ") || "none"}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:status`,
  });
  addCheck(checks, {
    mode,
    code: "demand_pack_not_blocked",
    ok: Number(demandValidation.blocked || 0) === 0,
    detail: `Blocked demand import rows: ${demandValidation.blocked ?? "missing"}.`,
    evidence: `research/daily-content-plan/${runDate}/demand-import-pack/validation-report.json`,
  });
  addCheck(checks, {
    mode,
    code: "demand_promotion_not_pending",
    ok: validForPromotion === 0,
    detail: `Valid reviewed demand rows pending promotion: ${validForPromotion}.`,
    evidence: `research/daily-content-plan/${runDate}/demand-import-pack/validation-report.json:valid_for_promotion`,
  });
  addCheck(checks, {
    mode,
    code: "demand_promotion_freshness_current",
    ok: !demandPromotionFreshness.status || demandPromotionFreshness.ok !== false,
    detail: `Demand promotion freshness=${demandPromotionFreshness.freshness_status || "missing"}; status=${demandPromotionFreshness.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/demand-promotion-freshness.json`,
  });
  addCheck(checks, {
    mode,
    code: "subagent_artifacts_passed",
    ok: subagentCheck.status === "passed",
    detail: `Subagent artifact check status is ${subagentCheck.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/subagent-artifact-check.json`,
  });

  return checks;
}

function publishChecks(root, runDate, inputs, mode) {
  const checks = [];
  const { publishPlan } = inputs;
  const blogCheck = runBlogCheck(root);

  addCheck(checks, {
    mode,
    code: "blog_outputs_validate",
    ok: blogCheck.ok,
    detail: blogCheck.ok ? "Existing generated blog outputs pass check-all." : `Blog check failed with exit ${blogCheck.exit_code}.`,
    evidence: blogCheck.output,
  });
  addCheck(checks, {
    mode,
    code: "generation_steps_recorded",
    ok: Array.isArray(publishPlan.generation_steps) && publishPlan.generation_steps.length > 0,
    detail: `Generation steps recorded: ${(publishPlan.generation_steps || []).length}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:generation_steps`,
  });
  addCheck(checks, {
    mode,
    code: "publish_plan_ready_after_generation",
    ok: ["generated", "ready", "ready_for_publish", "completed"].includes(publishPlan.status),
    detail: `Publish plan status is ${publishPlan.status || "missing"}.`,
    evidence: `automation-runs/${runDate}/publish-plan.json:status`,
  });

  return checks;
}

function buildReport(root, runDate, mode) {
  const runDir = path.join(root, "automation-runs", runDate);
  const dailyReport = readJson(path.join(runDir, "daily-report.json"), {});
  const runStatus = readJson(path.join(runDir, "run-status.json"), {});
  const completionAudit = readJson(path.join(runDir, "system-completion-audit.json"), {});
  const publishPlan = readJson(path.join(runDir, "publish-plan.json"), {});
  const subagentCheck = readJson(path.join(runDir, "subagent-artifact-check.json"), {});
  const codexAutomationAudit = readJson(path.join(runDir, "codex-automation-audit.json"), {});
  const aiCitationCapturePack = readJson(path.join(runDir, "ai-citation-capture-pack.json"), {});
  const aiCitationCaptureTasks = readJson(path.join(runDir, "ai-citation-capture-tasks", "tasks.json"), {});
  const aiCitationCaptureRowStaging = readJson(path.join(runDir, "ai-citation-capture-row-staging.json"), {});
  const aiCitationImportPreflight = readJson(path.join(runDir, "ai-citation-import-preflight.json"), {});
  const demandPromotionFreshness = readJson(path.join(runDir, "demand-promotion-freshness.json"), {});
  const demandValidation = readJson(path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json"), {});
  const demandReadiness = readJson(path.join(root, "research", "daily-content-plan", runDate, "demand-readiness-preflight.json"), {});
  const inputs = {
    dailyReport,
    runStatus,
    completionAudit,
    publishPlan,
    subagentCheck,
    codexAutomationAudit,
    aiCitationCapturePack,
    aiCitationCaptureTasks,
    aiCitationCaptureRowStaging,
    aiCitationImportPreflight,
    demandPromotionFreshness,
    demandValidation,
    demandReadiness,
  };

  const checks = [
    ...baseChecks(root, runDate, inputs, mode),
    ...(mode === "daily" ? strictDailyChecks(runDate, inputs, mode) : []),
    ...(mode === "generate" || mode === "publish" ? generateChecks(runDate, inputs, mode) : []),
    ...(mode === "publish" ? publishChecks(root, runDate, inputs, mode) : []),
  ];
  const blockers = checks.filter((check) => !check.ok && check.severity === "blocker");
  const warnings = checks.filter((check) => !check.ok && check.severity === "warning");

  return {
    schema_version: "1.0",
    run_date: runDate,
    mode,
    generated_at: new Date().toISOString(),
    ok: blockers.length === 0,
    gate_status: blockers.length ? "blocked" : warnings.length ? "passed_with_warnings" : "passed",
    source_files: {
      daily_report: relative(root, path.join(runDir, "daily-report.json")),
      run_status: relative(root, path.join(runDir, "run-status.json")),
      system_completion_audit: relative(root, path.join(runDir, "system-completion-audit.json")),
      publish_plan: relative(root, path.join(runDir, "publish-plan.json")),
      deploy_review: relative(root, path.join(runDir, "deploy-review-packet.json")),
      subagent_artifact_check: relative(root, path.join(runDir, "subagent-artifact-check.json")),
      ai_citation_capture_pack: relative(root, path.join(runDir, "ai-citation-capture-pack.json")),
      ai_citation_capture_tasks: relative(root, path.join(runDir, "ai-citation-capture-tasks", "tasks.json")),
      ai_citation_capture_row_staging: relative(root, path.join(runDir, "ai-citation-capture-row-staging.json")),
      ai_citation_import_preflight: relative(root, path.join(runDir, "ai-citation-import-preflight.json")),
      demand_promotion_freshness: relative(root, path.join(runDir, "demand-promotion-freshness.json")),
      demand_validation: `research/daily-content-plan/${runDate}/demand-import-pack/validation-report.json`,
      demand_readiness: `research/daily-content-plan/${runDate}/demand-readiness-preflight.json`,
    },
    summary: {
      total_checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      blockers: blockers.length,
      warnings: warnings.length,
      by_severity: countBy(checks, "severity"),
    },
    blockers: blockers.map((check) => ({
      code: check.code,
      detail: check.detail,
      evidence: check.evidence,
    })),
    warnings: warnings.map((check) => ({
      code: check.code,
      detail: check.detail,
      evidence: check.evidence,
    })),
    checks,
    rule:
      "This gate controls stage progression only. It does not create data, approve publishing, or mark the overall SEO/AEO goal complete.",
  };
}

function writeMarkdown(filePath, report) {
  const blockerLines = report.blockers.length
    ? report.blockers.map((item) => `- ${item.code}: ${item.detail}${item.evidence ? ` Evidence: ${item.evidence}` : ""}`).join("\n")
    : "- None.";
  const warningLines = report.warnings.length
    ? report.warnings.map((item) => `- ${item.code}: ${item.detail}${item.evidence ? ` Evidence: ${item.evidence}` : ""}`).join("\n")
    : "- None.";
  const checkLines = report.checks
    .map((item) => `- ${item.ok ? "pass" : item.severity}: ${item.code} - ${item.detail}`)
    .join("\n");
  const markdown = `# SEO/AEO Run Gate

Run date: ${report.run_date}
Mode: ${report.mode}
Status: ${report.gate_status}

## Summary

- Checks: ${report.summary.total_checks}
- Passed: ${report.summary.passed}
- Blockers: ${report.summary.blockers}
- Warnings: ${report.summary.warnings}

## Blockers

${blockerLines}

## Warnings

${warningLines}

## Checks

${checkLines}

## Rule

${report.rule}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const mode = arg("--mode", "daily");
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported --mode ${mode}. Use one of: ${Array.from(MODES).join(", ")}.`);
  }

  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const report = buildReport(root, runDate, mode);
  const jsonPath = path.join(outputDir, `run-gates-${mode}.json`);
  const markdownPath = path.join(outputDir, `run-gates-${mode}.md`);
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        run_date: runDate,
        mode,
        gate_status: report.gate_status,
        blockers: report.summary.blockers,
        warnings: report.summary.warnings,
        run_gates_json: relative(root, jsonPath),
        run_gates_md: relative(root, markdownPath),
        top_blockers: report.blockers.slice(0, 8),
      },
      null,
      2
    )
  );

  if (!report.ok && !hasFlag("--no-fail")) process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
