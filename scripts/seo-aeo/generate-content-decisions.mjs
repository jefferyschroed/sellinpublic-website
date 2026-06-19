#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";
import {
  MIN_DECISION_EVIDENCE_DATES,
  MIN_DECISION_EVIDENCE_ROWS,
  contentHealthScore,
  groupRowsByPageEvidence,
  isPresent,
  number,
  pageCanonicalIdentity,
  pageDecisionEvidence,
  pageDecisionUrl,
  pageFeedbackRollup,
  refreshPriorityScore,
} from "./lib/scoring.mjs";

const HEADERS = [
  "decision_date",
  "slug",
  "page_url",
  "decision",
  "status",
  "decision_owner",
  "evidence_window_start",
  "evidence_window_end",
  "source_export_ids",
  "reviewed_by",
  "evidence_status",
  "evidence_row_count",
  "evidence_date_count",
  "evidence_required_date_count",
  "content_health_score",
  "refresh_priority_score",
  "primary_signal",
  "secondary_signal",
  "reason",
  "recommended_action",
  "due_date",
  "completed_date",
  "notes",
  "decision_id",
  "first_seen_date",
  "last_seen_date",
  "evidence_signature",
  "supersedes_decision_id",
  "packet_path",
  "refresh_notes_path",
  "outcome",
  "outcome_date",
];

const HUMAN_CONTROLLED_FIELDS = [
  "status",
  "decision_owner",
  "due_date",
  "completed_date",
  "notes",
  "supersedes_decision_id",
  "packet_path",
  "refresh_notes_path",
  "outcome",
  "outcome_date",
];

const STATUS_RANKS = new Map([
  ["", 0],
  ["proposed", 10],
  ["pending", 20],
  ["in_review", 30],
  ["evidence_changed_needs_review", 45],
  ["approved", 50],
  ["accepted", 55],
  ["owner_approved", 60],
  ["approved_with_notes", 60],
  ["rejected", 70],
  ["superseded", 80],
  ["completed", 90],
]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function stableHash(value, length = 16) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function firstPresent(...values) {
  return values.find(isPresent) ?? "";
}

function isoDates(...values) {
  return values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))).map(String);
}

function earliestDate(...values) {
  return isoDates(...values).sort()[0] || "";
}

function latestDate(...values) {
  return isoDates(...values).sort().at(-1) || "";
}

function rowLifecycleDate(row) {
  return latestDate(row.last_seen_date, row.decision_date, row.first_seen_date);
}

function statusRank(value) {
  const normalized = normalizeToken(value);
  return STATUS_RANKS.get(normalized) ?? (normalized ? 40 : 0);
}

function needsEvidenceChangeReview(value) {
  return new Set(["pending", "in_review", "approved", "accepted", "owner_approved", "approved_with_notes"]).has(normalizeToken(value));
}

function appendNote(existing, addition) {
  const current = String(existing || "").trim();
  if (!addition) return current;
  if (current.includes(addition)) return current;
  return current ? `${current} ${addition}` : addition;
}

function preferredHumanRow(rows) {
  return [...rows].sort((a, b) => {
    const statusCompare = statusRank(b.status) - statusRank(a.status);
    if (statusCompare !== 0) return statusCompare;
    return rowLifecycleDate(b).localeCompare(rowLifecycleDate(a));
  })[0] || {};
}

function pageAliases(row) {
  const aliases = new Set();
  const canonical = pageCanonicalIdentity(row);
  if (canonical) aliases.add(`url:${canonical}`);

  const slug = String(row.slug || "").trim().toLowerCase();
  if (slug) aliases.add(`slug:${slug}`);

  return Array.from(aliases);
}

function lifecycleAliases(row) {
  const decision = normalizeToken(row.decision);
  if (!decision) return [];
  return pageAliases(row).map((alias) => `${alias}|decision:${decision}`);
}

function primaryLifecycleKey(row) {
  return lifecycleAliases(row)[0] || "";
}

function decisionIdFor(row) {
  const key = primaryLifecycleKey(row);
  return key ? `cd_${stableHash(key)}` : "";
}

