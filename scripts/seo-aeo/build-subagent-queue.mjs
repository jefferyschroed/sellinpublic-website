#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, readCsv } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const ROLE_FILES = {
  "Orchestrator": "01-orchestrator.md",
  "Topic Cartographer": "02-topic-cartographer.md",
  "Query Intelligence Agent": "03-query-intelligence.md",
  "Trend Discovery Agent": "04-trend-discovery.md",
  "Source Registry Agent": "05-source-registry.md",
  "Research Synthesis Agent": "06-research-synthesis.md",
  "SME Notes Agent": "07-sme-notes.md",
  "Outline Agent": "08-outline.md",
  "Draft Agent": "09-draft.md",
  "Claim Ledger Agent": "10-claim-ledger.md",
  "Metadata/Schema Agent": "11-metadata-schema.md",
  "Asset Agent": "12-asset.md",
  "Blog Generator Agent": "13-blog-generator.md",
  "Index/Feed Agent": "14-index-feed.md",
  "Distribution Agent": "15-distribution.md",
  "Analytics Feedback Agent": "16-analytics-feedback.md",
  "Skill Steward Agent": "17-skill-steward.md",
  "AEO/SEO QA Agent": "18-qa-agents.md",
  "QA Agent": "18-qa-agents.md",
};

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readCandidatePlan(root, runDate) {
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  if (!fs.existsSync(planPath)) return { planPath, rows: [] };
  return { planPath, rows: parseCsv(fs.readFileSync(planPath, "utf8")).rows };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assetDecision(candidate) {
  const explicit = String(candidate.asset_decision || "").trim();
  if (explicit) return explicit;
  const legacy = String(candidate.recommended_asset || "").trim();
  if (legacy === "refresh") return "refresh";
  if (legacy === "post_candidate" || legacy === "post_or_section") return "post";
  if (legacy === "faq_or_section") return "faq";
  if (legacy === "monitor_only") return "park";
  return "gap_resolution";
}

function lifecyclePath(candidate) {
  const decision = assetDecision(candidate);
  if (decision === "post") return "full_post_lifecycle";
  if (decision === "refresh") return "refresh_lifecycle";
  if (decision === "gap_resolution") return "authority_gap_resolution";
  if (decision === "h2" || decision === "faq" || decision === "comparison_table") return "section_or_faq_lifecycle";
  return "monitor_merge_or_retire_lifecycle";
}

const FULL_LIFECYCLE = [
  ["00_orchestration", "Orchestrator", "Confirm scope, write boundaries, packet path, blockers, and phase owners."],
  ["01_topic_authority", "Topic Cartographer", "Verify pillar, topic ID, score, asset decision, parent topic, and cannibalization risk."],
  ["02_query_intelligence", "Query Intelligence Agent", "Cluster query and answer-engine language as discovery-only input."],
  ["03_trend_discovery", "Trend Discovery Agent", "Collect dated market language and source leads without treating social inputs as evidence."],
  ["04_source_registry", "Source Registry Agent", "Find and grade approved factual sources or document source gaps."],
  ["05_research_synthesis", "Research Synthesis Agent", "Synthesize approved sources into research notes and open questions."],
  ["06_sme_notes", "SME Notes Agent", "Collect approved expert context and mark quote or sensitivity limits."],
  ["07_outline", "Outline Agent", "Create the answer-first structure and section evidence map."],
  ["08_draft", "Draft Agent", "Draft only after outline, source, and SME gates are ready."],
  ["09_claim_ledger", "Claim Ledger Agent", "Audit every factual, statistical, comparative, and expert claim."],
  ["10_metadata_schema", "Metadata/Schema Agent", "Prepare metadata and schema notes that match approved copy."],
  ["11_asset", "Asset Agent", "Plan article assets, alt text, rights, dimensions, and placement notes."],
  ["12_packet_qa", "AEO/SEO QA Agent", "Review source, claim, AEO, SEO, voice, metadata, asset, and packet readiness."],
  ["13_blog_generator", "Blog Generator Agent", "Validate and render only an approved strict packet."],
  ["14_index_feed", "Index/Feed Agent", "Verify generated article presence in index, sitemap, and feed surfaces."],
  ["15_publish_qa", "AEO/SEO QA Agent", "Review generated output, links, schema, canonical, index, feed, and sitemap behavior."],
  ["16_distribution", "Distribution Agent", "Prepare claim-safe launch and reuse copy after final URL confirmation."],
  ["17_analytics_feedback", "Analytics Feedback Agent", "Record the post-publish measurement plan and future refresh triggers."],
  ["18_skill_steward", "Skill Steward Agent", "Note repeated process failures or confirm no SOP or skill change is needed."],
];

const GAP_RESOLUTION = [
  ["00_orchestration", "Orchestrator", "Confirm the gap-resolution scope and stop drafting until gaps are resolved."],
  ["01_topic_authority", "Topic Cartographer", "Verify the score band, topic placement, and exact gap blocking a packet."],
  ["02_query_intelligence", "Query Intelligence Agent", "Validate demand language and identify missing query evidence."],
  ["03_trend_discovery", "Trend Discovery Agent", "Find dated discovery signals and source leads."],
  ["04_source_registry", "Source Registry Agent", "Find approved sources or document why source readiness is blocked."],
  ["05_research_synthesis", "Research Synthesis Agent", "Summarize what can responsibly be said and what remains unsupported."],
  ["06_sme_notes", "SME Notes Agent", "Identify SME questions required before a post or section can move forward."],
  ["07_authority_qa", "AEO/SEO QA Agent", "Confirm whether the gap-resolution work is enough to reopen the packet decision."],
  ["08_analytics_feedback", "Analytics Feedback Agent", "Record whether performance or demand signals justify revisiting the topic."],
  ["09_skill_steward", "Skill Steward Agent", "Log any recurring process gap or confirm no SOP change is warranted."],
];

const SECTION_OR_FAQ = [
  ["00_orchestration", "Orchestrator", "Confirm the parent asset and section, FAQ, or comparison-table write boundary."],
  ["01_topic_authority", "Topic Cartographer", "Verify the topic should stay inside another asset and name the parent topic."],
  ["02_query_intelligence", "Query Intelligence Agent", "Map wording to H2, FAQ, or table-row language without using it as evidence."],
  ["03_source_registry", "Source Registry Agent", "Find source support for any factual section or FAQ claims."],
  ["04_research_synthesis", "Research Synthesis Agent", "Write concise research notes for the section or FAQ only."],
  ["05_outline", "Outline Agent", "Place the H2, FAQ, or table row inside the parent article structure."],
  ["06_draft", "Draft Agent", "Draft only the scoped section, FAQ answer, or table-row copy."],
  ["07_claim_ledger", "Claim Ledger Agent", "Audit claims in the scoped addition."],
  ["08_metadata_schema", "Metadata/Schema Agent", "Note any metadata, FAQ schema, or internal-link implications."],
  ["09_section_qa", "AEO/SEO QA Agent", "Review the scoped addition and confirm it does not create a thin standalone post."],
  ["10_analytics_feedback", "Analytics Feedback Agent", "Record refresh or expansion triggers for the parent asset."],
  ["11_skill_steward", "Skill Steward Agent", "Log any recurring section/FAQ process issue or confirm no action."],
];

const MONITOR_ONLY = [
  ["00_orchestration", "Orchestrator", "Confirm no packet, draft, or publish work should start."],
  ["01_topic_authority", "Topic Cartographer", "Record park, merge, retire, or monitor reasoning."],
  ["02_trend_discovery", "Trend Discovery Agent", "Watch for stronger dated signals or source leads."],
  ["03_monitor_qa", "AEO/SEO QA Agent", "Confirm the decision does not leave an active post under-owned."],
  ["04_analytics_feedback", "Analytics Feedback Agent", "Record performance or demand triggers that would reopen the topic."],
  ["05_skill_steward", "Skill Steward Agent", "Log any process learning or confirm no action."],
];

const REQUIRED_FULL_ROLES = new Set([
  "Orchestrator",
  "Topic Cartographer",
  "Query Intelligence Agent",
  "Trend Discovery Agent",
  "Source Registry Agent",
  "Research Synthesis Agent",
  "SME Notes Agent",
  "Outline Agent",
  "Draft Agent",
  "Claim Ledger Agent",
  "Metadata/Schema Agent",
  "Asset Agent",
  "AEO/SEO QA Agent",
  "Blog Generator Agent",
  "Index/Feed Agent",
  "Distribution Agent",
  "Analytics Feedback Agent",
  "Skill Steward Agent",
]);

const REQUIRED_MINIMUM_ROLES = new Set(["Orchestrator", "Topic Cartographer", "AEO/SEO QA Agent", "Skill Steward Agent"]);

const ANALYTICS_READINESS_LABELS = [
  "analytics_readiness_investigation",
  "analytics_feedback_ready",
  "analytics_dispatch_ready",
  "approved_monitoring_target",
  "performance_review_ready",
];

function phasePlan(candidate) {
  const decision = assetDecision(candidate);
  const basePlan =
    decision === "post" || decision === "refresh"
      ? FULL_LIFECYCLE
      : decision === "gap_resolution"
        ? GAP_RESOLUTION
        : decision === "h2" || decision === "faq" || decision === "comparison_table"
          ? SECTION_OR_FAQ
          : MONITOR_ONLY;
  return filterAnalyticsFeedbackPhases(candidate, basePlan);
}

function candidateHasAnalyticsReadinessLabel(candidate) {
  const haystack = Object.values(candidate)
    .map((value) => String(value || "").toLowerCase())
    .join(" | ");
  return ANALYTICS_READINESS_LABELS.some((label) => haystack.includes(label));
}

function shouldKeepAnalyticsFeedback(candidate, phase, role, basePlan) {
  if (role !== "Analytics Feedback Agent") return true;
  if (basePlan === FULL_LIFECYCLE) return true;
  if (candidateHasAnalyticsReadinessLabel(candidate)) return true;
  return false;
}

function skippedAnalyticsReason(candidate) {
  const packetStatus = String(candidate.packet_intake_status || "").trim() || "unknown_packet_status";
  const recommendedAsset = String(candidate.recommended_asset || "").trim() || "unknown_asset";
  return [
    "analytics_feedback_skipped_pre_dispatch_readiness",
    `packet_intake_status:${packetStatus}`,
    `recommended_asset:${recommendedAsset}`,
    "missing_label:analytics_readiness_investigation",
  ].join(" | ");
}

function filterAnalyticsFeedbackPhases(candidate, basePlan) {
  const filtered = [];
  const skipped = [];
  for (const [phase, role, gate] of basePlan) {
    if (shouldKeepAnalyticsFeedback(candidate, phase, role, basePlan)) {
      filtered.push([phase, role, gate]);
    } else {
      skipped.push({
        phase,
        role,
        gate,
        reason: skippedAnalyticsReason(candidate),
      });
    }
  }
  return { phases: filtered, skipped };
}

function contractPath(root, role) {
  const fileName = ROLE_FILES[role] || ROLE_FILES["QA Agent"];
  return path.join(root, "docs", "seo-aeo", "subagents", fileName);
}

function loadContract(root, role) {
  const filePath = contractPath(root, role);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function refreshTargetsByCandidate(root, runDate) {
  const targetsPath = path.join(root, "research", "daily-content-plan", runDate, "refresh-targets.json");
  const report = readJson(targetsPath, {});
  const rows = Array.isArray(report.rows) ? report.rows : [];
  return new Map(rows.filter((row) => row.candidate_id).map((row) => [row.candidate_id, row]));
}

function roleWriteScope(role, candidate, phase) {
  const base = `research/daily-content-plan/${candidate.date}/`;
  const phasePrefix = phase.replace(/^[0-9]+_/, "");
  if (role === "Topic Cartographer") return `${base}topic-authority-notes-${candidate.candidate_id}.md`;
  if (role === "Query Intelligence Agent") return `${base}query-intelligence-notes-${candidate.candidate_id}.md`;
  if (role === "Trend Discovery Agent") return `${base}trend-discovery-notes-${candidate.candidate_id}.md`;
  if (role === "Source Registry Agent") return `${base}source-gaps-${candidate.candidate_id}.md`;
  if (role === "Research Synthesis Agent") return `${base}research-synthesis-${candidate.candidate_id}.md`;
  if (role === "SME Notes Agent") return `${base}sme-questions-${candidate.candidate_id}.md`;
  if (role === "Outline Agent") return `${base}outline-proposal-${candidate.candidate_id}.md`;
  if (role === "Draft Agent") return `${base}${assetDecision(candidate)}-draft-notes-${candidate.candidate_id}.md`;
  if (role === "Claim Ledger Agent") return `${base}claim-plan-${candidate.candidate_id}.csv`;
  if (role === "Metadata/Schema Agent") return `${base}metadata-schema-notes-${candidate.candidate_id}.md`;
  if (role === "Asset Agent") return `${base}asset-plan-${candidate.candidate_id}.md`;
  if (role === "Blog Generator Agent") return `${base}generator-readiness-${candidate.candidate_id}.md`;
  if (role === "Index/Feed Agent") return `${base}index-feed-check-${candidate.candidate_id}.md`;
  if (role === "Distribution Agent") return `${base}distribution-plan-${candidate.candidate_id}.md`;
  if (role === "Analytics Feedback Agent") return `${base}analytics-feedback-${candidate.candidate_id}.md`;
  if (role === "Skill Steward Agent") return `${base}skill-steward-${candidate.candidate_id}.md`;
  if (role === "AEO/SEO QA Agent" || role === "QA Agent") return `${base}qa-notes-${phasePrefix}-${candidate.candidate_id}.md`;
  if (role === "Orchestrator") return `${base}orchestrator-${phasePrefix}-${candidate.candidate_id}.md`;
  return `${base}${slugify(role)}-${phasePrefix}-${candidate.candidate_id}.md`;
}

function demandImportArtifactPath(row) {
  return `research/daily-content-plan/${row.date}/demand-import-review-${row.candidate_id}-rank${row.import_rank || "x"}.md`;
}

function destinationHasRows(root, row) {
  const destinationPath = path.resolve(root, row.destination_path || "");
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!row.destination_path || (destinationPath !== root && !destinationPath.startsWith(rootWithSep))) return false;
  return readCsv(destinationPath).rows.length > 0;
}

function demandImportPrompt({ row, contract }) {
  return `You are not alone in the codebase; do not revert or overwrite edits by others.

Use this role contract:

${contract}

Demand import request:
- Candidate ID: ${row.candidate_id}
- Topic: ${row.topic}
- Topic ID: ${row.topic_id || "(unmapped)"}
- Pillar ID: ${row.pillar_id || "(unmapped)"}
- Priority: ${row.priority}
- Import rank: ${row.import_rank}
- Primary recommended import: ${row.primary_recommended_import}
- Priority reason: ${row.priority_reason}
- Import type: ${row.recommended_import_type}
- Query or topic to validate: ${row.query_or_topic_to_validate}
- Template path: ${row.template_path}
- Staging CSV path: research/daily-content-plan/${row.date}/demand-import-pack/
- Final destination path: ${row.destination_path}
- Required review fields: ${row.required_review_fields}

Write scope:
${demandImportArtifactPath(row)}

Task:
Perform only this rank-${row.import_rank} validated-demand import review for the Query Intelligence lane. Start by checking whether the final destination path already contains real reviewed rows. If it does, summarize whether the rows are enough to rerun the daily controller.

If the final destination is empty or missing, do not invent data, do not estimate demand, and do not use AnswerThePublic, autocomplete, PAA, AI answers, Reddit, or public feeds as validated demand. Write a short acquisition brief for the exact approved source named above, including the query to run, required fields, final destination, and a blocked/ready status.

The artifact must include:
- candidate_id
- import_status: ready_existing_rows, blocked_missing_reviewed_export, or blocked_source_unavailable
- recommended_next_command
- handoff_status: ready only if reviewed rows already exist; otherwise blocked
- readiness_caveat: note that the current query handoff may still stay draft unless the daily discovery run has at least 5 normalized rows, at least 2 source types overall, at least one non-monitor cluster, and validated demand.

Use this command chain after reviewed staging rows are filled:
\`\`\`sh
node scripts/seo-aeo/run-demand-promotion.mjs --date ${row.date} --dry-run
node scripts/seo-aeo/run-demand-promotion.mjs --date ${row.date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${row.date}
# Optional only after reviewing the plain promotion report and receiving packet approval:
node scripts/seo-aeo/run-demand-promotion.mjs --date ${row.date} --apply --scaffold-limit 1 --scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:${row.date}
\`\`\`

Do not draft, approve, generate, publish, or distribute a blog post.`;
}

function primaryDemandImportRows(root, runDate, limit) {
  const worklistPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-worklist.json");
  const worklist = readJson(worklistPath, {});
  const rows = Array.isArray(worklist.rows) ? worklist.rows : [];
  return rows
    .filter((row) => String(row.primary_recommended_import || "").toLowerCase() === "yes")
    .filter((row) => String(row.status || "").toLowerCase() !== "completed")
    .filter((row) => !destinationHasRows(root, row))
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const left = priorityOrder[a.priority] ?? 9;
      const right = priorityOrder[b.priority] ?? 9;
      if (left !== right) return left - right;
      return String(a.candidate_id || "").localeCompare(String(b.candidate_id || ""));
    })
    .slice(0, limit);
}

