#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlArray(values, indent = "  ") {
  const items = values.filter((value) => String(value || "").trim() !== "");
  if (!items.length) return "[]";
  return `\n${items.map((value) => `${indent}- ${yamlString(value)}`).join("\n")}`;
}

function splitPipe(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function coverageByTopicId(root) {
  const coveragePath = path.join(root, "docs", "seo-aeo", "topic-coverage.csv");
  if (!fs.existsSync(coveragePath)) return new Map();
  const { rows } = parseCsv(fs.readFileSync(coveragePath, "utf8"));
  return new Map(rows.filter((row) => row.topic_id).map((row) => [row.topic_id, row]));
}

function slugForCandidate(candidate, coverageRows) {
  const coverageSlug = coverageRows.get(candidate.topic_id || "")?.slug;
  return slugify(coverageSlug || candidate.slug || candidate.topic);
}

function isPublishedCoverage(candidate) {
  return ["published", "published_draft", "published_draft_ready"].includes(normalizeToken(candidate.coverage_status));
}

function scaffoldableCandidate(candidate) {
  if (candidate.packet_intake_status !== "intake_ready") return false;
  if (candidate.asset_decision !== "post") return false;
  if (isPublishedCoverage(candidate)) return false;
  return true;
}

function currentQueryRun(root, runDate) {
  const queryRoot = path.join(root, "research", "query-intelligence");
  if (!fs.existsSync(queryRoot)) return null;
  const runId = `${runDate}-daily-discovery`;
  const runDir = path.join(queryRoot, runId);
  if (!fs.existsSync(runDir)) return null;
  return {
    run_id: runId,
    run_dir: path.relative(root, runDir).split(path.sep).join("/"),
    brief_handoff_path: path.relative(root, path.join(runDir, "brief-handoff.yaml")).split(path.sep).join("/"),
    source_manifest_path: path.relative(root, path.join(runDir, "source-manifest.json")).split(path.sep).join("/"),
    normalized_queries_path: path.relative(root, path.join(runDir, "normalized-queries.csv")).split(path.sep).join("/"),
    query_clusters_path: path.relative(root, path.join(runDir, "query-clusters.yaml")).split(path.sep).join("/"),
  };
}

function readJsonIfExists(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function requireCurrentCandidateInput(root, input, runDate) {
  const inputPath = path.resolve(root, input);
  const expectedPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  if (inputPath !== expectedPath) {
    throw new Error(
      `Refusing to scaffold from non-current candidate input: ${path.relative(root, inputPath).split(path.sep).join("/")}. Expected ${path.relative(root, expectedPath).split(path.sep).join("/")}.`
    );
  }
}

function requireCurrentReadyQueryRun(root, runDate) {
  const runId = `${runDate}-daily-discovery`;
  const runDir = path.join(root, "research", "query-intelligence", runId);
  const relativeRunDir = path.relative(root, runDir).split(path.sep).join("/");
  if (!fs.existsSync(runDir)) {
    throw new Error(`Refusing to scaffold packets without current ready query intelligence: missing ${relativeRunDir}.`);
  }

  const manifest = readJsonIfExists(root, path.join(relativeRunDir, "source-manifest.json")) || {};
  const handoffPath = path.join(runDir, "brief-handoff.yaml");
  const handoffRunId = readYamlScalar(handoffPath, "run_id");
  if ((manifest.run_id && manifest.run_id !== runId) || (manifest.run_date && manifest.run_date !== runDate) || (handoffRunId && handoffRunId !== runId)) {
    throw new Error(
      `Refusing to scaffold packets from stale query intelligence: expected ${runId}, found manifest ${manifest.run_id || "missing"} (${manifest.run_date || "missing"}) and handoff ${handoffRunId || "missing"}.`
    );
  }

  const result = spawnSync(
    process.execPath,
    ["scripts/seo-aeo/validate-query-intelligence.mjs", relativeRunDir, "--json", "--require-handoff-ready"],
    {
      cwd: root,
      encoding: "utf8",
    }
  );
  if (result.status === 0) return;

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  let detail = output.split("\n")[0] || "validation failed";
  try {
    const report = JSON.parse(output);
    const blockers = (report.items || [])
      .filter((item) => item.severity === "blocker")
      .slice(0, 3)
      .map((item) => `${item.area}:${item.check}:${item.detail}`);
    detail = `${report.status || "failed"} with ${report.counts?.blocker ?? blockers.length} blocker(s)${blockers.length ? `: ${blockers.join(" | ")}` : ""}`;
  } catch {
    // Fall back to the first line above when validator output is not JSON.
  }

  throw new Error(`Refusing to scaffold packets until ${relativeRunDir} validates as handoff_status: ready (${detail}).`);
}

function requireSelectedRowsMatchRunDate(selected, runDate) {
  const staleRows = selected.filter((row) => row.date && row.date !== runDate);
  if (staleRows.length) {
    const labels = staleRows.slice(0, 5).map((row) => `${row.candidate_id || "candidate"}:${row.date}`);
    throw new Error(`Refusing to scaffold candidate rows from a different run date: ${labels.join(", ")}.`);
  }
}

function writeIfMissing(filePath, value) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, value);
  return true;
}