function evidenceSignatureFor({ evidence, scoredRow, derived }) {
  return `sha256:${stableHash(
    JSON.stringify({
      page_aliases: pageAliases(scoredRow),
      decision: derived.decision,
      evidence_window_start: evidence.window_start,
      evidence_window_end: evidence.window_end,
      source_export_ids: evidence.source_refs,
      reviewed_by: evidence.reviewers,
      evidence_status: "decision_grade",
      evidence_row_count: evidence.row_count,
      evidence_date_count: evidence.date_count,
      evidence_required_date_count: evidence.required_date_count,
      row_count: evidence.row_count,
      date_count: evidence.date_count,
      content_health_score: scoredRow.content_health_score || "",
      refresh_priority_score: scoredRow.refresh_priority_score || "",
      primary_signal: derived.primary_signal,
      secondary_signal: scoredRow.notes || "",
    }),
    24
  )}`;
}

function withLifecycleDefaults(row, runDate) {
  const decisionId = row.decision_id || decisionIdFor(row);
  const firstSeenDate = firstPresent(row.first_seen_date, row.decision_date, row.last_seen_date, runDate);
  const lastSeenDate = firstPresent(row.last_seen_date, row.decision_date, row.first_seen_date, runDate);
  return {
    ...row,
    decision_id: decisionId,
    first_seen_date: firstSeenDate,
    last_seen_date: lastSeenDate,
    evidence_signature: row.evidence_signature || "",
    supersedes_decision_id: row.supersedes_decision_id || "",
    packet_path: row.packet_path || "",
    refresh_notes_path: row.refresh_notes_path || "",
    outcome: row.outcome || "",
    outcome_date: row.outcome_date || "",
  };
}

function mergeExistingDuplicate(left, right) {
  const newer = rowLifecycleDate(left).localeCompare(rowLifecycleDate(right)) >= 0 ? left : right;
  const older = newer === left ? right : left;
  const human = preferredHumanRow([left, right]);
  const merged = {
    ...older,
    ...newer,
    decision_id: firstPresent(left.decision_id, right.decision_id),
    first_seen_date: earliestDate(left.first_seen_date, left.decision_date, right.first_seen_date, right.decision_date),
    last_seen_date: latestDate(left.last_seen_date, left.decision_date, right.last_seen_date, right.decision_date),
    decision_date: latestDate(left.decision_date, right.decision_date),
  };

  for (const field of HUMAN_CONTROLLED_FIELDS) {
    merged[field] = firstPresent(human[field], left[field], right[field], merged[field]);
  }

  return merged;
}

function coalesceRows(rows) {
  const byId = new Map();
  const idless = [];

  for (const row of rows) {
    if (!row.decision_id) {
      idless.push(row);
      continue;
    }
    byId.set(row.decision_id, byId.has(row.decision_id) ? mergeExistingDuplicate(byId.get(row.decision_id), row) : row);
  }

  return [...idless, ...byId.values()];
}

function buildIndexes(rows) {
  const byDecisionId = new Map();
  const byLifecycleAlias = new Map();

  rows.forEach((row, index) => {
    if (row.decision_id && !byDecisionId.has(row.decision_id)) byDecisionId.set(row.decision_id, index);
    for (const alias of lifecycleAliases(row)) {
      if (!byLifecycleAlias.has(alias)) byLifecycleAlias.set(alias, index);
    }
  });

  return { byDecisionId, byLifecycleAlias };
}

function matchingRowIndex(row, indexes) {
  if (row.decision_id && indexes.byDecisionId.has(row.decision_id)) return indexes.byDecisionId.get(row.decision_id);
  for (const alias of lifecycleAliases(row)) {
    if (indexes.byLifecycleAlias.has(alias)) return indexes.byLifecycleAlias.get(alias);
  }
  return -1;
}

function sharesPage(left, right) {
  const rightAliases = new Set(pageAliases(right));
  return pageAliases(left).some((alias) => rightAliases.has(alias));
}

function supersededDecisionIdFor(row, rows) {
  const currentDecision = normalizeToken(row.decision);
  return (
    rows
      .filter((candidate) => candidate.decision_id && normalizeToken(candidate.decision) !== currentDecision && sharesPage(candidate, row))
      .sort((a, b) => rowLifecycleDate(a).localeCompare(rowLifecycleDate(b)))
      .at(-1)?.decision_id || ""
  );
}