function demandImportTasks(root, runDate, limit) {
  const role = "Query Intelligence Agent";
  const contract = loadContract(root, role);
  return primaryDemandImportRows(root, runDate, limit).map((row) => {
    const taskId = `${row.candidate_id}-demand-import-rank${row.import_rank}-${slugify(row.recommended_import_type)}`;
    const artifactPath = demandImportArtifactPath(row);
    return {
      task_id: taskId,
      run_date: runDate,
      candidate_id: row.candidate_id,
      topic: row.topic,
      topic_id: row.topic_id || "",
      pillar_id: row.pillar_id || "",
      task_type: "validated_demand_import",
      asset_decision: "gap_resolution",
      lifecycle_path: "validated_demand_import",
      phase: "demand_import_rank1",
      gate: "Resolve the rank-1 validated-demand import request before packet intake can become ready.",
      role,
      contract_path: path.relative(root, contractPath(root, role)),
      depends_on: [],
      write_scope: artifactPath,
      artifact_path: artifactPath,
      status: "queued",
      demand_import: {
        import_rank: row.import_rank,
        primary_recommended_import: row.primary_recommended_import,
        priority_reason: row.priority_reason,
        recommended_import_type: row.recommended_import_type,
        template_path: row.template_path,
        destination_path: row.destination_path,
        required_review_fields: row.required_review_fields,
        query_or_topic_to_validate: row.query_or_topic_to_validate,
      },
      prompt: demandImportPrompt({ row, contract }),
    };
  });
}

