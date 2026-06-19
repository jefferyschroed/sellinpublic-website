#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv } from "./lib/csv.mjs";
import { contentDecisionHasDecisionGradeEvidence } from "./lib/content-decisions.mjs";
import { today } from "./lib/dates.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function existsFile(root, filePath) {
  const absolutePath = path.join(root, filePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile() && fs.statSync(absolutePath).size > 0;
}

function existsDir(root, dirPath) {
  const absolutePath = path.join(root, dirPath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
}

function readJson(root, filePath) {
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function csvRowCount(root, filePath) {
  return readCsv(path.join(root, filePath)).rows.length;
}

function countDirs(root, dirPath) {
  const absolutePath = path.join(root, dirPath);
  if (!fs.existsSync(absolutePath)) return 0;
  return fs.readdirSync(absolutePath, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).length;
}

function countFiles(root, dirPath, matcher = () => true) {
  const absolutePath = path.join(root, dirPath);
  if (!fs.existsSync(absolutePath)) return 0;
  return fs.readdirSync(absolutePath, { withFileTypes: true }).filter((entry) => entry.isFile() && matcher(entry.name)).length;
}

function statusFromChecks(checks) {
  if (checks.every((check) => check.ok)) return "complete";
  if (checks.some((check) => check.ok)) return "partial";
  return "missing";
}

function requirement(id, label, checks, notes = "") {
  return {
    id,
    label,
    status: statusFromChecks(checks),
    checks,
    notes,
  };
}

function check(id, ok, evidence, gap = "") {
  return { id, ok: Boolean(ok), evidence, gap };
}

function healthyZeroRowState(value) {
  return ["verified_empty", "recent_data_pending", "recent_data_pending_finalization"].includes(String(value || ""));
}

function hasPublishDecision(publishPlan) {
  return ["blocked", "ready", "generated", "completed"].includes(String(publishPlan.status || ""));
}

function hasPublishBlockerAccounting(publishPlan) {
  if (!hasPublishDecision(publishPlan)) return false;
  const selectedPackets = Array.isArray(publishPlan.selected_packets) ? publishPlan.selected_packets : [];
  const blockedPackets = Array.isArray(publishPlan.blocked_packets) ? publishPlan.blocked_packets : [];
  return selectedPackets.length > 0 || blockedPackets.length > 0 || publishPlan.status === "ready";
}

function productionReadiness({ root, runDate, runStatus, publishPlan, ownerActions, config }) {
  const sourceRequestStatus =
    ownerActions.source_handoff?.status ||
    runStatus.demand_acquisition_report_rollup?.source_request?.status ||
    "";
  const selectedPackets = Array.isArray(publishPlan.selected_packets) ? publishPlan.selected_packets : [];
  const maxPostsPerDay = Number(
    runStatus.publishing?.limits?.max_posts_per_day ||
      config.publishGovernor?.maxPostsPerDay ||
      config.publishing?.maxPostsPerDay ||
      0
  );
  const checks = [
    check(
      "run_status_allows_generation",
      ["ready_for_publish_approval", "ready_for_generation", "ready_for_publish", "generated"].includes(runStatus.overall_status),
      `run-status overall_status=${runStatus.overall_status || "missing"}`,
      "Current run is not ready for governed generation."
    ),
    check(
      "source_request_lock_clear",
      !String(sourceRequestStatus || "").startsWith("escalation_required"),
      `source_request.status=${sourceRequestStatus || "missing"}`,
      "Validated-demand source request is still active."
    ),
    check(
      "publish_plan_selected_packets",
      selectedPackets.length > 0,
      `publish-plan selected_packets=${selectedPackets.length}`,
      "Publish governor selected no packets."
    ),
    check(
      "publish_plan_not_blocked",
      !["blocked", "missing", ""].includes(String(publishPlan.status || "")),
      `publish-plan status=${publishPlan.status || "missing"}`,
      "Publish governor is blocked or missing."
    ),
    check(
      "multi_post_capacity_configured",
      maxPostsPerDay >= 2,
      `max_posts_per_day=${maxPostsPerDay || "missing"}`,
      "Daily publish capacity is not configured for multiple posts."
    ),
    check(
      "live_deployment_ready",
      runStatus.live_deployment?.status === "ready",
      `live_deployment.status=${runStatus.live_deployment?.status || "missing"}; blocked=${runStatus.live_deployment?.blocked_count ?? "n/a"}`,
      "Live deployment routes or GA4 measurement are blocked or the live deployment check is missing."
    ),
  ];
  const blockers = checks
    .filter((item) => !item.ok)
    .map((item) => ({
      code: item.id,
      detail: item.gap,
      evidence: item.evidence,
    }));
  return {
    status: blockers.length ? "blocked" : "ready",
    current_run_status: runStatus.overall_status || "missing",
    selected_packets: selectedPackets.length,
    owner_next_action: ownerActions.next_action?.action || runStatus.next_actions?.[0]?.action || "",
    authoritative_gate_artifact: `automation-runs/${runDate}/run-gates-daily.json`,
    authoritative_gate_artifact_exists: fs.existsSync(path.join(root, "automation-runs", runDate, "run-gates-daily.json")),
    checks,
    blockers,
    rule:
      "This audit verifies infrastructure readiness only. It never marks the active SEO/AEO goal complete; production readiness for publishing is determined by current run-status and publish-plan, with run-gates as the separate authoritative progression artifact.",
  };
}

function overallStatus(requirements) {
  const missing = requirements.filter((item) => item.status === "missing");
  if (missing.length) return "incomplete";
  const partialIds = requirements.filter((item) => item.status === "partial").map((item) => item.id);
  if (!partialIds.length) return "operational";
  const runBlockerRequirements = new Set(["query_intelligence_system"]);
  if (partialIds.every((id) => runBlockerRequirements.has(id))) return "operational_with_run_blockers";
  return "partially_operational";
}

function buildAudit(root, runDate) {
  const config = loadConfig(root);
  const runStatusPath = `automation-runs/${runDate}/run-status.json`;
  const runStatus = readJson(root, runStatusPath) || {};
  const pageRows = csvRowCount(root, "analytics/page_daily.csv");
  const queryRows = csvRowCount(root, "analytics/search_query_daily.csv");
  const aiCitationRows = csvRowCount(root, "analytics/ai_citation_log.csv");
  const distributionRows = csvRowCount(root, "analytics/distribution_daily.csv");
  const contentDecisionRows = csvRowCount(root, "analytics/content_decisions.csv");
  const evidenceBackedContentDecisionRows = readCsv(path.join(root, "analytics/content_decisions.csv")).rows.filter(contentDecisionHasDecisionGradeEvidence).length;
  const distributionImportFiles = countFiles(root, "imports/distribution", (name) => name.endsWith(".csv"));
  const importDiscoveryFiles =
    countFiles(root, "imports/query-exports", (name) => name.endsWith(".csv")) +
    countFiles(root, "imports/trends", (name) => name.endsWith(".csv")) +
    countFiles(root, "imports/ai-query-observations", (name) => name.endsWith(".csv")) +
    countFiles(root, "imports/serp-observations", (name) => name.endsWith(".csv")) +
    countFiles(root, "imports/topic-seeds", (name) => name.endsWith(".csv"));
  const latestDiscovery = runStatus.discovery || {};
  const candidates = runStatus.candidates || {};
  const publishing = runStatus.publishing || {};
  const subagents = runStatus.subagents || {};
  const subagentArtifactCheck = readJson(root, `automation-runs/${runDate}/subagent-artifact-check.json`) || {};
  const google = runStatus.google || {};
  const measurementDiagnostics = runStatus.measurement_diagnostics || {};
  const automationAudit = readJson(root, `automation-runs/${runDate}/codex-automation-audit.json`) || {};
  const dailyReport = readJson(root, `automation-runs/${runDate}/daily-report.json`) || {};
  const publishPlan = readJson(root, `automation-runs/${runDate}/publish-plan.json`) || {};
  const ownerActions = readJson(root, `automation-runs/${runDate}/owner-actions.json`) || {};
  const analyticsFixtureStep = (dailyReport.steps || []).find((step) => step.name === "Check analytics feedback fixture") || {};
  const demandImportWorklist = runStatus.demand_import_worklist || {};
  const demandImportPack = runStatus.demand_import_pack || {};
  const demandWorklistFileExists = Boolean(demandImportWorklist.json_path) && existsFile(root, demandImportWorklist.json_path);
  const hasDemandWorklistCount = Object.prototype.hasOwnProperty.call(demandImportWorklist, "request_count");
  const feedbackInputState = runStatus.analytics?.feedback_input_state || "";
  const eligibleDecisionEvidenceRows = Number(runStatus.analytics?.eligible_decision_evidence_rows || 0);
  const ga4ZeroState = google.ga4?.diagnostics?.zero_row_state || "";
  const gscZeroState = google.search_console?.diagnostics?.zero_row_state || "";

  const requirements = [
    requirement("measurement_access", "Daily measurement access", [
      check("ga4_oauth", google.ga4?.step_status === "completed", `${runStatusPath}: google.ga4.step_status`, "GA4 pull has not completed for this run."),
      check(
        "gsc_oauth",
        google.search_console?.step_status === "completed",
        `${runStatusPath}: google.search_console.step_status`,
        "Search Console pull has not completed for this run."
      ),
      check(
        "credential_present",
        google.credentials?.oauth_credentials?.exists || google.credentials?.service_account_credentials?.exists,
        `${runStatusPath}: google.credentials`,
        "No local Google credential mode is available."
      ),
      check(
        "measurement_diagnostics",
        ["signal_available_in_target_window", "needs_wider_metrics_window", "recent_data_pending_finalization", "verified_empty_all_windows"].includes(measurementDiagnostics.status),
        `${runStatusPath}: measurement_diagnostics.status=${measurementDiagnostics.status || "missing"}`,
        "Measurement diagnostics have not classified GA4/GSC zero-row state."
      ),
    ]),
    requirement(
      "measurement_signal",
      "Performance signal pipeline",
      [
        check(
          "page_rows_or_healthy_empty",
          pageRows > 0 || feedbackInputState === "healthy_empty" || healthyZeroRowState(ga4ZeroState),
          `analytics/page_daily.csv rows=${pageRows}; feedback_input_state=${feedbackInputState || "missing"}; ga4_diagnostic=${ga4ZeroState || "missing"}`,
          `No page-level signal rows yet and the feedback input state is ${feedbackInputState || "missing"}.`
        ),
        check(
          "query_rows_or_healthy_empty",
          queryRows > 0 || feedbackInputState === "healthy_empty" || healthyZeroRowState(gscZeroState),
          `analytics/search_query_daily.csv rows=${queryRows}; feedback_input_state=${feedbackInputState || "missing"}; gsc_diagnostic=${gscZeroState || "missing"}`,
          `No search-query signal rows yet and the feedback input state is ${feedbackInputState || "missing"}.`
        ),
        check(
          "ai_citation_rows_or_healthy_empty",
          aiCitationRows > 0 || feedbackInputState === "healthy_empty",
          `analytics/ai_citation_log.csv rows=${aiCitationRows}; feedback_input_state=${feedbackInputState || "missing"}`,
          `No AI citation observations yet and the feedback input state is ${feedbackInputState || "missing"}.`
        ),
        check(
          "distribution_rows_or_healthy_empty",
          distributionRows > 0 || feedbackInputState === "healthy_empty" || distributionImportFiles === 0,
          `analytics/distribution_daily.csv rows=${distributionRows}; imports/distribution csv files=${distributionImportFiles}; feedback_input_state=${feedbackInputState || "missing"}`,
          `No distribution performance rows yet and distribution imports exist or the feedback input state is ${feedbackInputState || "missing"}.`
        ),
      ],
      "A healthy-empty state proves the feedback-loop machinery is operational and waiting for real evidence. It does not create performance evidence or unlock generation."
    ),
    requirement("topic_authority_system", "Topic authority and mapping", [
      check("topic_map", existsFile(root, "docs/seo-aeo/topic-map.yaml"), "docs/seo-aeo/topic-map.yaml", "Missing topic map."),
      check("topic_coverage", existsFile(root, "docs/seo-aeo/topic-coverage.csv"), "docs/seo-aeo/topic-coverage.csv", "Missing coverage ledger."),
      check("topic_scoring", existsFile(root, "docs/seo-aeo/topic-scoring.md"), "docs/seo-aeo/topic-scoring.md", "Missing scoring SOP."),
      check("topic_decisions", existsFile(root, "docs/seo-aeo/topic-decisions.md"), "docs/seo-aeo/topic-decisions.md", "Missing decision ledger."),
    ]),
    requirement("query_intelligence_system", "Query and AEO intelligence", [
      check("schemas", existsDir(root, "docs/seo-aeo/schemas"), "docs/seo-aeo/schemas/", "Missing query/discovery schemas."),
      check(
        "current_query_handoff",
        latestDiscovery.query_handoff_status === "ready",
        `${runStatusPath}: discovery.query_handoff_status=${latestDiscovery.query_handoff_status || "missing"}`,
        "Current-date query handoff is not ready."
      ),
      check(
        "historical_query_runs",
        countDirs(root, "research/query-intelligence") > 0,
        `research/query-intelligence runs=${countDirs(root, "research/query-intelligence")}`,
        "No historical query intelligence runs exist."
      ),
    ]),
    requirement("validated_demand_intake", "Validated demand intake controls", [
      check("worklist_script", existsFile(root, "scripts/seo-aeo/build-demand-import-worklist.mjs"), "scripts/seo-aeo/build-demand-import-worklist.mjs", "Missing demand import worklist builder."),
      check("pack_script", existsFile(root, "scripts/seo-aeo/prepare-demand-import-pack.mjs"), "scripts/seo-aeo/prepare-demand-import-pack.mjs", "Missing demand import pack preparer."),
      check("validator_script", existsFile(root, "scripts/seo-aeo/validate-demand-import-pack.mjs"), "scripts/seo-aeo/validate-demand-import-pack.mjs", "Missing demand import pack validator."),
      check("bing_api_script", existsFile(root, "scripts/seo-aeo/pull-bing-webmaster.mjs"), "scripts/seo-aeo/pull-bing-webmaster.mjs", "Missing optional Bing Webmaster API query puller."),
      check(
        "current_worklist",
        demandWorklistFileExists && hasDemandWorklistCount,
        `${runStatusPath}: demand_import_worklist.request_count=${demandImportWorklist.request_count ?? "missing"}; json_path=${demandImportWorklist.json_path || "missing"}`,
        "No current demand import worklist file/count is available."
      ),
      check(
        "current_pack_validation",
        Boolean(demandImportPack.validation_report_json) && existsFile(root, demandImportPack.validation_report_json),
        `${runStatusPath}: demand_import_pack.validation_report_json=${demandImportPack.validation_report_json || "missing"}`,
        "No current demand import validation report is available."
      ),
    ]),
    requirement("trend_discovery_system", "Current trend discovery", [
      check("trend_run", existsDir(root, `research/trend-intelligence/${runDate}-daily-discovery`), `research/trend-intelligence/${runDate}-daily-discovery`, "No current trend run folder."),
      check("discovery_rows", Number(latestDiscovery.rows || 0) > 0, `${runStatusPath}: discovery.rows=${latestDiscovery.rows || 0}`, "No current discovery rows."),
      check("manual_import_lanes", importDiscoveryFiles > 0, `imports discovery csv files=${importDiscoveryFiles}`, "No current approved query/trend/manual discovery imports."),
      check(
        "reddit_policy",
        config.reddit?.enabled !== true,
        `${relative(root, config._path)}: reddit.enabled=${config.reddit?.enabled === true}`,
        "Reddit is enabled; confirm this is intentional and still discovery-only."
      ),
    ]),
    requirement("subagent_orchestration", "Aggressive subagent orchestration", [
      check("subagent_contracts", countFiles(root, "docs/seo-aeo/subagents", (name) => name.endsWith(".md")) >= 18, "docs/seo-aeo/subagents/*.md", "Missing role contracts."),
      check("queue_written", existsFile(root, `automation-runs/${runDate}/subagent-queue.json`), `automation-runs/${runDate}/subagent-queue.json`, "No queue written for current run."),
      check(
        "dispatch_written",
        existsFile(root, `automation-runs/${runDate}/subagent-dispatch/ready-batch.json`),
        `automation-runs/${runDate}/subagent-dispatch/ready-batch.json`,
        "No ready dispatch batch for current run."
      ),
      check(
        "artifact_check",
        subagentArtifactCheck.status === "passed",
        `automation-runs/${runDate}/subagent-artifact-check.json: status=${subagentArtifactCheck.status || "missing"}`,
        "Completed subagent artifacts have not passed the role/candidate handoff check."
      ),
      check(
        "tasks_routed",
        Number(subagents.counts?.completed_tasks || 0) + Number(subagents.counts?.blocked_tasks || 0) + Number(subagents.counts?.ready_tasks || 0) > 0,
        `${runStatusPath}: completed=${subagents.counts?.completed_tasks || 0}, blocked=${subagents.counts?.blocked_tasks || 0}, ready=${subagents.counts?.ready_tasks || 0}`,
        "No subagent tasks have been routed for the current run."
      ),
    ]),
    requirement("codex_automation_layer", "Codex recurring automation layer", [
      check("automation_audit", existsFile(root, `automation-runs/${runDate}/codex-automation-audit.json`), `automation-runs/${runDate}/codex-automation-audit.json`, "No current Codex automation audit."),
      check("daily_automation", (automationAudit.automations || []).some((item) => item.id === "sell-in-public-seo-aeo-daily-pipeline" && item.status === "ready"), "Codex automation: sell-in-public-seo-aeo-daily-pipeline", "Daily Codex pipeline automation is missing or stale."),
      check("weekly_automations", Number(automationAudit.summary?.ready || 0) >= 5, `Codex automation audit ready=${automationAudit.summary?.ready || 0}`, "Expected weekly/monthly Codex automations are missing or stale."),
    ]),
    requirement("content_generator", "Packet-to-static blog generator", [
      check("orchestrator", existsFile(root, "scripts/blog-orchestrator.mjs"), "scripts/blog-orchestrator.mjs", "Missing blog orchestrator."),
      check("strict_packet", countDirs(root, "content-packets") > 0, `content-packets dirs=${countDirs(root, "content-packets")}`, "No content packets exist."),
      check("generated_post", countDirs(root, "blog") > 0, `blog dirs=${countDirs(root, "blog")}`, "No generated blog output."),
      check("feed", existsFile(root, "feed.xml") && existsFile(root, "sitemap.xml"), "feed.xml and sitemap.xml", "Missing feed or sitemap."),
    ]),
    requirement("publish_governance", "Multi-post guarded publishing", [
      check("publish_plan", existsFile(root, `automation-runs/${runDate}/publish-plan.json`), `automation-runs/${runDate}/publish-plan.json`, "No current publish plan."),
      check("multi_post_limit", Number(publishing.limits?.max_posts_per_day || 0) >= 2, `${runStatusPath}: publishing.limits.max_posts_per_day`, "Daily post limit is not configured for multi-post days."),
      check(
        "publish_decision_written",
        hasPublishDecision(publishPlan),
        `automation-runs/${runDate}/publish-plan.json:status=${publishPlan.status || "missing"}`,
        "Publish governor has not written a ready/blocked/generated decision."
      ),
      check(
        "publish_blocker_accounting",
        hasPublishBlockerAccounting(publishPlan),
        `automation-runs/${runDate}/publish-plan.json:selected=${publishPlan.selected_packets?.length || 0}; blocked=${publishPlan.blocked_packets?.length || 0}`,
        "Publish governor did not account for selected or blocked packets."
      ),
    ]),
    requirement("analytics_feedback_loop", "Recursive analytics feedback", [
      check("score_script", existsFile(root, "scripts/seo-aeo/score-analytics.mjs"), "scripts/seo-aeo/score-analytics.mjs", "Missing scoring script."),
      check("decision_script", existsFile(root, "scripts/seo-aeo/generate-content-decisions.mjs"), "scripts/seo-aeo/generate-content-decisions.mjs", "Missing decision script."),
      check("fixture_check", analyticsFixtureStep.status === "completed", `automation-runs/${runDate}/daily-report.json: Check analytics feedback fixture`, "Analytics feedback fixture check has not completed for this run."),
      check(
        "decision_rows_or_healthy_empty",
        evidenceBackedContentDecisionRows > 0 || feedbackInputState === "healthy_empty" || eligibleDecisionEvidenceRows === 0,
        `analytics/content_decisions.csv rows=${contentDecisionRows}; evidence-backed decision rows=${evidenceBackedContentDecisionRows}; page decision-grade evidence rows=${eligibleDecisionEvidenceRows}; feedback_input_state=${feedbackInputState || "missing"}`,
        "No evidence-backed decision rows generated yet and there are decision-grade evidence rows that should be reviewed."
      ),
      check("packet_performance", countDirs(root, "content-packets") > 0, "content-packets/*/performance-log.csv", "No packets available to sync performance into."),
    ]),
    requirement("skill_steward_loop", "Self-improving skill stewardship", [
      check("skill_dirs", existsDir(root, ".codex/skills"), ".codex/skills/", "No repo-local skill directory."),
      check("skill_steward_script", existsFile(root, "scripts/seo-aeo/write-skill-steward-closeout.mjs"), "scripts/seo-aeo/write-skill-steward-closeout.mjs", "Missing steward closeout script."),
      check("learning_validator", existsFile(root, "scripts/seo-aeo/check-skill-learning.mjs"), "scripts/seo-aeo/check-skill-learning.mjs", "Missing skill learning validator."),
      check("closeout", existsFile(root, `automation-runs/${runDate}/skill-steward-closeout.md`), `automation-runs/${runDate}/skill-steward-closeout.md`, "No current steward closeout."),
    ]),
  ];

  const complete = requirements.filter((item) => item.status === "complete").length;
  const partial = requirements.filter((item) => item.status === "partial").length;
  const missing = requirements.filter((item) => item.status === "missing").length;
  const hardGaps = requirements
    .flatMap((item) => item.checks.filter((itemCheck) => !itemCheck.ok).map((itemCheck) => ({ requirement: item.id, check: itemCheck.id, gap: itemCheck.gap })))
    .slice(0, 20);

  return {
    schema_version: "1.0",
    audit_scope: "infrastructure_readiness",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    overall_status: overallStatus(requirements),
    infrastructure_readiness_status: overallStatus(requirements),
    production_readiness: productionReadiness({ root, runDate, runStatus, publishPlan, ownerActions, config }),
    summary: {
      complete,
      partial,
      missing,
      total: requirements.length,
    },
    requirements,
    hard_gaps: hardGaps,
    rule:
      "This audit verifies infrastructure readiness only. It must not mark the active Codex SEO/AEO goal complete; active-run production readiness is governed by run-status, publish-plan, run-gates, source handoffs, and human approval.",
  };
}

function writeMarkdown(filePath, audit) {
  const productionRows = (audit.production_readiness?.checks || [])
    .map((item) => `| ${item.id} | ${item.ok ? "pass" : "block"} | ${item.evidence} | ${item.ok ? "" : item.gap} |`)
    .join("\n");
  const lines = [
    "# SEO/AEO System Completion Audit",
    "",
    `Run date: ${audit.run_date}`,
    `Audit scope: ${audit.audit_scope}`,
    `Infrastructure status: ${audit.infrastructure_readiness_status || audit.overall_status}`,
    "",
    `Complete: ${audit.summary.complete}`,
    `Partial: ${audit.summary.partial}`,
    `Missing: ${audit.summary.missing}`,
    "",
    "## Production Readiness",
    "",
    `Status: ${audit.production_readiness?.status || "missing"}`,
    `Current run status: ${audit.production_readiness?.current_run_status || "missing"}`,
    `Selected packets: ${audit.production_readiness?.selected_packets ?? "missing"}`,
    `Owner next action: ${audit.production_readiness?.owner_next_action || "n/a"}`,
    `Authoritative gate artifact: ${audit.production_readiness?.authoritative_gate_artifact || "n/a"}`,
    "",
    "| Check | Status | Evidence | Gap |",
    "|---|---|---|---|",
    productionRows || "| None |  |  |  |",
    "",
    audit.production_readiness?.rule || "",
    "",
    "## Requirements",
    "",
    "| Requirement | Status | Missing checks |",
    "|---|---|---|",
    ...audit.requirements.map((item) => {
      const gaps = item.checks.filter((itemCheck) => !itemCheck.ok).map((itemCheck) => `${itemCheck.id}: ${itemCheck.gap}`).join("<br>");
      return `| ${item.label} | ${item.status} | ${gaps || "None"} |`;
    }),
    "",
    "## Rule",
    "",
    audit.rule,
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}`);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const audit = buildAudit(root, runDate);
  const jsonPath = path.join(outputDir, "system-completion-audit.json");
  const markdownPath = path.join(outputDir, "system-completion-audit.md");
  writeJsonAtomic(jsonPath, audit);
  writeMarkdown(markdownPath, audit);
  if (hasFlag("--summary")) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          run_date: runDate,
          audit_scope: audit.audit_scope,
          overall_status: audit.overall_status,
          infrastructure_readiness_status: audit.infrastructure_readiness_status,
          production_readiness: audit.production_readiness.status,
          summary: audit.summary,
          system_completion_audit_json: relative(root, jsonPath),
          system_completion_audit_md: relative(root, markdownPath),
          top_gaps: audit.hard_gaps.slice(0, 8),
        },
        null,
        2
      )
    );
  } else {
    console.log(JSON.stringify(audit, null, 2));
  }
  process.exit(0);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
