#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { markdownSubagentStatusLedger, summarizeSubagentStatusLedger } from "./lib/subagent-status-ledger.mjs";

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

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function safeRelativePath(root, value) {
  const normalized = normalizePath(value);
  if (!normalized || normalized.includes("|") || normalized.includes("*")) return "";
  const absolute = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) return "";
  return relative(root, absolute);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readQueue(root, runDate) {
  const queuePath = path.join(root, "automation-runs", runDate, "subagent-queue.json");
  const queue = readJson(queuePath, { tasks: [] });
  if (!Array.isArray(queue.tasks)) queue.tasks = [];
  return { queuePath, queue };
}

function readStatus(root, runDate) {
  const statusPath = path.join(root, "automation-runs", runDate, "subagent-status.json");
  const status = readJson(statusPath, { tasks: {} });
  if (!status.tasks || typeof status.tasks !== "object") status.tasks = {};
  return { statusPath, status };
}

function artifactPathFor(root, task) {
  return safeRelativePath(root, task.artifact_path || task.write_scope);
}

function fileText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function statusFor(status, taskId) {
  return status.tasks?.[taskId] || { status: "queued" };
}

function taskCompleted(root, status, task) {
  const ledgerStatus = statusFor(status, task.task_id).status;
  const artifactPath = artifactPathFor(root, task);
  const absolute = artifactPath ? path.join(root, artifactPath) : "";
  const artifactExists = absolute && fs.existsSync(absolute) && fs.statSync(absolute).isFile() && fs.statSync(absolute).size > 0;
  return ledgerStatus === "completed" || artifactExists;
}

function expect(text, pattern, severity, code, detail) {
  const matched = typeof pattern === "string" ? text.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(text);
  if (matched) return null;
  return { severity, code, detail };
}

