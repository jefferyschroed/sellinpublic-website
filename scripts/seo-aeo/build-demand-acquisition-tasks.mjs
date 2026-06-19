#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const TASK_HEADERS = [
  "run_date",
  "task_id",
  "priority",
  "candidate_id",
  "topic_score_guess",
  "topic_id",
  "pillar_id",
  "topic",
  "canonical_topic",
  "intent",
  "aeo_question",
  "import_rank",
  "primary_recommended_import",
  "recommended_import_type",
  "acquisition_method",
  "source_url",
  "query_or_topic_to_validate",
  "source_first_mode",
  "source_first_reason",
  "staging_csv_path",
  "final_destination_path",
  "report_path",
  "prompt_path",
  "status",
  "blocked_reason",
  "report_status",
  "report_rows_added",
  "report_blocked_reason",
];

const SOURCE_SPECIFIC_IMPORT_TYPES = new Set([
  "google_trends_csv_export",
  "bing_webmaster_query_export",
  "gsc_search_query_export",
  "gsc_emerging_query_export",
]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function encodeQuery(value) {
  return encodeURIComponent(String(value || "").trim());
}

function stagingRows(root, row) {
  return readCsv(path.resolve(root, row.staging_csv_path || "")).rows.length;
}

function stagingHeaders(root, row) {
  return readCsv(path.resolve(root, row.staging_csv_path || row.template_path || "")).headers;
}

function destinationRows(root, row) {
  return readCsv(path.resolve(root, row.final_destination_path || "")).rows.length;
}

function priorityNumber(value) {
  const match = String(value || "P9").toUpperCase().match(/^P(\d+)/);
  return match ? Number(match[1]) : 9;
}

function isTrendCandidate(row, candidate) {
  return /^trend-/.test(String(row.candidate_id || "")) || /^trend-/.test(String(candidate?.candidate_id || ""));
}

function methodFor(row) {
  if (row.recommended_import_type === "google_trends_csv_export") {
    return {
      acquisition_method: "google_trends_browser_export",
      source_url: `https://trends.google.com/trends/explore?geo=US&q=${encodeQuery(row.query_or_topic_to_validate)}`,
      source_instructions: [
        "Use Google Trends Explore in Chrome.",
        "Use United States, web search, and the closest available relevant comparison window.",
        "Record only values visible in/exported from Google Trends; do not estimate missing values.",
        "Google Trends RSS/headline feeds do not count as validated demand.",
      ],
    };
  }
  if (row.recommended_import_type === "bing_webmaster_query_export") {
    return {
      acquisition_method: "bing_webmaster_browser_export",
      source_url: "https://www.bing.com/webmasters",
      source_instructions: [
        "Use Bing Webmaster Tools only for the verified Sell In Public property.",
        "Export query/search performance rows; do not hand-enter metrics.",
        "If Bing access or rows are unavailable, write a blocked acquisition report and leave the staging CSV header-only.",
      ],
    };
  }
  if (row.recommended_import_type === "gsc_search_query_export" || row.recommended_import_type === "gsc_emerging_query_export") {
    return {
      acquisition_method: "gsc_search_console_export",
      source_url: "https://search.google.com/search-console/performance/search-analytics",
      source_instructions: [
        "Use Google Search Console only for the verified Sell In Public property.",
        "Export query/search performance rows with clicks, impressions, CTR, and position when available.",
        "If Search Console is still processing data or the export has no rows, write a blocked acquisition report and leave the staging CSV header-only.",
        "Search Console rows validate demand and refresh direction; they do not supply factual article evidence.",
      ],
    };
  }
  return {
    acquisition_method: "reviewed_query_tool_or_first_party_export",
    source_url: "",
    source_instructions: [
      "Use a reviewed Ahrefs, Semrush, AlsoAsked, AnswerThePublic-style, Bing, or Google Trends source that is actually accessible.",
      "AnswerThePublic, autocomplete, PAA, and AI answers are discovery-only unless paired with a separate demand-bearing validation source.",
      "Every populated row must include source, query, validated_demand, validation_source, and reviewed_by.",
      "If no accessible reviewed source exists, write a blocked acquisition report and leave the staging CSV header-only.",
    ],
  };
}

function taskIdFor(row) {
  return `${row.candidate_id}-acquire-rank${row.import_rank}-${slugify(row.recommended_import_type)}`;
}

function acquisitionReportPath(runDate, row) {
  return `automation-runs/${runDate}/demand-acquisition-tasks/reports/${taskIdFor(row)}.md`;
}

function markdownField(source, name) {
  const match = String(source || "").match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match ? String(match[1] || "").trim() : "";
}

function acquisitionReportStatus(root, runDate, row) {
  const reportPath = path.join(root, acquisitionReportPath(runDate, row));
  if (!fs.existsSync(reportPath)) return { report_status: "", rows_added: "", blocked_reason: "" };
  const source = fs.readFileSync(reportPath, "utf8");
  return {
    report_status: markdownField(source, "status"),
    rows_added: markdownField(source, "rows_added"),
    blocked_reason: markdownField(source, "blocked_reason"),
  };
}

function isBlockedEmptyAcquisitionReport(root, runDate, row) {
  if (acquisitionReportStatus(root, runDate, row).report_status !== "blocked_no_reviewed_rows") return false;
  return stagingRows(root, row) === 0 && destinationRows(root, row) === 0;
}

function worklistAvailability(root, runDate) {
  const report = readJson(path.join(root, "research", "daily-content-plan", runDate, "demand-import-worklist.json"), {});
  return report.source_availability || {};
}

function hasGscRows(availability) {
  return Boolean(
    availability.gsc_search_console_rows_present ||
      availability.gsc_search_console_available ||
      Number(availability.gsc_search_console_row_count || 0) > 0
  );
}

function isUnavailableBingFallback(row, availability, options) {
  if (row.recommended_import_type !== "bing_webmaster_query_export") return false;
  return !options.includeBingFallbacks && !availability.bing_webmaster_available;
}

function isUnavailableGscFallback(root, row, availability, options) {
  if (row.recommended_import_type !== "gsc_search_query_export" && row.recommended_import_type !== "gsc_emerging_query_export") return false;
  if (options.includeGscFallbacks || hasGscRows(availability)) return false;
  return stagingRows(root, row) === 0 && destinationRows(root, row) === 0;
}

function taskStatus(root, row) {
  const staging = stagingRows(root, row);
  const destination = destinationRows(root, row);
  if (destination > 0) return { status: "already_promoted", blocked_reason: "" };
  if (staging > 0) return { status: "staged_rows_need_promotion", blocked_reason: "" };
  return { status: "needs_browser_or_export_acquisition", blocked_reason: "" };
}

function candidateTopic(candidateById, row) {
  return candidateById.get(row.candidate_id)?.topic || row.topic || row.query_or_topic_to_validate || row.candidate_id;
}

function readCandidateMap(root, runDate) {
  const rows = readCsv(path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv")).rows;
  return new Map(rows.map((row) => [row.candidate_id, row]));
}

function isGscImportType(importType) {
  return importType === "gsc_emerging_query_export" || importType === "gsc_search_query_export";
}

function isGenericQueryToolImport(row) {
  return row.recommended_import_type === "reviewed_generic_query_tool_export";
}

function isSourceSpecificImport(row) {
  return SOURCE_SPECIFIC_IMPORT_TYPES.has(row.recommended_import_type);
}

function demandAcquisitionReportRollup(root, runDate) {
  return readJson(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "report-rollup.json"), {});
}

function sourceFirstRequired(rollup) {
  return (
    rollup.recommended_action === "acquire_reviewed_export_from_external_tool_before_more_exact_query_attempts" ||
    Number(rollup.summary?.blocked_no_reviewed_rows || rollup.blocked_no_reviewed_rows || 0) >= 3
  );
}

function shouldSuppressGenericForSourceFirst(root, row, options, sourceFirstMode, candidatesWithSourceSpecificFallback) {
  if (!sourceFirstMode || options.allowGenericAfterSourceBlocks) return false;
  if (!isGenericQueryToolImport(row)) return false;
  if (stagingRows(root, row) > 0 || destinationRows(root, row) > 0) return false;
  return candidatesWithSourceSpecificFallback.has(row.candidate_id);
}

function normalizerInstructionFor(task) {
  if (isGscImportType(task.recommended_import_type)) {
    return `For raw GSC exports, prefer \`node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${task.run_date} --candidate ${task.candidate_id} --type ${task.recommended_import_type} --source-file <raw-export.csv> --property-id <gsc-property> --reviewed-by <name> --dry-run\` before writing staging rows. Keep \`source\` as \`google_search_console\` and do not mix in non-GSC rows.`;
  }

  const normalizerCommand =
    task.recommended_import_type === "bing_webmaster_query_export" || task.recommended_import_type === "google_trends_csv_export"
      ? `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${task.run_date} --candidate ${task.candidate_id} --type ${task.recommended_import_type} --source-file <raw-export.csv> --dry-run`
      : `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${task.run_date} --candidate ${task.candidate_id} --type ${task.recommended_import_type} --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run`;

  return `For raw reviewed exports, prefer \`${normalizerCommand}\` before writing staging rows.`;
}

function promptFor(task, row) {
  const sourceInstructions = task.source_instructions.map((item) => `- ${item}`).join("\n");
  const inputPathLines = Object.entries(task.input_paths || {})
    .map(([label, value]) => `- ${label}: \`${value}\``)
    .join("\n");
  const headerLines = (task.csv_headers || []).map((header) => `- ${header}`).join("\n");
  const normalizerInstruction = normalizerInstructionFor(task);
  return `# Demand Acquisition Task

Task: \`${task.task_id}\`
Candidate: \`${task.candidate_id}\`
Topic: ${task.topic}
Import type: \`${task.recommended_import_type}\`
Method: \`${task.acquisition_method}\`
Query/topic to validate: ${task.query_or_topic_to_validate}

## Write Scope

- Staging CSV: \`${task.staging_csv_path}\`
- Acquisition report: \`${task.report_path}\`

Do not edit any other files. Do not promote data into \`imports/\`; the promotion runner handles that after review.

## Input Paths

${inputPathLines}

## Source

${task.source_url ? `Open: ${task.source_url}` : "Use the approved source that is accessible for this reviewed export."}

${sourceInstructions}

## Blocked Exact-Query Policy

Do not retry a source that is already rate-limited, empty, inaccessible, or known to have no reviewed rows in this run. If repeated acquisition reports show \`blocked_no_reviewed_rows\`, identify a real accessible export source before launching another exact-query attempt. Google Trends RSS, autocomplete, PAA, ChatGPT answers, AI prompt output, and public feeds are discovery-only.

## Required Fields

${row.required_review_fields || "Use the staging CSV headers."}

## CSV Headers

${headerLines}

## Output Rules

- If real reviewed rows are available, fill only the staging CSV with those rows and write the acquisition report as \`status: staged_reviewed_rows\`.
- If the source is unavailable, empty, inaccessible, or not actually demand-bearing, leave the staging CSV header-only and write \`status: blocked_no_reviewed_rows\`.
- Do not cite discovery inputs as factual evidence.
- Do not use ChatGPT answers, Reddit, public RSS/feed rows, autocomplete, or PAA as validated demand.
- Do not invent volume, trend values, clicks, impressions, or validation status.
- ${normalizerInstruction}

## Acquisition Report Required Evidence

Record these fields when available: source tool, source URL, export filename/path, capture timestamp, geo, language, timeframe, source row count, reviewer, validation source, and normalization notes. If blocked, record the exact blocker: inaccessible, rate-limited, no export, no demand metrics, empty source, or discovery-only source.

## After The Task

The orchestrator will run:

\`\`\`sh
node scripts/seo-aeo/run-demand-promotion.mjs --date ${task.run_date} --dry-run
node scripts/seo-aeo/run-demand-promotion.mjs --date ${task.run_date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${task.run_date}
# Optional only after reviewing the plain promotion report and receiving packet approval:
node scripts/seo-aeo/run-demand-promotion.mjs --date ${task.run_date} --apply --scaffold-limit 1 --scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:${task.run_date}
\`\`\`
`;
}

function reportPlaceholder(task) {
  return `# Demand Acquisition Report

task_id: ${task.task_id}
candidate_id: ${task.candidate_id}
status: not_started
source_used:
rows_added: 0
blocked_reason:
reviewer:

## Notes

This report must be updated by the acquisition subagent. It does not validate, promote, or cite demand data by itself.
`;
}

function nextUnambiguousCandidate(root, runDate) {
  const preflight = readJson(path.join(root, "research", "daily-content-plan", runDate, "demand-readiness-preflight.json"), {});
  return preflight.next_unambiguous_action?.candidate_id || "";
}

function buildTasks(root, runDate, options) {
  const manifestPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "manifest.json");
  const manifest = readJson(manifestPath, {});
  const candidateById = readCandidateMap(root, runDate);
  const availability = worklistAvailability(root, runDate);
  const reportRollup = demandAcquisitionReportRollup(root, runDate);
  const sourceFirstMode = sourceFirstRequired(reportRollup);
  let allRows = (manifest.review_rows || [])
    .filter((row) => (options.candidateId ? row.candidate_id === options.candidateId : true))
    .filter((row) => (options.includePromoted ? true : destinationRows(root, row) === 0))
    .filter((row) => {
      const candidate = candidateById.get(row.candidate_id);
      if (!options.includeTrends && isTrendCandidate(row, candidate)) return false;
      return true;
    })
    .filter((row) => !isUnavailableBingFallback(row, availability, options))
    .filter((row) => !isUnavailableGscFallback(root, row, availability, options))
    .filter((row) => options.includeBlockedReports || !isBlockedEmptyAcquisitionReport(root, runDate, row));

  if (sourceFirstMode && !options.includeBlockedReports && !options.allowGenericAfterSourceBlocks) {
    const candidatesWithSourceSpecificFallback = new Set(
      allRows.filter((row) => isSourceSpecificImport(row)).map((row) => row.candidate_id)
    );
    allRows = allRows.filter((row) =>
      !shouldSuppressGenericForSourceFirst(root, row, options, sourceFirstMode, candidatesWithSourceSpecificFallback)
    );
  }

  let rows = allRows.filter((row) => {
    if (options.includeFallbacks) return true;
    if (options.wave === "next") return true;
    return String(row.primary_recommended_import || "").toLowerCase() === "yes";
  });

  rows = rows.filter((row) => {
    if (options.wave === "rank1-topics") return Number(row.import_rank || 0) === 1;
    if (options.wave === "all-primary") return String(row.primary_recommended_import || "").toLowerCase() === "yes";
    return true;
  });

  if (!options.candidateId && options.wave === "next") {
    const nextCandidateId = nextUnambiguousCandidate(root, runDate);
    if (nextCandidateId) {
      const sameCandidateRows = rows.filter((row) => row.candidate_id === nextCandidateId);
      rows = sameCandidateRows.length
        ? sameCandidateRows
        : sourceFirstMode
          ? rows
          : rows.filter((row) => String(row.primary_recommended_import || "").toLowerCase() === "yes");
    }
  }

  rows = rows
    .sort((a, b) => {
      const priority = priorityNumber(a.priority) - priorityNumber(b.priority);
      if (priority) return priority;
      const candidateA = candidateById.get(a.candidate_id) || {};
      const candidateB = candidateById.get(b.candidate_id) || {};
      const scoreDelta = Number(candidateB.topic_score_guess || 0) - Number(candidateA.topic_score_guess || 0);
      if (scoreDelta) return scoreDelta;
      return Number(a.import_rank || 0) - Number(b.import_rank || 0);
    })
    .slice(0, options.maxTasks);

  return rows.map((row) => {
    const candidate = candidateById.get(row.candidate_id) || {};
    const method = methodFor(row);
    const status = taskStatus(root, row);
    const taskId = taskIdFor(row);
    const reportPath = acquisitionReportPath(runDate, row);
    const reportStatus = acquisitionReportStatus(root, runDate, row);
    const inputPaths = {
      canonical_brief_json: `research/daily-content-plan/${runDate}/demand-acquisition-brief.json`,
      canonical_brief_md: `research/daily-content-plan/${runDate}/demand-acquisition-brief.md`,
      preflight_json: `research/daily-content-plan/${runDate}/demand-readiness-preflight.json`,
      import_manifest_json: `research/daily-content-plan/${runDate}/demand-import-pack/manifest.json`,
      draft_instructions_md: row.staging_csv_path ? row.staging_csv_path.replace(/\.csv$/i, ".md") : "",
      template_csv: row.template_path || "",
    };
    if (isGscImportType(row.recommended_import_type)) inputPaths.search_query_daily_csv = "analytics/search_query_daily.csv";
    return {
      run_date: runDate,
      task_id: taskId,
      priority: row.priority || "",
      candidate_id: row.candidate_id || "",
      topic_score_guess: candidate.topic_score_guess || "",
      topic_id: candidate.topic_id || "",
      pillar_id: candidate.pillar_id || "",
      parent_topic: candidate.parent_topic || "",
      topic: candidateTopic(candidateById, row),
      canonical_topic: candidate.canonical_topic || "",
      intent: candidate.intent || "",
      aeo_question: candidate.aeo_question || "",
      gate_reasons: candidate.gate_reasons || "",
      source_readiness: candidate.source_readiness || "",
      packet_intake_status: candidate.packet_intake_status || "",
      topic_decision: candidate.topic_decision || "",
      coverage_status: candidate.coverage_status || "",
      coverage_role: candidate.coverage_role || "",
      authority_match: candidate.authority_match || "",
      import_rank: row.import_rank || "",
      primary_recommended_import: row.primary_recommended_import || "",
      priority_reason: row.priority_reason || "",
      recommended_import_type: row.recommended_import_type || "",
      query_or_topic_to_validate: row.query_or_topic_to_validate || "",
      template_path: row.template_path || "",
      staging_csv_path: row.staging_csv_path || "",
      final_destination_path: row.final_destination_path || "",
      required_review_fields: row.required_review_fields || "",
      csv_headers: stagingHeaders(root, row),
      input_paths: inputPaths,
      source_first_mode: sourceFirstMode ? "yes" : "no",
      source_first_reason: sourceFirstMode
        ? `${reportRollup.summary?.blocked_no_reviewed_rows || reportRollup.blocked_no_reviewed_rows || 0} blocked acquisition report(s); ${reportRollup.recommended_action || "source-first threshold reached"}`
        : "",
      report_path: reportPath,
      prompt_path: `automation-runs/${runDate}/demand-acquisition-tasks/prompts/${taskId}.prompt.md`,
      status: status.status,
      blocked_reason: status.blocked_reason,
      report_status: reportStatus.report_status,
      report_rows_added: reportStatus.rows_added,
      report_blocked_reason: reportStatus.blocked_reason,
      ...method,
    };
  });
}