function mergeIncomingDecision(existing, incoming) {
  const human = preferredHumanRow([existing]);
  const evidenceChanged = Boolean(
    existing.evidence_signature &&
      incoming.evidence_signature &&
      existing.evidence_signature !== incoming.evidence_signature
  );
  const merged = {
    ...existing,
    ...incoming,
    decision_id: firstPresent(existing.decision_id, incoming.decision_id),
    first_seen_date: earliestDate(existing.first_seen_date, existing.decision_date, incoming.first_seen_date, incoming.decision_date),
    last_seen_date: latestDate(existing.last_seen_date, existing.decision_date, incoming.last_seen_date, incoming.decision_date),
    decision_date: incoming.decision_date,
  };

  for (const field of HUMAN_CONTROLLED_FIELDS) {
    merged[field] = firstPresent(human[field], incoming[field], merged[field]);
  }

  if (evidenceChanged && needsEvidenceChangeReview(human.status || existing.status)) {
    const previousStatus = firstPresent(human.status, existing.status);
    merged.status = "evidence_changed_needs_review";
    merged.notes = appendNote(
      merged.notes,
      `Evidence signature changed on ${incoming.decision_date}; previous_status=${previousStatus}; human review required before routing packet work.`
    );
  }

  return merged;
}

function sortDecisionRows(rows) {
  return [...rows].sort((a, b) => {
    const dateCompare = rowLifecycleDate(a).localeCompare(rowLifecycleDate(b));
    if (dateCompare !== 0) return dateCompare;
    const pageCompare = (pageAliases(a)[0] || "").localeCompare(pageAliases(b)[0] || "");
    if (pageCompare !== 0) return pageCompare;
    return String(a.decision_id || "").localeCompare(String(b.decision_id || ""));
  });
}

function mergeDecisionRows(filePath, incomingRows, runDate) {
  const current = readCsv(filePath, HEADERS);
  let rows = coalesceRows(current.rows.map((row) => withLifecycleDefaults(row, runDate)));

  for (const row of incomingRows.map((incoming) => withLifecycleDefaults(incoming, runDate))) {
    let indexes = buildIndexes(rows);
    const matchIndex = matchingRowIndex(row, indexes);
    if (matchIndex >= 0) {
      rows[matchIndex] = mergeIncomingDecision(rows[matchIndex], row);
      continue;
    }

    rows.push({
      ...row,
      supersedes_decision_id: row.supersedes_decision_id || supersededDecisionIdFor(row, rows),
    });
  }

  rows = sortDecisionRows(coalesceRows(rows));
  const mergedHeaders = Array.from(new Set([...current.headers, ...HEADERS, ...rows.flatMap((row) => Object.keys(row))]));
  writeCsvAtomic(filePath, mergedHeaders, rows);
  return { path: filePath, rowsWritten: incomingRows.length, totalRows: rows.length };
}

function scoreValue(row, field, scorer) {
  return isPresent(row[field]) ? row[field] : scorer(row);
}

function decisionFor(row) {
  const hasHealth = isPresent(row.content_health_score);
  const hasRefresh = isPresent(row.refresh_priority_score);
  if (!hasHealth && !hasRefresh) return null;

  const health = number(row.content_health_score);
  const refresh = number(row.refresh_priority_score);
  if (refresh >= 80) {
    return {
      decision: "investigate",
      primary_signal: "refresh_priority_score >= 80",
      reason: "High refresh priority score across reviewed evidence.",
      action: "assign Analytics Feedback and Source Registry agents.",
    };
  }
  if (refresh >= 60) {
    return {
      decision: "refresh",
      primary_signal: "refresh_priority_score >= 60",
      reason: "Refresh score is above monthly review threshold across reviewed evidence.",
      action: "review CTR gap, citation gap, and source staleness.",
    };
  }
  if (health >= 75) {
    return {
      decision: "keep",
      primary_signal: "content_health_score >= 75",
      reason: "Content health score is strong across reviewed evidence.",
      action: "monitor and add internal links where useful.",
    };
  }
  if (health > 0 && health < 45) {
    return {
      decision: "expand",
      primary_signal: "content_health_score < 45",
      reason: "Content health score is weak across reviewed evidence.",
      action: "review missing sections, examples, FAQ, and source gaps.",
    };
  }
  return {
    decision: "monitor",
    primary_signal: "reviewed evidence below action threshold",
    reason: "Reviewed evidence is not strong enough for a material change.",
    action: "continue collecting data.",
  };
}