function roleChecks(task, text) {
  const checks = [];
  const role = task.role || "";
  const ext = path.extname(task.artifact_path || task.write_scope || "");
  const candidateId = String(task.candidate_id || "").trim();

  if (ext === ".md") {
    checks.push(expect(text, /^#\s+/m, "warn", "missing_markdown_title", "Markdown artifact should start with a clear H1 title."));
  }

  if (candidateId) {
    checks.push(expect(text, candidateId, "blocker", "missing_candidate_id", `Artifact must name candidate ${candidateId}.`));
  }

  if (role) {
    const roleToken = role.replace("AEO/SEO", "").replace("Metadata/Schema", "Metadata").split(/\s+/)[0];
    checks.push(expect(text, roleToken, "warn", "missing_role_label", `Artifact should identify the owning role: ${role}.`));
  }

  if (role === "Trend Discovery Agent") {
    checks.push(expect(text, "discovery_only", "blocker", "missing_discovery_only_guardrail", "Trend discovery artifacts must mark discovery-only evidence use."));
    checks.push(expect(text, /recommendation/i, "warn", "missing_recommendation", "Trend discovery artifacts should include a recommendation."));
    checks.push(expect(text, /confidence/i, "warn", "missing_confidence", "Trend discovery artifacts should include confidence and reason."));
    checks.push(expect(text, /handoff/i, "warn", "missing_handoff", "Trend discovery artifacts should include a handoff or gap-routing section."));
  }

  if (role === "Topic Cartographer") {
    checks.push(expect(text, /topic decision|decision/i, "warn", "missing_topic_decision", "Topic authority artifacts should include a topic decision."));
    checks.push(expect(text, /score/i, "warn", "missing_topic_score", "Topic authority artifacts should include a score or score caveat."));
  }

  if (role === "Query Intelligence Agent") {
    checks.push(expect(text, /query|intent/i, "warn", "missing_query_or_intent", "Query intelligence artifacts should include query or intent language."));
    checks.push(expect(text, /handoff|blocked|ready/i, "warn", "missing_handoff_status", "Query intelligence artifacts should state handoff readiness or blockers."));
  }

  if (task.task_type === "validated_demand_import" || task.phase === "demand_import_rank1") {
    checks.push(expect(text, /import_status:\s*(ready_existing_rows|blocked_missing_reviewed_export|blocked_source_unavailable)/i, "blocker", "missing_import_status", "Demand import review artifacts must include a valid import_status."));
    checks.push(expect(text, /handoff_status:\s*(ready|blocked)/i, "blocker", "missing_handoff_status_field", "Demand import review artifacts must include handoff_status: ready or blocked."));
    checks.push(expect(text, /recommended_next_command:/i, "blocker", "missing_recommended_next_command", "Demand import review artifacts must include recommended_next_command."));
    checks.push(expect(text, /readiness_caveat:/i, "warn", "missing_readiness_caveat", "Demand import review artifacts should include the query-handoff readiness caveat."));
  }

  if (role === "Source Registry Agent") {
    checks.push(expect(text, /source|citation/i, "warn", "missing_source_language", "Source registry artifacts should identify source leads or source gaps."));
  }

  if (role === "Research Synthesis Agent") {
    checks.push(expect(text, /synthesis|research|supported|unsupported/i, "warn", "missing_research_synthesis", "Research artifacts should summarize what can and cannot be supported."));
  }

  if (role === "SME Notes Agent") {
    checks.push(expect(text, /sme|expert|approval|question/i, "warn", "missing_sme_language", "SME artifacts should identify expert context, approvals, or questions."));
  }

  if (role === "AEO/SEO QA Agent" || role === "QA Agent") {
    checks.push(expect(text, /decision|approved|rejected|blocker/i, "warn", "missing_qa_decision", "QA artifacts should include a decision or blocker summary."));
  }

  if (role === "Analytics Feedback Agent") {
    checks.push(expect(text, /keep|refresh|expand|merge|retire|investigate|monitor/i, "warn", "missing_feedback_decision", "Analytics feedback artifacts should include a decision recommendation or monitoring caveat."));
  }

  if (role === "Skill Steward Agent") {
    checks.push(expect(text, /skill|sop|learning|candidate|one-off/i, "warn", "missing_skill_steward_decision", "Skill Steward artifacts should name a reusable learning candidate or one-off rejection."));
  }

  return checks.filter(Boolean);
}

function checkArtifact(root, status, task) {
  const artifactPath = artifactPathFor(root, task);
  const absolutePath = artifactPath ? path.join(root, artifactPath) : "";
  const ledger = statusFor(status, task.task_id);
  const ledgerStatus = ledger.status;
  const completed = taskCompleted(root, status, task);
  const issues = [];

  if (!artifactPath) {
    issues.push({ severity: "blocker", code: "invalid_artifact_path", detail: "Artifact path is missing or unsafe." });
    return { task_id: task.task_id, role: task.role, candidate_id: task.candidate_id, artifact_path: task.artifact_path || task.write_scope || "", ledger_status: ledgerStatus, completed, issues };
  }

  if (!fs.existsSync(absolutePath)) {
    if (ledgerStatus === "completed") {
      issues.push({ severity: "blocker", code: "completed_missing_artifact", detail: "Ledger marks task completed but artifact does not exist." });
    }
    return { task_id: task.task_id, role: task.role, candidate_id: task.candidate_id, artifact_path: artifactPath, ledger_status: ledgerStatus, completed, issues };
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size === 0) {
    issues.push({ severity: "blocker", code: "empty_or_non_file_artifact", detail: "Artifact must be a non-empty file." });
    return { task_id: task.task_id, role: task.role, candidate_id: task.candidate_id, artifact_path: artifactPath, ledger_status: ledgerStatus, completed, byte_size: stat.size, issues };
  }

  if (!completed) {
    return { task_id: task.task_id, role: task.role, candidate_id: task.candidate_id, artifact_path: artifactPath, ledger_status: ledgerStatus, completed, byte_size: stat.size, issues };
  }

  if (ledgerStatus === "completed") {
    const outputs = Array.isArray(ledger.output_artifacts) ? ledger.output_artifacts.map((value) => safeRelativePath(root, value)).filter(Boolean) : [];
    if (!outputs.includes(artifactPath)) {
      issues.push({
        severity: "blocker",
        code: "completed_ledger_missing_declared_artifact",
        detail: `Completed ledger output_artifacts must include declared artifact path: ${artifactPath}.`,
      });
    }
    const extraOutputs = outputs.filter((outputPath) => outputPath !== artifactPath);
    if (extraOutputs.length) {
      issues.push({
        severity: "blocker",
        code: "completed_ledger_extra_artifacts",
        detail: `Completed ledger includes artifact(s) outside the task write scope: ${extraOutputs.join(", ")}.`,
      });
    }
  }

  const text = fileText(absolutePath);
  if (text.trim().length < 120) {
    issues.push({ severity: "blocker", code: "artifact_too_thin", detail: "Completed artifact is too short to be a useful role handoff." });
  }

  issues.push(...roleChecks({ ...task, artifact_path: artifactPath }, text));

  return {
    task_id: task.task_id,
    role: task.role,
    candidate_id: task.candidate_id,
    artifact_path: artifactPath,
    ledger_status: ledgerStatus,
    completed,
    byte_size: stat.size,
    issues,
  };
}

function markdownReport(report) {
  const issueRows = report.artifacts
    .flatMap((artifact) => artifact.issues.map((issue) => ({ ...artifact, issue })))
    .sort((a, b) => {
      const order = { blocker: 0, warn: 1 };
      return (order[a.issue.severity] ?? 9) - (order[b.issue.severity] ?? 9);
    });

  const issueLines = issueRows.length
    ? issueRows
        .slice(0, 80)
        .map((row) => `| \`${row.task_id}\` | ${row.issue.severity} | ${row.issue.code} | ${row.issue.detail.replace(/\|/g, "\\|")} |`)
    : ["| None |  |  |  |"];

  return `# Subagent Artifact Check

Run date: ${report.run_date}
Status: ${report.status}

Checked completed artifacts: ${report.summary.completed_artifacts}
Blockers: ${report.summary.blockers}
Warnings: ${report.summary.warnings}

${markdownSubagentStatusLedger(report.status_ledger)}

## Issues

| Task | Severity | Code | Detail |
|---|---|---|---|
${issueLines.join("\n")}
`;
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const { queuePath, queue } = readQueue(root, runDate);
  const { statusPath, status } = readStatus(root, runDate);
  const artifacts = queue.tasks.map((task) => checkArtifact(root, status, task));
  const completedArtifacts = artifacts.filter((artifact) => artifact.completed);
  const blockers = artifacts.flatMap((artifact) => artifact.issues.filter((issue) => issue.severity === "blocker"));
  const warnings = artifacts.flatMap((artifact) => artifact.issues.filter((issue) => issue.severity === "warn"));
  const statusLedger = summarizeSubagentStatusLedger(queue, status);
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: blockers.length ? "blocked" : "passed",
    queue_path: relative(root, queuePath),
    status_path: relative(root, statusPath),
    status_ledger: statusLedger,
    summary: {
      total_tasks: queue.tasks.length,
      completed_artifacts: completedArtifacts.length,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    artifacts: completedArtifacts.filter((artifact) => artifact.issues.length),
  };

  const jsonPath = path.join(outputDir, "subagent-artifact-check.json");
  const markdownPath = path.join(outputDir, "subagent-artifact-check.md");
  writeJsonAtomic(jsonPath, report);
  fs.writeFileSync(markdownPath, markdownReport(report));

  const output = {
    ok: report.status === "passed",
    run_date: runDate,
    status: report.status,
    completed_artifacts: report.summary.completed_artifacts,
    blockers: report.summary.blockers,
    warnings: report.summary.warnings,
    status_ledger: {
      queue_task_count: statusLedger.queue_task_count,
      ledger_entry_count: statusLedger.ledger_entry_count,
      current_queue_entry_count: statusLedger.current_queue_entry_count,
      implicit_queued_current_task_count: statusLedger.implicit_queued_current_task_count,
      out_of_current_queue_entry_count: statusLedger.out_of_current_queue_entry_count,
    },
    report_json: relative(root, jsonPath),
    report_md: relative(root, markdownPath),
  };
  console.log(JSON.stringify(hasFlag("--json") ? report : output, null, 2));
  process.exit(report.status === "blocked" ? 1 : 0);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