function readDemandAcquisitionReportStatus(root, reportPath) {
  if (!reportPath) return "";
  const absolutePath = path.join(root, reportPath);
  if (!fs.existsSync(absolutePath)) return "";
  const source = fs.readFileSync(absolutePath, "utf8");
  return source.match(/^status:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";
}

function demandAcquisitionPrompt(root, task) {
  const promptPath = task.prompt_path ? path.join(root, task.prompt_path) : "";
  if (promptPath && fs.existsSync(promptPath)) return fs.readFileSync(promptPath, "utf8");
  return `You are not alone in the codebase; do not revert or overwrite edits by others.

Demand acquisition task:
- Task ID: ${task.task_id}
- Candidate ID: ${task.candidate_id}
- Topic: ${task.topic}
- Import type: ${task.recommended_import_type}
- Query/topic to validate: ${task.query_or_topic_to_validate}

Write scope:
- Staging CSV: ${task.staging_csv_path}
- Acquisition report: ${task.report_path}

Acquire only real reviewed demand rows from the approved source. If rows are available, write the staging CSV and set the report status to staged_reviewed_rows. If the source is unavailable, empty, inaccessible, or discovery-only, leave the staging CSV header-only and set the report status to blocked_no_reviewed_rows with the exact blocker. Do not invent demand data.`;
}

function demandAcquisitionTasks(root, runDate) {
  const tasksPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "tasks.json");
  const batch = readJson(tasksPath, {});
  const rows = Array.isArray(batch.tasks) ? batch.tasks : [];
  return rows
    .filter((task) => !["already_promoted", "staged_rows_need_promotion"].includes(task.status))
    .filter((task) => !["blocked_no_reviewed_rows", "staged_reviewed_rows"].includes(readDemandAcquisitionReportStatus(root, task.report_path)))
    .map((task) => ({
      task_id: task.task_id,
      run_date: runDate,
      candidate_id: task.candidate_id,
      topic: task.topic,
      topic_id: task.topic_id || "",
      pillar_id: task.pillar_id || "",
      task_type: "demand_acquisition",
      asset_decision: "gap_resolution",
      lifecycle_path: "validated_demand_acquisition",
      phase: "demand_acquisition",
      gate: "Acquire one real reviewed demand source into staging before packet intake can become ready.",
      role: "Query Intelligence Agent",
      contract_path: path.relative(root, contractPath(root, "Query Intelligence Agent")),
      depends_on: [],
      write_scope: [task.staging_csv_path, task.report_path].filter(Boolean).join(" | "),
      artifact_path: task.report_path,
      status: "queued",
      demand_acquisition: {
        priority: task.priority,
        import_rank: task.import_rank,
        primary_recommended_import: task.primary_recommended_import,
        priority_reason: task.priority_reason,
        recommended_import_type: task.recommended_import_type,
        acquisition_method: task.acquisition_method,
        source_url: task.source_url,
        staging_csv_path: task.staging_csv_path,
        final_destination_path: task.final_destination_path,
        report_path: task.report_path,
        source_instructions: task.source_instructions || [],
        required_review_fields: task.required_review_fields,
        query_or_topic_to_validate: task.query_or_topic_to_validate,
      },
      prompt: demandAcquisitionPrompt(root, task),
    }));
}

