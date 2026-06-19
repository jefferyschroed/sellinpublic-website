#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const HEADERS = [
  "date",
  "candidate_id",
  "topic",
  "current_topic_id",
  "artifact_topic",
  "artifact_topic_id",
  "artifact_identity_status",
  "gap_type",
  "gap_code",
  "owner",
  "status",
  "import_rank",
  "primary_recommended_import",
  "priority_reason",
  "source_path",
  "required_action",
  "notes",
];

const ARTIFACT_PREFIXES = [
  "topic-authority-notes-",
  "query-intelligence-notes-",
  "trend-discovery-notes-",
  "source-gaps-",
  "research-synthesis-",
  "sme-questions-",
  "orchestrator-orchestration-",
];

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

function splitCodes(value) {
  return String(value || "")
    .split(/\s*\|\s*|\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ownerForGap(code, fallback = "orchestrator") {
  const text = String(code || "").toLowerCase();
  if (/query|demand|handoff/.test(text)) return "query_intelligence_agent";
  if (/source|citation|evidence|metric/.test(text)) return "source_registry_agent";
  if (/sme|expert|pov/.test(text)) return "sme_notes_agent";
  if (/topic|coverage|parent|pillar|decision/.test(text)) return "topic_cartographer";
  if (/analytics|performance|traffic|conversion/.test(text)) return "analytics_feedback_agent";
  if (/packet|brief|publish|draft|outline/.test(text)) return "orchestrator";
  return fallback;
}

function normalizeOwner(value, fallback = "orchestrator") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return fallback;
  if (normalized === "query_intelligence_agent") return normalized;
  if (normalized === "source_registry_agent") return normalized;
  if (normalized === "sme_notes_agent") return normalized;
  if (normalized === "topic_cartographer") return normalized;
  if (normalized === "analytics_feedback_agent") return normalized;
  if (normalized === "orchestrator") return normalized;
  return normalized;
}

function addGap(rows, gap) {
  if (!gap.candidate_id || !gap.gap_code) return;
  rows.push({
    date: gap.date || "",
    candidate_id: gap.candidate_id,
    topic: gap.topic || "",
    current_topic_id: gap.current_topic_id || "",
    artifact_topic: gap.artifact_topic || "",
    artifact_topic_id: gap.artifact_topic_id || "",
    artifact_identity_status: gap.artifact_identity_status || "current_candidate",
    gap_type: gap.gap_type || "unknown",
    gap_code: gap.gap_code,
    owner: normalizeOwner(gap.owner || ownerForGap(gap.gap_code)),
    status: gap.status || "open",
    import_rank: gap.import_rank || "",
    primary_recommended_import: gap.primary_recommended_import || "",
    priority_reason: gap.priority_reason || "",
    source_path: gap.source_path || "",
    required_action: gap.required_action || "",
    notes: gap.notes || "",
  });
}

function currentCandidateRows(root, runDate) {
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const { rows: candidates } = readCsv(planPath);
  return { planPath, candidates };
}

function candidateRows(root, runDate, rows, plan) {
  const planPath = plan.planPath;
  const candidates = plan.candidates;
  for (const candidate of candidates) {
    const sourcePath = fs.existsSync(planPath) ? relative(root, planPath) : "";
    if (candidate.packet_intake_status && candidate.packet_intake_status !== "intake_ready") {
      addGap(rows, {
        date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        current_topic_id: candidate.topic_id,
        gap_type: "packet_intake",
        gap_code: candidate.packet_intake_status,
        owner: "orchestrator",
        source_path: sourcePath,
        required_action: candidate.next_action,
        notes: candidate.required_before_packet,
      });
    }

    for (const code of splitCodes(candidate.gate_reasons)) {
      addGap(rows, {
        date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        current_topic_id: candidate.topic_id,
        gap_type: "gate_reason",
        gap_code: code,
        owner: ownerForGap(code),
        source_path: sourcePath,
        required_action: candidate.required_before_packet || candidate.next_action,
        notes: candidate.next_action,
      });
    }

    if (candidate.query_run_status && candidate.query_run_status !== "handoff_ready") {
      addGap(rows, {
        date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        current_topic_id: candidate.topic_id,
        gap_type: "query_handoff",
        gap_code: candidate.query_run_status,
        owner: "query_intelligence_agent",
        source_path: sourcePath,
        required_action: "Produce a current validated query handoff before packet intake.",
        notes: "Discovery-only query status does not unlock drafting or generation.",
      });
    }

    if (candidate.source_readiness && !["ready", "not_applicable"].includes(candidate.source_readiness)) {
      addGap(rows, {
        date: runDate,
        candidate_id: candidate.candidate_id,
        topic: candidate.topic,
        current_topic_id: candidate.topic_id,
        gap_type: "source_readiness",
        gap_code: `source_readiness_${candidate.source_readiness}`,
        owner: "source_registry_agent",
        source_path: sourcePath,
        required_action: "Resolve source readiness before packet intake or claim work.",
        notes: candidate.source_readiness,
      });
    }
  }
}

function demandImportRows(root, runDate, rows) {
  const jsonPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-worklist.json");
  const worklist = readJson(jsonPath, {});
  for (const item of worklist.rows || []) {
    addGap(rows, {
      date: runDate,
      candidate_id: item.candidate_id,
      topic: item.topic,
      gap_type: "validated_demand_import",
      gap_code: item.recommended_import_type,
      owner: item.owner || "query_intelligence_agent",
      status: item.status || "requested",
      import_rank: item.import_rank,
      primary_recommended_import: item.primary_recommended_import,
      priority_reason: item.priority_reason,
      source_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
      required_action: `Place reviewed export at ${item.destination_path}`,
      notes: item.notes,
    });
  }
}

function artifactCandidateId(fileName) {
  for (const prefix of ARTIFACT_PREFIXES) {
    if (fileName.startsWith(prefix)) return fileName.slice(prefix.length).replace(/\.md$/, "");
  }
  return "";
}

function matchingLine(source, pattern) {
  return source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => pattern.test(line));
}