function brief(candidate, packetId, slug, runDate) {
  const title = titleCase(candidate.topic);
  const strategicAsset = candidate.strategic_asset_decision || candidate.asset_decision || candidate.recommended_asset || "post_candidate";
  return `packet_id: "${packetId}"
status: "briefing"
working_title: "${title}"
slug: "${slug}"
owner: "Sell In Public editorial"
reviewers:
  - "Sell In Public editorial"
created_at: "${runDate}"
updated_at: "${runDate}"

audience:
  primary_buyer: "B2B founder or GTM leader"
  secondary_buyers:
    - "Marketing leader"
    - "Sales leader"
    - "Content operator"
  company_context: "B2B software companies building employee-generated content and LinkedIn-led GTM."
  pain: ""

business_goal: "Create a source-backed SEO/AEO article only if topic authority, query intelligence, and source readiness justify a standalone post."
sales_use_case: ""
cta:
  primary:
    label: "Book a Working Session"
    url: "https://calendly.com/jeff-tryquicksetters/30min"
  secondary:
    label: "Review the System"
    url: "https://sellinpublic.co/"
  closing_blog_cta: "Write a varied end CTA with a short heading and an exactly two-sentence body. Sentence 1 should name Sell In Public and describe how we capture team expertise, shape it into LinkedIn posts and buyer signals, and run outbound to the right ICP. Sentence 2 should invite a working session to see whether LinkedIn can become a top revenue channel for the company. Do not add a third sentence that re-explains process management."

search_intent:
  stage: "${candidate.intent || "unknown"}"
  primary_query: "${candidate.topic}"
  aeo_question: "${candidate.aeo_question || ""}"
  primary_keyword: "${candidate.topic}"
  secondary_keywords: []
  related_questions: []

topic_map:
  pillar_id: "${candidate.pillar_id || ""}"
  pillar_name: ""
  topic_id: "${candidate.topic_id || ""}"
  topic_score: ${Math.round(Number(candidate.topic_score_guess || 0))}
  topic_decision: "${candidate.topic_decision || "needs_topic_authority_review"}"
  coverage_role: "${candidate.coverage_role || ""}"
  parent_topic: "${candidate.parent_topic || ""}"
  target_asset: "${strategicAsset}"
  source_readiness: "${candidate.source_readiness || "unknown"}"
  internal_link_targets: []

entity_targets:
  - "${candidate.topic}"
angle: "To be determined by Topic Cartographer and Outline Agent."
sell_in_public_pov: ""
word_count_target: "To be determined"

must_include:
  - "Answer the approved AEO question directly near the top."
must_avoid:
  - "Feature-heavy Sell In Public service language inside the article body."
  - "Unsupported statistics or claims."
  - "Reddit, AI answers, autocomplete, or query exports as factual evidence."

source_requirements:
  min_grade: "B"
  banned_sources:
    - "Reddit/forums as evidence"
    - "AI answers as evidence"
    - "generic listicles"
    - "unsourced stat roundups"
  required_sources: []

packet_intake:
  status: "${candidate.packet_intake_status || "unknown"}"
  intake_artifact: "packet-intake.yaml"
  discovery_exclusions: "discovery-exclusions.json"
  query_run_status: "${candidate.query_run_status || ""}"
  discovery_sources_excluded_from_evidence: true

internal_links:
  - "https://sellinpublic.co/"
  - "https://sellinpublic.co/blog/"
external_research_targets: []

approval:
  strategy_gate: ${candidate.packet_intake_status === "intake_ready" ? "true" : "false"}
  source_gate: false
  outline_gate: false
  qa_gate: false
  publish_gate: false
`;
}

