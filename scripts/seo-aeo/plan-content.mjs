#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";
import { parseCsv, readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { contentDecisionHasDecisionGradeEvidence } from "./lib/content-decisions.mjs";
import { today } from "./lib/dates.mjs";

const OUTPUT_HEADERS = [
  "date",
  "candidate_id",
  "topic",
  "intent",
  "source_signal",
  "topic_id",
  "pillar_id",
  "parent_topic",
  "canonical_topic",
  "aeo_question",
  "topic_score_guess",
  "topic_score_source",
  "score_band",
  "strategic_asset_decision",
  "asset_decision",
  "recommended_asset",
  "packet_intake_status",
  "gate_reasons",
  "required_before_packet",
  "query_run_status",
  "topic_decision",
  "coverage_status",
  "coverage_role",
  "source_readiness",
  "authority_match",
  "recommended_subagents",
  "evidence_use",
  "next_action",
  "content_decision_id",
  "content_decision_first_seen_date",
  "content_decision_last_seen_date",
  "content_decision_evidence_signature",
  "content_decision_supersedes",
  "content_decision_outcome",
];

const FULL_LIFECYCLE_ROLES = [
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
];

const GAP_RESOLUTION_ROLES = [
  "Orchestrator",
  "Topic Cartographer",
  "Query Intelligence Agent",
  "Trend Discovery Agent",
  "Source Registry Agent",
  "Research Synthesis Agent",
  "SME Notes Agent",
  "AEO/SEO QA Agent",
  "Analytics Feedback Agent",
  "Skill Steward Agent",
];

const SECTION_ROLES = [
  "Orchestrator",
  "Topic Cartographer",
  "Query Intelligence Agent",
  "Source Registry Agent",
  "Research Synthesis Agent",
  "Outline Agent",
  "Draft Agent",
  "Claim Ledger Agent",
  "Metadata/Schema Agent",
  "AEO/SEO QA Agent",
  "Analytics Feedback Agent",
  "Skill Steward Agent",
];

const MONITOR_ROLES = [
  "Orchestrator",
  "Topic Cartographer",
  "Trend Discovery Agent",
  "AEO/SEO QA Agent",
  "Analytics Feedback Agent",
  "Skill Steward Agent",
];

const ACTIVE_CONTENT_DECISION_STATUSES = new Set(["proposed", "approved", "accepted", "owner_approved"]);
const APPROVED_CONTENT_DECISION_STATUSES = new Set(["approved", "accepted", "owner_approved"]);
const ACTIONABLE_CONTENT_DECISIONS = new Set(["refresh", "update", "expand", "investigate", "merge", "retire"]);
const CLOSED_CONTENT_DECISION_OUTCOMES = new Set(["completed", "closed", "superseded", "rejected", "no_action", "no-action"]);

function latestFile(root, globDir, fileName) {
  const absolute = path.join(root, globDir);
  if (!fs.existsSync(absolute)) return "";
  const dirs = fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const candidate = path.join(absolute, dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function latestDir(root, globDir) {
  const absolute = path.join(root, globDir);
  if (!fs.existsSync(absolute)) return "";
  const dirs = fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return dirs.length ? path.join(absolute, dirs[0]) : "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scalar(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? scalar(match[1]) : "";
}

function queryContextFromRunDir(root, runDir) {
  const handoffPath = path.join(runDir, "brief-handoff.yaml");
  const handoffStatus = readYamlScalar(handoffPath, "handoff_status") || "unknown";
  return {
    run_dir: path.relative(root, runDir).split(path.sep).join("/"),
    handoff_status: handoffStatus,
    query_run_status: `handoff_${handoffStatus}`,
  };
}

function latestQueryContext(root, runDate) {
  const runDateQueryDir = path.join(root, "research", "query-intelligence", `${runDate}-daily-discovery`);
  if (fs.existsSync(runDateQueryDir)) return queryContextFromRunDir(root, runDateQueryDir);

  const runDateTrendHandoff = path.join(root, "research", "trend-intelligence", `${runDate}-daily-discovery`, "brief-handoff-candidates.yaml");
  if (fs.existsSync(runDateTrendHandoff)) {
    const handoffStatus = readYamlScalar(runDateTrendHandoff, "handoff_status") || "unknown";
    return {
      run_dir: path.relative(root, path.dirname(runDateTrendHandoff)).split(path.sep).join("/"),
      handoff_status: handoffStatus,
      query_run_status: `daily_discovery_${handoffStatus}`,
    };
  }

  return {
    run_dir: "",
    handoff_status: "missing_current_daily_discovery",
    query_run_status: "missing_current_daily_discovery",
  };
}

function parseTopicMap(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const topics = [];
  let pillarId = "";
  let pillarName = "";
  let inTopics = false;
  let topic = null;

  const flushTopic = () => {
    if (topic) topics.push(topic);
    topic = null;
  };

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const pillarMatch = line.match(/^  - id:\s*(.+)$/);
    if (pillarMatch) {
      flushTopic();
      pillarId = scalar(pillarMatch[1]);
      pillarName = "";
      inTopics = false;
      continue;
    }

    const pillarNameMatch = line.match(/^    name:\s*(.+)$/);
    if (pillarNameMatch && !inTopics) {
      pillarName = scalar(pillarNameMatch[1]);
      continue;
    }

    if (/^    topics:\s*$/.test(line)) {
      inTopics = true;
      continue;
    }

    const topicMatch = line.match(/^      - id:\s*(.+)$/);
    if (topicMatch && inTopics) {
      flushTopic();
      topic = {
        topic_id: scalar(topicMatch[1]),
        pillar_id: pillarId,
        pillar_name: pillarName,
        authority_source: "topic-map.yaml",
      };
      continue;
    }

    const fieldMatch = line.match(/^        ([a-z_]+):\s*(.*)$/);
    if (topic && fieldMatch) {
      const [, key, value] = fieldMatch;
      if (value.trim() !== "") topic[key] = scalar(value);
    }
  }

  flushTopic();
  return topics;
}

function scoreSourceFor(entry) {
  if (!entry) return "";
  if (entry.coverage_score) return "topic-coverage.csv";
  if (entry.map_score) return "topic-map.yaml";
  return "";
}

function scoreForAuthority(entry) {
  const value = firstValue(entry?.coverage_score, entry?.map_score, entry?.score);
  return value === "" ? null : Number(value);
}

function mergeAuthorityRows(root) {
  const topicMapRows = parseTopicMap(path.join(root, "docs", "seo-aeo", "topic-map.yaml")).map((row) => ({
    ...row,
    map_score: row.score,
  }));
  const coverageRows = readCsv(path.join(root, "docs", "seo-aeo", "topic-coverage.csv")).rows.map((row) => ({
    ...row,
    coverage_score: row.score,
    authority_source: "topic-coverage.csv",
  }));
  const byTopicId = new Map();

  for (const row of topicMapRows) {
    if (row.topic_id) byTopicId.set(row.topic_id, row);
  }

  for (const row of coverageRows) {
    const current = row.topic_id ? byTopicId.get(row.topic_id) || {} : {};
    const merged = {
      ...current,
      ...Object.fromEntries(Object.entries(row).filter(([, value]) => String(value || "").trim() !== "")),
      map_score: current.map_score,
      coverage_score: row.coverage_score,
      authority_source: "topic-coverage.csv",
    };
    if (merged.topic_id) byTopicId.set(merged.topic_id, merged);
  }

  const entries = Array.from(byTopicId.values());
  const index = new Map();
  const add = (key, entry, basis) => {
    const normalized = normalizeText(key);
    if (normalized && !index.has(normalized)) index.set(normalized, { ...entry, match_basis: basis });
  };

  for (const entry of entries) {
    add(entry.topic_id, entry, "topic_id");
    add(entry.primary_query, entry, "primary_query");
    add(entry.aeo_question, entry, "aeo_question");
    add(entry.title, entry, "title");
    add(entry.slug, entry, "slug");
  }

  return { entries, index };
}

function findAuthority(candidate, authority) {
  for (const [key, basis] of [
    [candidate.topic_id, "topic_id"],
    [candidate.topic, "topic"],
    [candidate.aeo_question, "aeo_question"],
  ]) {
    const match = authority.index.get(normalizeText(key));
    if (match) return { ...match, match_basis: basis === "topic" ? match.match_basis : basis };
  }
  return null;
}

function fallbackScore(candidate) {
  const sourceCount = Number(candidate.source_count || 0);
  const maxScore = Number(candidate.max_score || 0);
  if (candidate.source_type === "query" && candidate.volume) return 70;
  if (candidate.source_type === "query") return 55;
  return Math.min(80, 45 + sourceCount * 5 + Math.min(20, maxScore / 5));
}

function scoreBand(score) {
  if (score >= 80) return "80-100:create_or_refresh";
  if (score >= 65) return "65-79:resolve_gap_first";
  if (score >= 50) return "50-64:map_inside_asset";
  return "0-49:park_merge_or_retire";
}

function isPublished(entry) {
  return /published|live/i.test(String(entry?.status || ""));
}

function assetDecision(candidate, entry, score) {
  const decision = String(entry?.decision || "").toLowerCase();
  const targetAsset = String(entry?.target_asset || "").toLowerCase();
  const nextAction = String(entry?.next_action || "").toLowerCase();
  const intent = String(candidate.intent || entry?.intent || "").toLowerCase();

  if (/retire/.test(decision)) return "retire";
  if (/merge/.test(decision)) return "merge";
  if (/park|reject/.test(decision)) return "park";
  if (isPublished(entry) || /refresh/.test(nextAction)) return "refresh";
  if (/resolve_gap_first/.test(decision) || (score >= 65 && score < 80)) return "gap_resolution";

  if (/map_as_h2_faq_or_section/.test(decision) || /faq_or_section|section_or_post_candidate/.test(targetAsset)) {
    if (/faq/.test(targetAsset) || intent === "objection" || intent === "unknown") return "faq";
    return "h2";
  }

  if (score >= 80) return "post";
  if (score >= 50) {
    if (intent === "comparison") return "comparison_table";
    if (intent === "objection" || intent === "unknown") return "faq";
    return "h2";
  }
  return "park";
}

function legacyRecommendedAsset(decision) {
  if (decision === "post") return "post_candidate";
  if (decision === "refresh") return "refresh";
  if (decision === "h2" || decision === "faq" || decision === "comparison_table") return "faq_or_section";
  if (decision === "gap_resolution") return "monitor_only";
  return "monitor_only";
}

function topicDecision(entry, score) {
  if (entry?.decision) return entry.decision;
  if (score >= 80) return "create_or_refresh_packet";
  if (score >= 65) return "resolve_gap_first";
  if (score >= 50) return "map_as_h2_faq_or_section";
  return "park_merge_or_retire";
}

function normalizeStatus(value) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function isApprovedContentDecisionStatus(value) {
  return APPROVED_CONTENT_DECISION_STATUSES.has(normalizeStatus(value));
}

function isOpenContentDecisionOutcome(value) {
  const normalized = normalizeStatus(value);
  return !normalized || !CLOSED_CONTENT_DECISION_OUTCOMES.has(normalized);
}

function stableCandidateId(row, index) {
  const decisionId = normalizeText(row.decision_id);
  if (decisionId) return `decision-${decisionId}`;
  return `decision-${String(index + 1).padStart(3, "0")}`;
}

function decisionFromPerformanceFeedback(candidate, defaultDecision) {
  if (candidate.source_type !== "content_decision") return defaultDecision;

  const decision = normalizeStatus(candidate.content_decision);
  const approved = isApprovedContentDecisionStatus(candidate.content_decision_status);
  if (decision === "merge" || decision === "retire") return decision;
  if (decision === "refresh" || decision === "update" || decision === "expand" || decision === "investigate") {
    return approved ? "refresh" : "gap_resolution";
  }
  return "gap_resolution";
}

function nextActionFor(candidate, entry, decision) {
  if (candidate.source_type === "content_decision") {
    const status = normalizeStatus(candidate.content_decision_status);
    const contentDecision = normalizeStatus(candidate.content_decision);
    if (!isApprovedContentDecisionStatus(status)) {
      return `review_performance_decision_before_packet:${contentDecision || "unknown"}:${status || "unknown"}`;
    }
    return `route_approved_performance_decision:${contentDecision || "unknown"}:${candidate.recommended_action || "review_packet_refresh_scope"}`;
  }
  if (entry?.next_action) return entry.next_action;
  if (decision === "post") return "open_packet_after_source_and_sme_gates";
  if (decision === "refresh") return "refresh_existing_topic_or_add_internal_link";
  if (decision === "h2") return `map_as_h2_in_parent_topic:${entry?.parent_topic || candidate.parent_topic || "needs_parent_topic"}`;
  if (decision === "faq") return `map_as_faq_in_parent_topic:${entry?.parent_topic || candidate.parent_topic || "needs_parent_topic"}`;
  if (decision === "comparison_table") return `map_as_comparison_table_row:${entry?.parent_topic || candidate.parent_topic || "needs_parent_topic"}`;
  if (decision === "gap_resolution") return "resolve_source_sme_example_or_pov_gap_before_packet";
  if (decision === "merge") return "merge_into_stronger_existing_topic";
  if (decision === "retire") return "retire_or_remove_from_active_plan";
  return "park_until_stronger_authority_or_demand_signal";
}

function rolesForDecision(decision) {
  if (decision === "post" || decision === "refresh") return FULL_LIFECYCLE_ROLES;
  if (decision === "gap_resolution") return GAP_RESOLUTION_ROLES;
  if (decision === "h2" || decision === "faq" || decision === "comparison_table") return SECTION_ROLES;
  return MONITOR_ROLES;
}

function sourceIsReady(value) {
  return normalizeText(value).replace(/\s+/g, "_") === "ready";
}

function applyPacketIntakeGate(candidate, queryContext) {
  const strategicAssetDecision = candidate.asset_decision;
  const reasons = [];
  const required = [];
  const standaloneCandidate = strategicAssetDecision === "post" || strategicAssetDecision === "refresh";

  if (!standaloneCandidate) {
    const status =
      strategicAssetDecision === "gap_resolution"
        ? "gap_resolution_required"
        : strategicAssetDecision === "h2" || strategicAssetDecision === "faq" || strategicAssetDecision === "comparison_table"
          ? "not_standalone_section"
          : "not_packet_candidate";
    return {
      ...candidate,
      strategic_asset_decision: strategicAssetDecision,
      packet_intake_status: status,
      gate_reasons: "",
      required_before_packet: "",
      query_run_status: queryContext.query_run_status,
    };
  }

  if (!candidate.topic_id) {
    reasons.push("missing_topic_id");
    required.push("Map the candidate to topic-map.yaml/topic-coverage.csv before opening a standalone packet.");
  }

  if (!candidate.pillar_id) {
    reasons.push("missing_pillar_id");
    required.push("Map the candidate to a topical authority pillar.");
  }

  if (!sourceIsReady(candidate.source_readiness)) {
    reasons.push(`source_readiness_${candidate.source_readiness || "missing"}`);
    required.push("Source Registry Agent must resolve factual source readiness before draft/generator roles.");
  }

  if (candidate.source_type === "content_decision" && !isApprovedContentDecisionStatus(candidate.content_decision_status)) {
    reasons.push(`content_decision_${normalizeStatus(candidate.content_decision_status) || "missing"}`);
    required.push("Human owner must approve the analytics feedback decision before packet refresh or generation work.");
  }

  if (queryContext.handoff_status && queryContext.handoff_status !== "ready") {
    reasons.push(`query_handoff_${queryContext.handoff_status}`);
    required.push("Query Intelligence Agent must produce a handoff with handoff_status: ready before packet scaffolding.");
  }

  if (!reasons.length) {
    return {
      ...candidate,
      strategic_asset_decision: strategicAssetDecision,
      packet_intake_status: "intake_ready",
      gate_reasons: "",
      required_before_packet: "",
      query_run_status: queryContext.query_run_status,
    };
  }

  return {
    ...candidate,
    strategic_asset_decision: strategicAssetDecision,
    asset_decision: "gap_resolution",
    recommended_asset: "monitor_only",
    packet_intake_status: "blocked_before_packet",
    gate_reasons: Array.from(new Set(reasons)).join(" | "),
    required_before_packet: Array.from(new Set(required)).join(" | "),
    query_run_status: queryContext.query_run_status,
    recommended_subagents: rolesForDecision("gap_resolution").join(" | "),
    next_action: `resolve_packet_intake_gate:${Array.from(new Set(reasons)).join(",")}`,
  };
}

function enrichCandidate(candidate, authority, queryContext) {
  const entry = findAuthority(candidate, authority);
  const authorityScore = scoreForAuthority(entry);
  const score = authorityScore ?? fallbackScore(candidate);
  const decision = decisionFromPerformanceFeedback(candidate, assetDecision(candidate, entry, score));
  const scoreSource = authorityScore === null ? "heuristic" : scoreSourceFor(entry);

  return applyPacketIntakeGate({
    ...candidate,
    topic_id: firstValue(candidate.topic_id, entry?.topic_id),
    pillar_id: firstValue(candidate.pillar_id, entry?.pillar_id),
    parent_topic: firstValue(candidate.parent_topic, entry?.parent_topic),
    canonical_topic: firstValue(entry?.title, entry?.primary_query, candidate.topic),
    aeo_question: firstValue(entry?.aeo_question, candidate.aeo_question),
    topic_score_guess: Math.round(score),
    topic_score_source: scoreSource,
    score_band: scoreBand(score),
    asset_decision: decision,
    recommended_asset: legacyRecommendedAsset(decision),
    topic_decision: topicDecision(entry, score),
    coverage_status: firstValue(entry?.status),
    coverage_role: firstValue(entry?.coverage_role),
    source_readiness: firstValue(entry?.source_readiness, "unknown"),
    authority_match: entry ? `${scoreSource}:${entry.match_basis || "topic_id"}` : "heuristic:no_topic_authority_match",
    recommended_subagents: rolesForDecision(decision).join(" | "),
    next_action: nextActionFor(candidate, entry, decision),
  }, queryContext);
}

function contentDecisionTopic(row) {
  const slug = String(row.slug || "").trim();
  if (slug) return slug;
  const pageUrl = String(row.page_url || "").replace(/\/$/, "");
  const urlSlug = pageUrl.split("/").filter(Boolean).at(-1);
  return urlSlug || String(row.reason || row.recommended_action || "").trim();
}

function readContentDecisionCandidates(root, runDate) {
  const { rows } = readCsv(path.join(root, "analytics", "content_decisions.csv"));
  return rows
    .filter((row) => ACTIVE_CONTENT_DECISION_STATUSES.has(normalizeStatus(row.status)))
    .filter((row) => isOpenContentDecisionOutcome(row.outcome))
    .filter((row) => contentDecisionHasDecisionGradeEvidence(row))
    .filter((row) => ACTIONABLE_CONTENT_DECISIONS.has(normalizeStatus(row.decision)))
    .map((row, index) => {
      const decision = normalizeStatus(row.decision);
      const status = normalizeStatus(row.status);
      const decisionId = stableCandidateId(row, index);
      return {
        date: runDate,
        candidate_id: decisionId,
        topic: contentDecisionTopic(row),
        intent: decision === "expand" ? "how_to" : decision === "investigate" ? "measurement" : decision,
        source_signal: `content_decision:${row.decision_id || decisionId}:${status}:${decision}:health:${row.content_health_score || ""}:refresh:${row.refresh_priority_score || ""}`,
        aeo_question: "",
        source_type: "content_decision",
        content_decision: decision,
        content_decision_status: status,
        evidence_use: "performance_feedback",
        next_action: `route_performance_feedback:${decision}:${row.recommended_action || "review evidence"}`,
        recommended_action: row.recommended_action,
        content_decision_id: row.decision_id || "",
        content_decision_first_seen_date: row.first_seen_date || "",
        content_decision_last_seen_date: row.last_seen_date || row.decision_date || "",
        content_decision_evidence_signature: row.evidence_signature || "",
        content_decision_supersedes: row.supersedes_decision_id || "",
        content_decision_outcome: row.outcome || "",
      };
    });
}

function run() {
  const root = process.cwd();
  const runDate = process.argv.includes("--date") ? process.argv[process.argv.indexOf("--date") + 1] : today();
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const candidates = [];
  const authority = mergeAuthorityRows(root);
  const queryContext = latestQueryContext(root, runDate);

  const trendCandidates = latestFile(root, "research/trend-intelligence", "topic-candidates.csv");
  if (trendCandidates) {
    const { rows } = parseCsv(fs.readFileSync(trendCandidates, "utf8"));
    for (const [index, row] of rows.entries()) {
      candidates.push({
        date: runDate,
        candidate_id: `trend-${String(index + 1).padStart(3, "0")}`,
        topic: row.topic,
        intent: row.intent,
        source_signal: `trend_discovery:${row.source_count || 0}:max_score:${row.max_score || 0}`,
        source_count: row.source_count,
        max_score: row.max_score,
        evidence_use: "discovery_only",
        next_action: "cluster_with_query_and_source_data_before_packet",
      });
    }
  }

  const queryFile = latestFile(root, "research/query-intelligence", "normalized-queries.csv");
  if (queryFile) {
    const { rows } = parseCsv(fs.readFileSync(queryFile, "utf8"));
    for (const [index, row] of rows.slice(0, 50).entries()) {
      candidates.push({
        date: runDate,
        candidate_id: `query-${String(index + 1).padStart(3, "0")}`,
        topic: row.normalized_query || row.query,
        intent: row.intent || "unknown",
        source_signal: `${row.source_type || "query"}:${row.volume || ""}`,
        topic_id: row.topic_id,
        pillar_id: row.pillar_id,
        aeo_question: /\?$/.test(String(row.query || "")) ? row.query : "",
        source_type: "query",
        volume: row.volume,
        evidence_use: "discovery_only",
        next_action: "score_against_topic_map_before_packet",
      });
    }
  }

  candidates.push(...readContentDecisionCandidates(root, runDate));

  const deduped = Array.from(
    new Map(
      candidates
        .filter((row) => row.topic)
        .map((row) => enrichCandidate(row, authority, queryContext))
        .map((row) => [row.topic_id || normalizeText(row.topic), row])
    ).values()
  ).sort((a, b) => {
    const scoreDiff = Number(b.topic_score_guess) - Number(a.topic_score_guess);
    if (scoreDiff) return scoreDiff;
    const priority = { post: 0, refresh: 1, gap_resolution: 2, h2: 3, faq: 4, comparison_table: 5, park: 6, merge: 7, retire: 8 };
    return (priority[a.asset_decision] ?? 99) - (priority[b.asset_decision] ?? 99);
  });

  writeCsvAtomic(path.join(outputDir, "topic-candidates.csv"), OUTPUT_HEADERS, deduped);
  fs.writeFileSync(
    path.join(outputDir, "subagent-assignments.md"),
    `# Daily Content Subagent Assignments\n\nRun date: ${runDate}\n\n## Rule\n\nNo single agent owns a whole blog post. The planner uses \`topic-coverage.csv\` first, then \`topic-map.yaml\`, then a heuristic only when no authority score exists. Score bands map to explicit post, refresh, H2, FAQ, comparison table, gap-resolution, or park decisions.\n\n## Candidate Assignments\n\n${deduped
      .slice(0, 20)
      .map(
        (row) =>
          `- ${row.candidate_id}: ${row.topic} (${row.intent}) -> ${row.asset_decision}; score ${row.topic_score_guess} from ${row.topic_score_source}; next: ${row.next_action}; roles: ${row.recommended_subagents}`
      )
      .join("\n") || "- No candidates available. Run query/trend discovery first."}\n`
  );

  console.log(JSON.stringify({ ok: true, outputDir, candidates: deduped.length }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
