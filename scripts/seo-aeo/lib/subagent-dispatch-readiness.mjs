import fs from "node:fs";
import path from "node:path";

const GENERATOR_QA_DECISIONS = new Set(["approved", "approved_with_notes"]);
const PUBLISH_QA_DECISIONS = new Set(["ready_to_publish", "ready_after_minor_fix"]);
const CONTENT_MOVEMENT_PHASES = new Set([
  "05_outline",
  "06_draft",
  "07_claim_ledger",
  "07_outline",
  "08_metadata_schema",
  "08_draft",
  "09_claim_ledger",
  "09_section_qa",
  "10_metadata_schema",
  "11_asset",
  "12_packet_qa",
  "13_blog_generator",
  "14_index_feed",
  "15_publish_qa",
  "16_distribution",
  "17_analytics_feedback",
]);

const STOP_PROPAGATING_PHASE_PATTERN =
  /(?:^|_)(outline|draft|claim_ledger|metadata_schema|asset|section_qa|packet_qa|blog_generator|index_feed|publish_qa|distribution|analytics_feedback)$/;

function readArtifactText(root, task, artifactPathFor) {
  const artifactPath = artifactPathFor(root, task);
  if (!artifactPath) return "";
  const absolute = path.join(root, artifactPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return "";
  return fs.readFileSync(absolute, "utf8");
}

function normalizedField(text, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp("^" + escaped + ":[ \\t]*`?([^`\\r\\n]+)`?", "im"));
  return String(match?.[1] || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fieldIsFalse(text, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*:\\s*(false|no)\\s*$`, "im").test(text);
}

function hasStopSignal(text) {
  const decision = normalizedField(text, "Decision");
  if (["rejected", "blocked", "not_ready"].includes(decision)) return true;

  const status = normalizedField(text, "Status");
  if (/(rejected|blocked|stopp?ed|stop|missing|not_ready|hold)/i.test(status)) return true;

  return (
    /^##\s+Stop Conditions Triggered\b/im.test(text) ||
    /^##\s+Blockers\b/im.test(text) ||
    /^No .* (authorized|approved|produced|created)\b/im.test(text)
  );
}

function qaAllowsGenerator(text) {
  const decision = normalizedField(text, "Decision");
  if (!GENERATOR_QA_DECISIONS.has(decision)) return false;
  if (fieldIsFalse(text, "ready_for_generator")) return false;
  return !hasStopSignal(text);
}

function publishQaAllowsDistribution(text) {
  const decision = normalizedField(text, "Decision");
  return PUBLISH_QA_DECISIONS.has(decision) && !hasStopSignal(text);
}

export function dependencyReadiness(root, dependency, dependent, { artifactPathFor, isComplete }) {
  if (!dependency) {
    return { ready: false, reason: "missing_dependency_task" };
  }

  if (!isComplete(dependency)) {
    return { ready: false, reason: "dependency_artifact_missing" };
  }

  const phase = String(dependent.phase || "");
  const requiresPositiveDependency = CONTENT_MOVEMENT_PHASES.has(phase) || STOP_PROPAGATING_PHASE_PATTERN.test(phase);

  if (!requiresPositiveDependency) {
    return { ready: true, reason: "artifact_present" };
  }

  const text = readArtifactText(root, dependency, artifactPathFor);
  if (!text.trim()) {
    return { ready: false, reason: "dependency_artifact_unreadable" };
  }

  if (dependent.phase === "13_blog_generator") {
    return qaAllowsGenerator(text)
      ? { ready: true, reason: "qa_approved_for_generator" }
      : { ready: false, reason: "qa_not_approved_for_generator" };
  }

  if (dependent.phase === "16_distribution") {
    return publishQaAllowsDistribution(text)
      ? { ready: true, reason: "publish_qa_ready_for_distribution" }
      : { ready: false, reason: "publish_qa_not_ready_for_distribution" };
  }

  if (hasStopSignal(text)) {
    return { ready: false, reason: "dependency_stop_or_rejection_artifact" };
  }

  return { ready: true, reason: "dependency_positive_or_nonblocking_artifact" };
}