function workOrder(candidate, packetId) {
  return `# Subagent Work Order

Packet: \`${packetId}\`

Candidate: ${candidate.topic}

Evidence use: ${candidate.evidence_use}

Packet intake status: ${candidate.packet_intake_status || "unknown"}

Gate reasons: ${candidate.gate_reasons || "none"}

Required before packet: ${candidate.required_before_packet || "none"}

## Intake Snapshot

- Packet intake: \`packet-intake.yaml\`
- Discovery exclusions: \`discovery-exclusions.json\`
- Strategic asset decision: ${candidate.strategic_asset_decision || candidate.asset_decision || ""}
- Scaffold asset decision: ${candidate.asset_decision || ""}
- Current gate status: \`${candidate.packet_intake_status || "unknown"}\`

## Evidence Boundary

Discovery inputs are visible for topic language, H2/FAQ direction, and source-gap routing only.

No subagent may add excluded discovery sources to:

- \`citations.json\`
- \`claims-ledger.csv\` \`source_ids\`
- draft citation markers
- \`article.blocks.json\` source references

If discovery suggests a factual claim, Source Registry must find an approved source or record a source gap.

## Agent-Specific Instructions

1. Query Intelligence: use excluded inputs only for query/intent/heading guidance.
2. Source Registry: replace discovery leads with approved factual sources.
3. Research Synthesis: summarize discovery as non-citable context only.
4. Claim Ledger: reject excluded source IDs as support.
5. QA: compare \`citations.json\`, \`claims-ledger.csv\`, \`draft.md\`, and \`article.blocks.json\` against \`discovery-exclusions.json\`.

## Rule

No single subagent owns this whole post. Each subagent writes its artifact only. The integrator merges approved outputs after QA.

## Required Subagents

${String(candidate.recommended_subagents || "")
    .split("|")
    .map((agent) => agent.trim())
    .filter(Boolean)
    .map((agent) => `- ${agent}`)
    .join("\n")}

## First Tasks

1. Topic Cartographer: score against \`docs/seo-aeo/topic-scoring.md\` and update topic map/coverage if approved.
2. Query Intelligence Agent: cluster discovery inputs and write a packet handoff.
3. Source Registry Agent: find approved factual sources or reject the packet for source gaps.
4. Orchestrator: stop packet work if score, source readiness, or SME readiness is too weak.
`;
}

function packetIntake(root, candidate, packetId, slug, runDate, inputPath) {
  const queryRun = currentQueryRun(root, runDate) || {};
  return `schema_version: "1.0"
packet_id: ${yamlString(packetId)}
slug: ${yamlString(slug)}
status: "intake_ready"
created_at: ${yamlString(runDate)}
updated_at: ${yamlString(runDate)}

candidate_source:
  path: ${yamlString(inputPath)}
  candidate_id: ${yamlString(candidate.candidate_id)}
  row_number: ${Number(candidate.row_number || 0)}

candidate:
  topic: ${yamlString(candidate.topic)}
  canonical_topic: ${yamlString(candidate.canonical_topic)}
  intent: ${yamlString(candidate.intent)}
  aeo_question: ${yamlString(candidate.aeo_question)}
  topic_id: ${yamlString(candidate.topic_id)}
  pillar_id: ${yamlString(candidate.pillar_id)}
  parent_topic: ${yamlString(candidate.parent_topic)}
  topic_score_guess: ${Number(candidate.topic_score_guess || 0)}
  topic_score_source: ${yamlString(candidate.topic_score_source)}
  score_band: ${yamlString(candidate.score_band)}
  authority_match: ${yamlString(candidate.authority_match)}
  evidence_use: ${yamlString(candidate.evidence_use || "discovery_only")}

decisions:
  strategic_asset_decision: ${yamlString(candidate.strategic_asset_decision || candidate.asset_decision)}
  scaffold_asset_decision: ${yamlString(candidate.asset_decision)}
  recommended_asset: ${yamlString(candidate.recommended_asset)}
  topic_decision: ${yamlString(candidate.topic_decision)}
  coverage_status: ${yamlString(candidate.coverage_status)}
  coverage_role: ${yamlString(candidate.coverage_role)}
  source_readiness: ${yamlString(candidate.source_readiness)}
  packet_intake_status: ${yamlString(candidate.packet_intake_status)}
  query_run_status: ${yamlString(candidate.query_run_status)}

gates:
  current_gate_reasons: ${yamlArray(splitPipe(candidate.gate_reasons), "    ")}
  current_required_before_packet: ${yamlArray(splitPipe(candidate.required_before_packet), "    ")}
  resolved_gate_history: []

discovery_lineage:
  query_run_id: ${yamlString(queryRun.run_id || "")}
  query_run_dir: ${yamlString(queryRun.run_dir || "")}
  brief_handoff_path: ${yamlString(queryRun.brief_handoff_path || "")}
  source_manifest_path: ${yamlString(queryRun.source_manifest_path || "")}
  normalized_queries_path: ${yamlString(queryRun.normalized_queries_path || "")}
  query_clusters_path: ${yamlString(queryRun.query_clusters_path || "")}
  discovery_exclusions_path: "discovery-exclusions.json"

evidence_boundary:
  discovery_inputs_visible_to_agents: true
  discovery_inputs_citable: false
  citations_must_come_from: "citations.json or approved SME notes only"
`;
}