function sourceRequestLock(root, runDate) {
  const requestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  const request = readJson(requestPath, {});
  return {
    active: request.status === "escalation_required" || request.source_probe_lock?.active === true,
    path: fs.existsSync(requestPath) ? path.relative(root, requestPath).split(path.sep).join("/") : "",
    status: request.status || "",
    requested_export_count: request.requested_export_count || 0,
    reason: request.source_probe_lock?.reason || request.required_owner_action || "",
  };
}

function refreshTargetBlock(candidate, refreshTarget) {
  if (assetDecision(candidate) !== "refresh") return "";
  if (!refreshTarget) {
    return `
Refresh target:
- Status: missing_refresh_targets_artifact
- Rule: Stop before editing, drafting, generating, or publishing. Run \`node scripts/seo-aeo/resolve-refresh-targets.mjs --date ${candidate.date}\` and require an unambiguous existing packet target.`;
  }
  return `
Refresh target:
- Resolution: ${refreshTarget.target_resolution_status || "unknown"}
- Packet path: ${refreshTarget.packet_path || "(missing)"}
- Brief path: ${refreshTarget.brief_path || "(missing)"}
- Publish meta path: ${refreshTarget.publish_meta_path || "(missing)"}
- Refresh notes path: ${refreshTarget.refresh_notes_path || "(missing)"}
- Current status: ${refreshTarget.current_status || "(unknown)"}
- Blockers: ${refreshTarget.blockers || "none"}
- Rule: Refresh work may inspect only the resolved existing packet target. Do not scaffold a duplicate packet. Stop if resolution is not \`resolved\`.`;
}