function markdownField(source, label) {
  const pattern = new RegExp(`^${label}:\\s*(.+?)\\s*$`, "im");
  const match = source.match(pattern);
  if (!match) return "";
  return String(match[1] || "")
    .replace(/\s{2,}$/g, "")
    .replace(/^`|`$/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[`"']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artifactIdentity(source, candidateId, candidatesById) {
  const candidate = candidatesById.get(candidateId);
  const artifactTopic = markdownField(source, "Topic");
  const artifactTopicId = markdownField(source, "Topic ID");
  if (!candidate) {
    return {
      candidate,
      artifactTopic,
      artifactTopicId,
      status: "stale_artifact_candidate_missing",
      blocker: "stale_artifact_candidate_missing",
    };
  }

  const topicIdMismatch =
    artifactTopicId &&
    candidate.topic_id &&
    normalizeIdentity(artifactTopicId) !== normalizeIdentity(candidate.topic_id);
  const topicMismatch =
    artifactTopic &&
    candidate.topic &&
    normalizeIdentity(artifactTopic) !== normalizeIdentity(candidate.topic);
  if (topicIdMismatch || topicMismatch) {
    return {
      candidate,
      artifactTopic,
      artifactTopicId,
      status: "stale_artifact_identity_mismatch",
      blocker: "artifact_identity_mismatch",
    };
  }

  return {
    candidate,
    artifactTopic,
    artifactTopicId,
    status: artifactTopic || artifactTopicId ? "active_candidate_artifact" : "active_candidate_metadata_missing",
    blocker: "",
  };
}

function artifactRows(root, runDate, rows, candidatesById) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".md") && ARTIFACT_PREFIXES.some((prefix) => fileName.startsWith(prefix)))
    .sort();

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    const source = fs.readFileSync(filePath, "utf8");
    const candidateId = artifactCandidateId(fileName);
    const sourcePath = relative(root, filePath);
    const identity = artifactIdentity(source, candidateId, candidatesById);
    const identityFields = {
      topic: identity.candidate?.topic || "",
      current_topic_id: identity.candidate?.topic_id || "",
      artifact_topic: identity.artifactTopic,
      artifact_topic_id: identity.artifactTopicId,
      artifact_identity_status: identity.status,
    };

    if (identity.blocker) {
      addGap(rows, {
        date: runDate,
        candidate_id: candidateId,
        ...identityFields,
        gap_type: "artifact_lineage",
        gap_code: identity.blocker,
        owner: "orchestrator",
        status: "stale_artifact",
        source_path: sourcePath,
        required_action: "Do not route this artifact as an active blocker until its candidate/topic lineage is reconciled.",
        notes: `artifact_topic=${identity.artifactTopic || "missing"}; artifact_topic_id=${identity.artifactTopicId || "missing"}; current_topic=${identity.candidate?.topic || "missing"}; current_topic_id=${identity.candidate?.topic_id || "missing"}`,
      });
      continue;
    }

    const checks = [
      {
        type: "query_handoff",
        code: "query_handoff_draft",
        owner: "query_intelligence_agent",
        pattern: /query[_ -]handoff.*draft|query_handoff_draft/i,
        action: "Produce a current query handoff with handoff_status: ready.",
      },
      {
        type: "validated_demand",
        code: "validated_demand_not_validated",
        owner: "query_intelligence_agent",
        pattern: /validated[_ -]demand.*not[_ -]validated|not enough validated demand/i,
        action: "Add an approved validated-demand import or wait for finalized GSC/Bing/Trends data.",
      },
      {
        type: "source_readiness",
        code: "source_readiness_blocked",
        owner: "source_registry_agent",
        pattern: /source readiness remains [`'"]?blocked|source_readiness.*blocked/i,
        action: "Resolve approved source coverage before packet intake.",
      },
      {
        type: "source_readiness",
        code: "source_readiness_needs_source_refresh",
        owner: "source_registry_agent",
        pattern: /source_readiness_needs_source_refresh/i,
        action: "Refresh and approve source registry coverage.",
      },
      {
        type: "source_readiness",
        code: "source_readiness_needs_metric_sources",
        owner: "source_registry_agent",
        pattern: /source_readiness_needs_metric_sources/i,
        action: "Add approved measurement and metric sources.",
      },
      {
        type: "source_readiness",
        code: "source_readiness_partial",
        owner: "source_registry_agent",
        pattern: /source_readiness_partial|source readiness.*partial/i,
        action: "Close source gaps or downgrade the asset scope.",
      },
      {
        type: "sme",
        code: "sme_notes_needed",
        owner: "sme_notes_agent",
        pattern: /SME Notes have not|SME input|needs SME|SME.*needed/i,
        action: "Capture approved SME notes before outline or draft work.",
      },
      {
        type: "packet",
        code: "packet_folder_missing",
        owner: "orchestrator",
        pattern: /No packet folder exists|Candidate packet path is missing/i,
        action: "Do not scaffold a packet until intake gates are ready.",
      },
      {
        type: "topic_authority",
        code: "topic_decision_log_missing",
        owner: "topic_cartographer",
        pattern: /topic-decisions\.md does not yet mirror|decision-log mismatch/i,
        action: "Add or approve a topic decision record before packet opening.",
      },
    ];

    for (const check of checks) {
      const line = matchingLine(source, check.pattern);
      if (!line) continue;
      addGap(rows, {
        date: runDate,
        candidate_id: candidateId,
        ...identityFields,
        gap_type: check.type,
        gap_code: check.code,
        owner: check.owner,
        source_path: sourcePath,
        required_action: check.action,
        notes: line,
      });
    }
  }
}