function latestRow(rows) {
  return [...rows].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).at(-1);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const rows = readCsv(path.join(root, "analytics", "page_daily.csv")).rows;
  const rollup = pageFeedbackRollup(rows);
  const decisions = [];
  const skipped = [];

  for (const pageRows of groupRowsByPageEvidence(rows).values()) {
    const evidence = pageDecisionEvidence(pageRows);
    const row = latestRow(evidence.rows);
    const page = latestRow(pageRows) || {};

    if (!evidence.ok || !row) {
      skipped.push({
        slug: page.slug || "",
        page_url: pageDecisionUrl(page),
        raw_feedback_rows: pageRows.length,
        review_ready_rows: evidence.row_count,
        decision_grade_rows: 0,
        reason: evidence.missing.join("; ") || "no reviewed evidence rows",
      });
      continue;
    }

    const scoredRow = {
      ...row,
      content_health_score: scoreValue(row, "content_health_score", contentHealthScore),
      refresh_priority_score: scoreValue(row, "refresh_priority_score", refreshPriorityScore),
    };
    const derived = decisionFor(scoredRow);
    if (!derived) {
      skipped.push({
        slug: row.slug || "",
        page_url: pageDecisionUrl(row),
        raw_feedback_rows: pageRows.length,
        review_ready_rows: evidence.row_count,
        decision_grade_rows: 0,
        reason: "eligible evidence has no score fields",
      });
      continue;
    }

    decisions.push({
      decision_date: runDate,
      slug: row.slug,
      page_url: pageDecisionUrl(row),
      decision: derived.decision,
      status: "proposed",
      decision_owner: "Analytics Feedback Agent",
      evidence_window_start: evidence.window_start,
      evidence_window_end: evidence.window_end,
      source_export_ids: evidence.source_refs.join(";"),
      reviewed_by: evidence.reviewers.join(";"),
      evidence_status: "decision_grade",
      evidence_row_count: String(evidence.row_count),
      evidence_date_count: String(evidence.date_count),
      evidence_required_date_count: String(evidence.required_date_count),
      content_health_score: isPresent(scoredRow.content_health_score) ? scoredRow.content_health_score : "",
      refresh_priority_score: isPresent(scoredRow.refresh_priority_score) ? scoredRow.refresh_priority_score : "",
      primary_signal: derived.primary_signal,
      secondary_signal: row.notes || "",
      reason: derived.reason,
      recommended_action: derived.action,
      due_date: "",
      completed_date: "",
      notes: `Generated recommendation from ${evidence.row_count} decision-grade reviewed evidence rows across ${evidence.date_count} dates. Human approval required before edits.`,
      decision_id: decisionIdFor({ ...scoredRow, decision: derived.decision }),
      first_seen_date: runDate,
      last_seen_date: runDate,
      evidence_signature: evidenceSignatureFor({ evidence, scoredRow: { ...scoredRow, decision: derived.decision }, derived }),
      supersedes_decision_id: "",
      packet_path: "",
      refresh_notes_path: "",
      outcome: "",
      outcome_date: "",
    });
  }

  const outputPath = path.join(root, "analytics", "content_decisions.csv");
  const result = decisions.length
    ? mergeDecisionRows(outputPath, decisions, runDate)
    : { path: outputPath, rowsWritten: 0, totalRows: readCsv(outputPath, HEADERS).rows.length };
  console.log(
    JSON.stringify(
      {
        ok: true,
        proposed: decisions.length,
        skipped: skipped.length,
        raw_page_feedback_rows: rollup.raw_row_count,
        signal_bearing_page_rows: rollup.signal_row_count,
        review_ready_page_rows: rollup.review_ready_row_count,
        decision_grade_page_rows: rollup.decision_grade_row_count,
        decision_grade_pages: rollup.decision_grade_page_count,
        min_decision_evidence_rows: MIN_DECISION_EVIDENCE_ROWS,
        min_decision_evidence_dates: MIN_DECISION_EVIDENCE_DATES,
        skipped_examples: skipped.slice(0, 5),
        ...result,
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