function writeMarkdown(filePath, report) {
  const lines = report.tasks.length
    ? report.tasks
        .map(
          (task, index) => `${index + 1}. \`${task.task_id}\` (${task.priority}, ${task.acquisition_method})
   - Candidate: ${task.candidate_id}
   - Topic: ${task.topic}
   - Staging: \`${task.staging_csv_path}\`
   - Report: \`${task.report_path}\`
   - Prompt: \`${task.prompt_path}\``
        )
        .join("\n")
    : "- No acquisition tasks selected.";
  const markdown = `# Demand Acquisition Tasks

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Task count: ${report.task_count}
Dispatch policy: ${report.dispatch_policy}
Canonical dispatch: \`${report.canonical_dispatch_path}\`

## Rule

Do not dispatch from this file directly. This task batch feeds \`automation-runs/${report.run_date}/subagent-dispatch/ready-batch.json\`; the canonical owner handoff launches only prompts selected in ready-batch. Each selected acquisition subagent owns exactly one source attempt and may write only the listed staging CSV plus the listed report. Promotion still requires \`run-demand-promotion.mjs\`.

## Selected Tasks

${lines}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const wave = arg("--wave", "next");
  if (!["next", "rank1-topics", "all-primary"].includes(wave)) throw new Error("--wave must be next, rank1-topics, or all-primary.");
  const maxTasks = Number(arg("--max", wave === "next" ? "1" : "12"));
  if (!Number.isInteger(maxTasks) || maxTasks < 1) throw new Error("--max must be a positive integer.");
  const options = {
    wave,
    maxTasks,
    candidateId: arg("--candidate", ""),
    includeFallbacks: hasFlag("--include-fallbacks"),
    includePromoted: hasFlag("--include-promoted"),
    includeTrends: hasFlag("--include-trends"),
    includeBlockedReports: hasFlag("--include-blocked-reports"),
    includeBingFallbacks: hasFlag("--include-bing-fallbacks"),
    includeGscFallbacks: hasFlag("--include-gsc-fallbacks"),
    allowGenericAfterSourceBlocks: hasFlag("--allow-generic-after-source-blocks"),
  };
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks"));
  const promptDir = ensureDir(path.join(outputDir, "prompts"));
  const reportDir = ensureDir(path.join(outputDir, "reports"));
  for (const entry of fs.readdirSync(promptDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".prompt.md")) {
      fs.rmSync(path.join(promptDir, entry.name));
    }
  }

  const tasks = buildTasks(root, runDate, options);
  for (const task of tasks) {
    fs.writeFileSync(path.join(root, task.prompt_path), promptFor(task, task));
    const reportPath = path.join(root, task.report_path);
    if (!fs.existsSync(reportPath) || fs.statSync(reportPath).size === 0) {
      fs.writeFileSync(reportPath, reportPlaceholder(task));
    }
  }

  const jsonPath = path.join(outputDir, "tasks.json");
  const csvPath = path.join(outputDir, "tasks.csv");
  const mdPath = path.join(outputDir, "tasks.md");
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    filters: options,
    dispatch_policy: "ready_batch_only",
    canonical_dispatch_path: relative(root, path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json")),
    task_count: tasks.length,
    tasks,
  };
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, TASK_HEADERS, tasks);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        task_count: tasks.length,
        tasks_json: relative(root, jsonPath),
        tasks_md: relative(root, mdPath),
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