function taskPrompt({ role, candidate, contract, phase, gate, dependsOn, refreshTarget }) {
  return `You are not alone in the codebase; do not revert or overwrite edits by others.

Use this role contract:

${contract}

Candidate:
- ID: ${candidate.candidate_id}
- Topic: ${candidate.topic}
- Intent: ${candidate.intent}
- Topic ID: ${candidate.topic_id || "(unmapped)"}
- Pillar ID: ${candidate.pillar_id || "(unmapped)"}
- Topic score: ${candidate.topic_score_guess || "(unscored)"} (${candidate.topic_score_source || "unknown source"})
- Score band: ${candidate.score_band || "(unknown)"}
- Asset decision: ${assetDecision(candidate)}
- Topic decision: ${candidate.topic_decision || "(unknown)"}
- Recommended asset: ${candidate.recommended_asset}
- Evidence use: ${candidate.evidence_use}
- Next action: ${candidate.next_action}

Lifecycle:
- Path: ${lifecyclePath(candidate)}
- Phase: ${phase}
- Gate: ${gate}
- Depends on: ${dependsOn.length ? dependsOn.join(", ") : "none"}
${refreshTargetBlock(candidate, refreshTarget)}

Write scope:
${roleWriteScope(role, candidate, phase)}

Task:
Perform only the ${role} work for this candidate and phase. Produce the output artifact named in the write scope. Do not draft, approve, generate, publish, or distribute a whole blog post unless this exact phase and role contract authorizes that narrow action. Do not use Reddit, AI prompt exports, autocomplete, PAA, or query exports as factual evidence. Stop and report gaps if source, SME, dependency, or approval gates are missing.`;
}

