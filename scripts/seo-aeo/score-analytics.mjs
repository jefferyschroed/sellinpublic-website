#!/usr/bin/env node
import path from "node:path";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import {
  contentHealthScore,
  groupRowsByPageEvidence,
  pageDecisionEvidence,
  pageEvidenceKey,
  refreshPriorityScore,
  shouldScorePageRow,
} from "./lib/scoring.mjs";

const SCORE_HEADERS = [
  "content_health_score",
  "refresh_priority_score",
  "decision_evidence_status",
  "decision_evidence_row_count",
  "decision_evidence_date_count",
  "decision_evidence_required_date_count",
  "decision_evidence_included",
  "decision_evidence_reason",
];

function fillScore(row, field, scorer) {
  if (row[field]) return row[field];
  if (!shouldScorePageRow(row)) return "";
  return scorer(row);
}

function scoreEvidence(row, rowsByPage) {
  const pageRows = rowsByPage.get(pageEvidenceKey(row)) || [row];
  const evidence = pageDecisionEvidence(pageRows);
  const included = evidence.rows.includes(row) ? "yes" : "no";
  if (!shouldScorePageRow(row)) {
    return {
      decision_evidence_status: "not_scored",
      decision_evidence_row_count: String(evidence.row_count || 0),
      decision_evidence_date_count: String(evidence.date_count || 0),
      decision_evidence_required_date_count: String(evidence.required_date_count || 0),
      decision_evidence_included: included,
      decision_evidence_reason: "row is missing page identity, provenance, or signal fields",
    };
  }
  if (evidence.ok) {
    return {
      decision_evidence_status: "decision_grade",
      decision_evidence_row_count: String(evidence.row_count),
      decision_evidence_date_count: String(evidence.date_count),
      decision_evidence_required_date_count: String(evidence.required_date_count),
      decision_evidence_included: included,
      decision_evidence_reason: "",
    };
  }
  return {
    decision_evidence_status: "provisional",
    decision_evidence_row_count: String(evidence.row_count),
    decision_evidence_date_count: String(evidence.date_count),
    decision_evidence_required_date_count: String(evidence.required_date_count),
    decision_evidence_included: included,
    decision_evidence_reason: evidence.missing.join("; "),
  };
}

function run() {
  const root = process.cwd();
  const filePath = path.join(root, "analytics", "page_daily.csv");
  const { headers, rows } = readCsv(filePath);
  if (!headers.length) throw new Error("analytics/page_daily.csv is missing.");
  const outputHeaders = Array.from(new Set([...headers, ...SCORE_HEADERS]));
  const rowsByPage = groupRowsByPageEvidence(rows);
  const scored = rows.map((row) => ({
    ...row,
    content_health_score: fillScore(row, "content_health_score", contentHealthScore),
    refresh_priority_score: fillScore(row, "refresh_priority_score", refreshPriorityScore),
    ...scoreEvidence(row, rowsByPage),
  }));
  writeCsvAtomic(filePath, outputHeaders, scored);
  const statusCounts = scored.reduce((counts, row) => {
    const status = row.decision_evidence_status || "missing";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ ok: true, filePath, rows: scored.length, decision_evidence_status_counts: statusCounts }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