function discoveryExclusions(root, candidate, packetId, runDate) {
  const queryRun = currentQueryRun(root, runDate) || {};
  const manifest = queryRun.source_manifest_path ? readJsonIfExists(root, queryRun.source_manifest_path) : null;
  const excludedSources = (manifest?.sources || []).map((source) => ({
    source_id: source.source_id || "",
    source_type: source.source_type || "",
    name: source.name || "",
    path: source.path || "",
    evidence_use: source.evidence_use || "discovery_only",
    visible_to_agents: true,
    allowed_uses: ["primary_query", "secondary_query", "related_question", "h2_or_faq_direction", "source_gap"],
    prohibited_uses: [
      "citations_json",
      "claims_ledger_source_ids",
      "factual_claim_support",
      "public_article_quote",
      "statistic_or_benchmark_support",
    ],
    exclusion_reason: "Discovery-only query/source input",
  }));

  return `${JSON.stringify(
    {
      schema_version: "1.0",
      packet_id: packetId,
      generated_at: new Date().toISOString(),
      run_date: runDate,
      rule: "Discovery inputs may shape topic, structure, FAQs, and source gaps, but cannot support factual claims.",
      evidence_policy: "discovery_only_not_factual_evidence",
      source_manifests: queryRun.source_manifest_path ? [queryRun.source_manifest_path] : [],
      excluded_sources: excludedSources,
      excluded_query_ids: [],
      excluded_cluster_ids: [],
      validation_rules: {
        citations_json_must_not_reference_excluded_source_ids: true,
        claims_ledger_must_not_reference_excluded_source_ids: true,
        draft_must_not_use_excluded_source_ids_in_cite_markers: true,
        article_blocks_must_not_reference_excluded_raw_paths: true,
      },
    },
    null,
    2
  )}\n`;
}

function placeholder(name, packetId) {
  if (name.endsWith(".csv")) return "claim_id,claim_text,draft_location,claim_type,support_type,source_ids,confidence,owner,status,notes\n";
  if (name.endsWith(".json")) return name === "citations.json" ? "[]\n" : "{}\n";
  return `# ${name.replace(/[-.]/g, " ")}\n\nPacket: \`${packetId}\`\n\nStatus: not started.\n`;
}

function run() {
  const root = process.cwd();
  const input = arg("--from");
  if (!input) throw new Error("Usage: node scripts/seo-aeo/scaffold-packets.mjs --from research/daily-content-plan/<date>/topic-candidates.csv --limit 3");
  const limit = Number(arg("--limit", "3"));
  const runDate = arg("--date", today());
  requireCurrentCandidateInput(root, input, runDate);
  const { rows } = parseCsv(fs.readFileSync(path.resolve(root, input), "utf8"));
  const coverageRows = coverageByTopicId(root);
  const selected = rows
    .map((row, index) => ({ ...row, row_number: index + 2 }))
    .filter(scaffoldableCandidate)
    .slice(0, limit);
  if (selected.length) {
    requireSelectedRowsMatchRunDate(selected, runDate);
    requireCurrentReadyQueryRun(root, runDate);
  }
  const created = [];

  for (const candidate of selected) {
    const slug = slugForCandidate(candidate, coverageRows);
    const packetId = `${runDate}-${slug}`;
    const packetDir = ensureDir(path.join(root, "content-packets", packetId));
    writeIfMissing(path.join(packetDir, "brief.yaml"), brief(candidate, packetId, slug, runDate));
    writeIfMissing(path.join(packetDir, "packet-intake.yaml"), packetIntake(root, candidate, packetId, slug, runDate, input));
    writeIfMissing(path.join(packetDir, "discovery-exclusions.json"), discoveryExclusions(root, candidate, packetId, runDate));
    writeIfMissing(path.join(packetDir, "subagent-work-order.md"), workOrder(candidate, packetId));
    for (const fileName of [
      "research.md",
      "citations.json",
      "sme-notes.md",
      "outline.md",
      "draft.md",
      "article.blocks.json",
      "claims-ledger.csv",
      "qa-report.md",
      "publish-meta.yaml",
      "distribution-pack.md",
      "performance-log.csv",
      "refresh-notes.md",
      "asset-manifest.json",
    ]) {
      writeIfMissing(path.join(packetDir, fileName), placeholder(fileName, packetId));
    }
    created.push({ packetId, slug, packetDir });
  }

  const skippedIntakeReady = rows
    .filter((row) => row.packet_intake_status === "intake_ready")
    .filter((row) => !scaffoldableCandidate(row))
    .map((row) => ({
      candidate_id: row.candidate_id || "",
      topic: row.topic || "",
      asset_decision: row.asset_decision || "",
      coverage_status: row.coverage_status || "",
      reason: row.asset_decision === "refresh"
        ? "refresh_candidates_update_existing_packets_not_scaffold_new_packets"
        : isPublishedCoverage(row)
          ? "published_coverage_not_scaffolded"
          : "not_new_post_packet",
    }));

  console.log(JSON.stringify({ ok: true, input, limit, selected: selected.length, skipped_intake_ready: skippedIntakeReady, created }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