function dedupe(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = [
      row.candidate_id,
      row.gap_type,
      row.gap_code,
      row.source_path,
      row.required_action,
    ].join("\u0001");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] || "missing";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function writeMarkdown(filePath, report) {
  const grouped = new Map();
  for (const row of report.rows) {
    if (!grouped.has(row.candidate_id)) grouped.set(row.candidate_id, []);
    grouped.get(row.candidate_id).push(row);
  }

  const sections = Array.from(grouped.entries())
    .map(([candidateId, items]) => {
      const lines = items
        .map(
          (item) => {
            const rank = item.import_rank ? ` rank ${item.import_rank}${item.primary_recommended_import === "yes" ? " primary" : ""}` : "";
            const reason = item.priority_reason ? ` ${item.priority_reason}` : "";
            return `- ${item.gap_type}/${item.gap_code}${rank} (${item.owner}, ${item.status}) from \`${item.source_path || "unknown"}\`: ${item.required_action || item.notes || "review required"}${reason}`;
          }
        )
        .join("\n");
      return `## ${candidateId}\n\n${lines}\n`;
    })
    .join("\n");

  const markdown = `# SEO/AEO Gap Ledger

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Open gap rows: ${report.row_count}
Active gap rows: ${report.active_row_count}
Stale or lineage rows: ${report.stale_row_count}

## Rule

This ledger aggregates blockers and requested inputs. It does not approve sources, create evidence, unlock packet intake, or authorize drafting, generation, publishing, or distribution.

Rows from stale or mismatched artifacts are lineage warnings only. Treat \`topic-candidates.csv\` as the current source of truth and reconcile candidate/topic identity before routing subagents from artifact-derived blockers.

## By Owner

${Object.entries(report.by_owner)
  .map(([owner, count]) => `- ${owner}: ${count}`)
  .join("\n") || "- None"}

${sections || "No open gaps found."}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const rows = [];
  const plan = currentCandidateRows(root, runDate);
  const candidatesById = new Map(plan.candidates.filter((candidate) => candidate.candidate_id).map((candidate) => [candidate.candidate_id, candidate]));

  candidateRows(root, runDate, rows, plan);
  demandImportRows(root, runDate, rows);
  artifactRows(root, runDate, rows, candidatesById);

  const finalRows = dedupe(rows).sort((a, b) =>
    [a.candidate_id, a.gap_type, a.gap_code, a.source_path].join("\u0001").localeCompare(
      [b.candidate_id, b.gap_type, b.gap_code, b.source_path].join("\u0001")
    )
  );
  const csvPath = path.join(outputDir, "gap-ledger.csv");
  const jsonPath = path.join(outputDir, "gap-ledger.json");
  const mdPath = path.join(outputDir, "gap-ledger.md");
  const activeRows = finalRows.filter((row) => !String(row.status || "").includes("stale_artifact"));
  const staleRows = finalRows.filter((row) => String(row.status || "").includes("stale_artifact"));
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    row_count: finalRows.length,
    active_row_count: activeRows.length,
    stale_row_count: staleRows.length,
    by_gap_type: countBy(finalRows, "gap_type"),
    by_owner: countBy(finalRows, "owner"),
    by_status: countBy(finalRows, "status"),
    by_artifact_identity_status: countBy(finalRows, "artifact_identity_status"),
    active_by_owner: countBy(activeRows, "owner"),
    stale_by_artifact_identity_status: countBy(staleRows, "artifact_identity_status"),
    rows: finalRows,
  };

  writeCsvAtomic(csvPath, HEADERS, finalRows);
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        row_count: finalRows.length,
        active_row_count: activeRows.length,
        stale_row_count: staleRows.length,
        csv_path: relative(root, csvPath),
        json_path: relative(root, jsonPath),
        markdown_path: relative(root, mdPath),
        by_owner: report.by_owner,
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
