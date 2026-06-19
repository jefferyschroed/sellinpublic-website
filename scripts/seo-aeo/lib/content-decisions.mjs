export const ACTIVE_CONTENT_DECISION_STATUSES = new Set(["proposed", "approved", "accepted", "owner_approved"]);
export const CLOSED_CONTENT_DECISION_OUTCOMES = new Set(["completed", "closed", "superseded", "rejected", "no_action", "no-action"]);
export const CLOSED_CONTENT_DECISION_STATUSES = new Set(["completed", "closed", "superseded", "rejected"]);

export const MIN_CONTENT_DECISION_EVIDENCE_ROWS = 2;
export const MIN_CONTENT_DECISION_EVIDENCE_DATES = 2;

export function normalizeDecisionToken(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function contentDecisionHasDecisionGradeEvidence(row) {
  const evidenceStatus = normalizeDecisionToken(row.evidence_status);
  const evidenceRows = Number(row.evidence_row_count || 0);
  const evidenceDates = Number(row.evidence_date_count || 0);
  const requiredDates = Number(row.evidence_required_date_count || MIN_CONTENT_DECISION_EVIDENCE_DATES);
  return (
    evidenceStatus === "decision_grade" &&
    evidenceRows >= MIN_CONTENT_DECISION_EVIDENCE_ROWS &&
    evidenceDates >= MIN_CONTENT_DECISION_EVIDENCE_DATES &&
    requiredDates >= MIN_CONTENT_DECISION_EVIDENCE_DATES &&
    Boolean(String(row.evidence_signature || "").trim())
  );
}

export function isOpenContentDecisionLifecycle(row) {
  const status = normalizeDecisionToken(row.status);
  const outcome = normalizeDecisionToken(row.outcome);
  return !CLOSED_CONTENT_DECISION_STATUSES.has(status) && (!outcome || !CLOSED_CONTENT_DECISION_OUTCOMES.has(outcome));
}

export function isActiveEvidenceBackedContentDecision(row) {
  return (
    ACTIVE_CONTENT_DECISION_STATUSES.has(normalizeDecisionToken(row.status)) &&
    isOpenContentDecisionLifecycle(row) &&
    contentDecisionHasDecisionGradeEvidence(row)
  );
}