function validateCoverage(candidate, taskPlans) {
  const roles = new Set(taskPlans.map((task) => task.role));
  const required = assetDecision(candidate) === "post" || assetDecision(candidate) === "refresh" ? REQUIRED_FULL_ROLES : REQUIRED_MINIMUM_ROLES;
  const missing = Array.from(required).filter((role) => !roles.has(role));
  if (missing.length) {
    throw new Error(`Candidate ${candidate.candidate_id} is missing required lifecycle roles: ${missing.join(", ")}`);
  }
  if (taskPlans.length < 2) throw new Error(`Candidate ${candidate.candidate_id} would be handled by one agent; refusing to build queue.`);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const limit = Number(arg("--limit", "12"));
  const demandLimit = Number(arg("--demand-limit", String(limit)));
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const { planPath, rows } = readCandidatePlan(root, runDate);
  const refreshTargets = refreshTargetsByCandidate(root, runDate);
  const tasks = [];
  const omittedTasks = [];
  const demandSourceLock = sourceRequestLock(root, runDate);
  const rawAcquisitionTasks = demandAcquisitionTasks(root, runDate);
  const acquisitionTasks = demandSourceLock.active ? [] : rawAcquisitionTasks;
  const importTasks = demandImportTasks(root, runDate, demandLimit);
  if (demandSourceLock.active && rawAcquisitionTasks.length) {
    omittedTasks.push({
      run_date: runDate,
      candidate_id: "demand-acquisition",
      topic: "Demand acquisition paused by source request lock",
      asset_decision: "gap_resolution",
      lifecycle_path: "validated_demand_acquisition",
      phase: "demand_acquisition",
      role: "Query Intelligence Agent",
      reason: `${rawAcquisitionTasks.length} demand acquisition task(s) suppressed until ${demandSourceLock.path || "source-request.json"} is resolved.`,
    });
  }

  tasks.push(...acquisitionTasks);
  tasks.push(...importTasks);

  for (const candidate of rows.slice(0, limit)) {
    const plan = phasePlan(candidate);
    const taskPlans = plan.phases.map(([phase, role, gate]) => ({ phase, role, gate }));
    for (const skipped of plan.skipped) {
      omittedTasks.push({
        run_date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        asset_decision: assetDecision(candidate),
        lifecycle_path: lifecyclePath(candidate),
        ...skipped,
      });
    }
    validateCoverage(candidate, taskPlans);
    let priorTaskId = "";
    for (const plan of taskPlans) {
      const { phase, role, gate } = plan;
      const dependsOn = priorTaskId ? [priorTaskId] : [];
      const contract = loadContract(root, role);
      const taskId = `${candidate.candidate_id}-${phase}-${slugify(role)}`;
      const refreshTarget = refreshTargets.get(candidate.candidate_id) || null;
      tasks.push({
        task_id: taskId,
        run_date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        topic_id: candidate.topic_id || "",
        pillar_id: candidate.pillar_id || "",
        asset_decision: assetDecision(candidate),
        lifecycle_path: lifecyclePath(candidate),
        phase,
        gate,
        role,
        contract_path: path.relative(root, contractPath(root, role)),
        depends_on: dependsOn,
        write_scope: roleWriteScope(role, candidate, phase),
        artifact_path: roleWriteScope(role, candidate, phase),
        refresh_target: refreshTarget,
        status: "queued",
        prompt: taskPrompt({ role, candidate, contract, phase, gate, dependsOn, refreshTarget }),
      });
      priorTaskId = taskId;
    }
  }

  const report = {
    run_date: runDate,
    generated_at: new Date().toISOString(),
    plan_path: path.relative(root, planPath),
    task_count: tasks.length,
    demand_acquisition_task_count: acquisitionTasks.length,
    demand_acquisition_suppressed_task_count: demandSourceLock.active ? rawAcquisitionTasks.length : 0,
    source_request_lock: demandSourceLock,
    demand_import_task_count: importTasks.length,
    omitted_task_count: omittedTasks.length,
    rule: "No single subagent owns a whole blog post. Tasks are phase-scoped, dependency-aware, and include QA plus Skill Steward coverage. Demand acquisition and rank-1 validated-demand import tasks are scoped to Query Intelligence only and cannot create or infer demand data.",
    analytics_feedback_dispatch_rule:
      "Non-full-lifecycle candidates skip Analytics Feedback unless a candidate field includes analytics_readiness_investigation or another approved analytics-readiness label.",
    tasks,
    omitted_tasks: omittedTasks,
  };

  writeJsonAtomic(path.join(outputDir, "subagent-queue.json"), report);
  const markdown = `# Subagent Queue

Run date: ${runDate}

Rule: no single subagent owns a whole post. Full post and refresh candidates receive separate lifecycle phase tasks. Gap, H2, FAQ, comparison, park, merge, and retire candidates receive narrower phase queues with QA and Skill Steward coverage.

${tasks
  .map(
    (task) => `## ${task.task_id}

- Role: ${task.role}
- Phase: ${task.phase}
- Gate: ${task.gate}
- Lifecycle path: ${task.lifecycle_path}
- Asset decision: ${task.asset_decision}
- Candidate: ${task.topic}
- Contract: ${task.contract_path}
- Depends on: ${task.depends_on.length ? task.depends_on.join(", ") : "none"}
- Write scope: ${task.write_scope}
- Artifact path: ${task.artifact_path}
${task.refresh_target ? `- Refresh target: ${task.refresh_target.target_resolution_status} -> \`${task.refresh_target.packet_path || "missing"}\`` : ""}
${task.demand_acquisition ? `- Demand acquisition: rank ${task.demand_acquisition.import_rank}, ${task.demand_acquisition.recommended_import_type}, staging \`${task.demand_acquisition.staging_csv_path}\`, report \`${task.demand_acquisition.report_path}\`` : ""}
${task.demand_import ? `- Demand import: rank ${task.demand_import.import_rank}, ${task.demand_import.recommended_import_type}, destination \`${task.demand_import.destination_path}\`` : ""}
`
  )
  .join("\n")}

## Omitted Tasks

${omittedTasks.length ? omittedTasks
  .map(
    (task) => `- ${task.candidate_id} / ${task.phase} / ${task.role}: ${task.reason}`
  )
  .join("\n") : "- None."}
`;
  fs.writeFileSync(path.join(outputDir, "subagent-queue.md"), markdown);
  console.log(JSON.stringify({ ok: true, runDate, tasks: tasks.length, outputDir }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
