#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function taskIdFor(row) {
  return `${row.candidate_id}-acquire-rank${row.import_rank}-${slugify(row.recommended_import_type)}`;
}

function markdownField(source, field) {
  return source.match(new RegExp(`^${field}:[ \\t]*([^\\r\\n]*)`, "m"))?.[1]?.trim() || "";
}

function stripMarkdownValue(value) {
  return String(value || "")
    .trim()
    .replace(/^[-*]\s*/, "")
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

function markdownLabeledValue(source, labels) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(`^(?:[-*]\\s*)?${escaped}\\s*:\\s*(.*)$`, "i"));
      if (!match) continue;
      const inline = stripMarkdownValue(match[1]);
      if (inline) return inline.replaceAll("`", "").trim();
      for (const nextLine of lines.slice(index + 1, index + 5)) {
        const next = stripMarkdownValue(nextLine).replaceAll("`", "").trim();
        if (next) return next;
      }
    }
  }
  return "";
}

function importRankFromFileName(fileName) {
  const match = String(fileName || "").match(/-rank(\d+)\.md$/);
  return match ? match[1] : "";
}

function classifyReason(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("http 429")) return "source_rate_limited";
  if (text.includes("blocked_missing_reviewed_export")) return "reviewed_export_missing";
  if (text.includes("header-only")) return "local_staging_empty";
  if (text.includes("discovery-only")) return "discovery_only_inputs";
  if (text.includes("no accessible")) return "no_accessible_reviewed_source";
  return "other";
}

function readReports(root, runDate) {
  const dir = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "reports");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const reportPath = path.join(dir, name);
      const source = fs.readFileSync(reportPath, "utf8");
      const blockedReason = markdownField(source, "blocked_reason");
      return {
        task_id: markdownField(source, "task_id") || name.replace(/\.md$/, ""),
        candidate_id: markdownField(source, "candidate_id"),
        status: markdownField(source, "status") || "missing_status",
        source_used: markdownField(source, "source_used"),
        rows_added: Number(markdownField(source, "rows_added") || 0),
        blocked_reason: blockedReason,
        reason_code: classifyReason(blockedReason),
        report_path: relative(root, reportPath),
      };
    });
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "missing";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function currentStagedRows(root, runDate, reports) {
  const manifestPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "manifest.json");
  const manifest = readJson(manifestPath, {});
  const manifestRows = Array.isArray(manifest.review_rows) ? manifest.review_rows : [];
  const manifestByTaskId = new Map(manifestRows.map((row) => [taskIdFor(row), row]));
  const currentRows = [];
  const staleRows = [];

  for (const report of reports.filter((item) => item.status === "staged_reviewed_rows")) {
    const manifestRow = manifestByTaskId.get(report.task_id);
    const stagingPath = manifestRow?.staging_csv_path ? path.join(root, manifestRow.staging_csv_path) : "";
    const rowCount = stagingPath && fs.existsSync(stagingPath) ? readCsv(stagingPath).rows.length : 0;
    const item = {
      task_id: report.task_id,
      candidate_id: report.candidate_id,
      report_path: report.report_path,
      staging_csv_path: manifestRow?.staging_csv_path || "",
      staged_row_count: rowCount,
    };
    if (manifestRow && rowCount > 0) currentRows.push(item);
    else staleRows.push(item);
  }

  return {
    current_rows: currentRows,
    stale_rows: staleRows,
    current_staged_reviewed_rows: currentRows.length,
    current_staged_row_total: currentRows.reduce((total, item) => total + item.staged_row_count, 0),
    stale_staged_reviewed_rows: staleRows.length,
  };
}

function recommendedAction(summary) {
  if (Number(summary.source_request_valid_for_promotion || 0) > 0) return "run_demand_promotion_dry_run";
  if (summary.current_staged_reviewed_rows > 0) return "run_demand_promotion_dry_run";
  if (summary.blocked_no_reviewed_rows >= 3) return "acquire_reviewed_export_from_external_tool_before_more_exact_query_attempts";
  if (summary.total_reports > 0) return "continue_next_demand_acquisition_task";
  return "dispatch_first_demand_acquisition_task";
}

function validationSummary(root, runDate) {
  const validationPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json");
  const validation = readJson(validationPath, {});
  return {
    path: fs.existsSync(validationPath) ? relative(root, validationPath) : "",
    valid_for_promotion: Number(validation.valid_for_promotion || 0),
    promoted: Number(validation.promoted || 0),
    blocked: Number(validation.blocked || 0),
    empty_staging: Number(validation.empty_staging || 0),
  };
}

function sourceRequestLabel(row) {
  if (row.recommended_import_type === "gsc_search_query_export" || row.recommended_import_type === "gsc_emerging_query_export") {
    return "Export Google Search Console performance rows for the verified Sell In Public property with query, page, clicks, impressions, CTR, position, country, and device when available.";
  }
  if (row.recommended_import_type === "bing_webmaster_query_export") {
    return "Export Bing Webmaster search performance rows for the verified Sell In Public property with query, page, clicks, impressions, CTR, position, country, and device when available.";
  }
  if (row.recommended_import_type === "google_trends_csv_export") {
    return "Export Google Trends CSV/API rows only when the Trends UI/API shows real Interest over time or related-query data for the requested term.";
  }
  if (row.recommended_import_type === "reviewed_generic_query_tool_export") {
    return "Provide an owner-reviewed Ahrefs, Semrush, AlsoAsked, or AnswerThePublic-style export paired with separate demand validation and reviewer fields.";
  }
  return "Provide a reviewed demand-bearing export from an approved source.";
}

function acceptableSourcesFor(row) {
  if (row.recommended_import_type === "gsc_search_query_export" || row.recommended_import_type === "gsc_emerging_query_export") {
    return ["Google Search Console verified-property export", "Google Search Console OAuth-pulled rows"];
  }
  if (row.recommended_import_type === "bing_webmaster_query_export") {
    return ["Bing Webmaster verified-property export"];
  }
  if (row.recommended_import_type === "google_trends_csv_export") {
    return ["Google Trends CSV export with real Interest over time rows", "Reviewed Google Trends API output"];
  }
  if (row.recommended_import_type === "reviewed_generic_query_tool_export") {
    return ["Ahrefs reviewed keyword export", "Semrush reviewed keyword export", "AlsoAsked reviewed export", "AnswerThePublic-style export with separate demand validation"];
  }
  return ["Approved reviewed demand-bearing export"];
}

function normalizationCommandFor(runDate, row) {
  if (row.recommended_import_type === "gsc_search_query_export" || row.recommended_import_type === "gsc_emerging_query_export") {
    return `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${row.candidate_id} --type ${row.recommended_import_type} --source-file <raw-export.csv> --property-id <gsc-property> --reviewed-by <name> --dry-run`;
  }
  if (row.recommended_import_type === "reviewed_generic_query_tool_export") {
    return `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${row.candidate_id} --type ${row.recommended_import_type} --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run`;
  }
  return `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${row.candidate_id} --type ${row.recommended_import_type} --source-file <raw-export.csv> --dry-run`;
}

function commandSequenceFor(runDate, row) {
  const dryRun = row.normalization_command || normalizationCommandFor(runDate, row);
  const apply = dryRun.includes("--dry-run") ? dryRun.replace("--dry-run", "--apply") : `${dryRun} --apply`;
  return [
    dryRun,
    apply,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}`,
  ];
}

function scaffoldCommandFor(runDate) {
  return `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --scaffold-limit 1 --scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:${runDate}`;
}

function formatCommandLine(command, index) {
  return `     ${index + 1}. \`${command}\``;
}

function normalizationGuidanceFor(requestedExports) {
  const types = new Set(requestedExports.map((item) => item.recommended_import_type).filter(Boolean));
  if (types.size === 1 && types.has("reviewed_generic_query_tool_export")) {
    return "This handoff's listed command sequences are for reviewed_generic_query_tool_export rows. Use them for owner-reviewed Ahrefs, Semrush, AlsoAsked, AnswerThePublic-style, or other reviewed query-tool exports paired with separate demand validation. If the owner provides Google Search Console, Bing Webmaster, or Google Trends CSV/API data instead, do not relabel it as generic; use the source-specific import route in docs/seo-aeo/local-automation-runbook.md and regenerate the handoff.";
  }
  return "Use each requested export's recommended_import_type and command sequence exactly as listed. Do not stage source-specific Google Search Console, Bing Webmaster, or Google Trends CSV/API rows as reviewed_generic_query_tool_export.";
}

function readCandidateMap(root, runDate) {
  const candidatePath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const rows = readCsv(candidatePath).rows;
  return new Map(rows.map((row) => [row.candidate_id, row]));
}

function priorityForCandidate(candidate) {
  const score = Number(candidate.topic_score_guess || 0);
  if (score >= 80) return "P0";
  if (score >= 65) return "P1";
  return "P2";
}

function candidateMatchesReviewArtifact(candidate, review) {
  const artifactTopicId = markdownLabeledValue(review.source, ["Topic ID"]);
  const artifactTopic = markdownLabeledValue(review.source, ["Topic"]);
  if (artifactTopicId) return normalizeIdentity(artifactTopicId) === normalizeIdentity(candidate.topic_id);
  if (artifactTopic) return normalizeIdentity(artifactTopic) === normalizeIdentity(candidate.topic);

  const query = normalizeIdentity(review.query_or_topic_to_validate);
  const accepted = [candidate.aeo_question, candidate.canonical_topic, candidate.topic].map(normalizeIdentity).filter(Boolean);
  return Boolean(query && accepted.includes(query));
}

function fallbackRequestFromReview(root, runDate, reviewPath, candidateById) {
  const source = fs.readFileSync(reviewPath, "utf8");
  const candidateId = markdownField(source, "candidate_id");
  const candidate = candidateById.get(candidateId);
  if (!candidate) return null;
  if (markdownField(source, "import_status") !== "blocked_missing_reviewed_export") return null;

  const importRank = importRankFromFileName(path.basename(reviewPath)) || "1";
  const recommendedImportType =
    markdownLabeledValue(source, ["Approved source/import type", "Approved source", "Import type"]) ||
    "reviewed_generic_query_tool_export";
  const queryOrTopic =
    markdownLabeledValue(source, ["Query to run and review", "Query to run", "Query or topic to validate"]) ||
    candidate.aeo_question ||
    candidate.topic;
  const templatePath =
    markdownLabeledValue(source, ["Template path", "Template"]) ||
    "docs/seo-aeo/templates/imports/generic-query-tool-export.csv";
  const stagingCsvPath = markdownLabeledValue(source, ["Staging CSV", "Staging draft checked"]);
  const finalDestinationPath = markdownLabeledValue(source, ["Final destination", "Final destination checked"]);
  const requiredReviewFields =
    markdownLabeledValue(source, ["Required review fields"]) ||
    "source,query,validated_demand,validation_source,reviewed_by";

  if (!stagingCsvPath || !finalDestinationPath) return null;
  if (!candidateMatchesReviewArtifact(candidate, { source, query_or_topic_to_validate: queryOrTopic })) return null;

  return {
    request_id: `${candidateId}-rank${importRank}-${slugify(recommendedImportType)}`,
    priority: priorityForCandidate(candidate),
    candidate_id: candidateId,
    topic: candidate.topic || queryOrTopic,
    topic_id: candidate.topic_id || "",
    pillar_id: candidate.pillar_id || "",
    import_rank: importRank,
    recommended_import_type: recommendedImportType,
    query_or_topic_to_validate: queryOrTopic,
    template_path: templatePath,
    staging_csv_path: stagingCsvPath,
    final_destination_path: finalDestinationPath,
    required_review_fields: requiredReviewFields,
    acceptable_sources: acceptableSourcesFor({ recommended_import_type: recommendedImportType }),
    owner_must_provide: sourceRequestLabel({ recommended_import_type: recommendedImportType }),
    minimum_real_rows: 1,
    validation_rule:
      "Rows must come from a reviewed demand-bearing source. Discovery-only rows, AI answers, autocomplete, PAA, public feeds, Reddit, and placeholders do not unlock packet intake.",
    normalization_command: normalizationCommandFor(runDate, {
      candidate_id: candidateId,
      recommended_import_type: recommendedImportType,
    }),
    source_review_artifact: relative(root, reviewPath),
    fallback_reason: "manifest_empty_but_current_blocked_demand_import_review_exists",
  };
}

function fallbackRequestedExports(root, runDate, candidateById) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  if (!fs.existsSync(dir)) return [];
  const rows = fs
    .readdirSync(dir)
    .filter((name) => /^demand-import-review-.+-rank\d+\.md$/.test(name))
    .sort()
    .map((name) => fallbackRequestFromReview(root, runDate, path.join(dir, name), candidateById))
    .filter(Boolean)
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const left = priorityOrder[a.priority] ?? 9;
      const right = priorityOrder[b.priority] ?? 9;
      if (left !== right) return left - right;
      if (a.candidate_id !== b.candidate_id) return a.candidate_id.localeCompare(b.candidate_id);
      return Number(a.import_rank || 0) - Number(b.import_rank || 0);
    });
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.candidate_id}\u0001${row.recommended_import_type}\u0001${row.final_destination_path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requestTemplateFor(importType) {
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") {
    return "docs/seo-aeo/templates/imports/search-query-export.csv";
  }
  if (importType === "bing_webmaster_query_export") {
    return "docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv";
  }
  if (importType === "google_trends_csv_export") {
    return "docs/seo-aeo/templates/imports/google-trends-export.csv";
  }
  return "docs/seo-aeo/templates/imports/generic-query-tool-export.csv";
}

function requestFilePrefix(importType) {
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") return "gsc";
  if (importType === "bing_webmaster_query_export") return "bing-webmaster";
  if (importType === "google_trends_csv_export") return "google-trends";
  return "reviewed-query-tool";
}

function requiredReviewFieldsFor(importType) {
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") {
    return "date,source,property_id,reviewed_by,query,clicks_or_impressions_or_avg_position";
  }
  if (importType === "bing_webmaster_query_export") {
    return "source,Date,Search Keywords,Clicks_or_Impressions";
  }
  if (importType === "google_trends_csv_export") {
    return "date,query,country,language,trend_delta_or_trend_window_or_notes";
  }
  return "source,query,validated_demand,validation_source,reviewed_by";
}

function candidateDemandRequests(runDate, candidate) {
  const topicKey = candidate.topic_id || slugify(candidate.topic);
  if (!topicKey) return [];
  const types = [
    "gsc_search_query_export",
    "bing_webmaster_query_export",
    "google_trends_csv_export",
    "reviewed_generic_query_tool_export",
  ];
  return types.map((importType, index) => ({
    request_id: `${candidate.candidate_id}-rank${index + 1}-${slugify(importType)}`,
    priority: priorityForCandidate(candidate),
    candidate_id: candidate.candidate_id || "",
    topic: candidate.topic || "",
    topic_id: candidate.topic_id || "",
    pillar_id: candidate.pillar_id || "",
    import_rank: String(index + 1),
    primary_recommended_import: index === 0 ? "yes" : "no",
    recommended_import_type: importType,
    query_or_topic_to_validate: candidate.aeo_question || candidate.canonical_topic || candidate.topic || "",
    template_path: requestTemplateFor(importType),
    staging_csv_path: `research/daily-content-plan/${runDate}/demand-import-pack/${runDate}-${requestFilePrefix(importType)}-${topicKey}.draft.csv`,
    final_destination_path: `imports/query-exports/${runDate}-${requestFilePrefix(importType)}-${topicKey}.csv`,
    required_review_fields: requiredReviewFieldsFor(importType),
    acceptable_sources: acceptableSourcesFor({ recommended_import_type: importType }),
    owner_must_provide: sourceRequestLabel({ recommended_import_type: importType }),
    minimum_real_rows: 1,
    validation_rule:
      "Rows must come from a reviewed demand-bearing source. Discovery-only rows, AI answers, autocomplete, PAA, public feeds, Reddit, and placeholders do not unlock packet intake.",
    normalization_command: normalizationCommandFor(runDate, {
      candidate_id: candidate.candidate_id,
      recommended_import_type: importType,
    }),
    source_review_artifact: "",
    fallback_reason: "current_candidate_source_request",
  }));
}

function currentCandidateRequestedExports(runDate, candidateById) {
  return Array.from(candidateById.values())
    .filter((candidate) => candidate.candidate_id)
    .filter((candidate) => !["intake_ready"].includes(String(candidate.packet_intake_status || "")))
    .filter((candidate) => String(candidate.strategic_asset_decision || candidate.asset_decision || "") === "post")
    .filter((candidate) => ["create_or_refresh_packet", "resolve_gap_first", ""].includes(String(candidate.topic_decision || "")))
    .filter((candidate) => Number(candidate.topic_score_guess || 0) >= 65)
    .flatMap((candidate) => candidateDemandRequests(runDate, candidate))
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const left = priorityOrder[a.priority] ?? 9;
      const right = priorityOrder[b.priority] ?? 9;
      if (left !== right) return left - right;
      if (a.candidate_id !== b.candidate_id) return a.candidate_id.localeCompare(b.candidate_id);
      return Number(a.import_rank || 99) - Number(b.import_rank || 99);
    });
}

function templateHeaders(root, templatePath) {
  const absolutePath = path.resolve(root, templatePath);
  if (!fs.existsSync(absolutePath)) return [];
  return readCsv(absolutePath).headers;
}

function ensureSourceRequestStaging(root, request) {
  const stagingPath = path.resolve(root, request.staging_csv_path || "");
  if (!stagingPath || !request.template_path) return;
  const headers = templateHeaders(root, request.template_path);
  if (!headers.length) return;
  ensureDir(path.dirname(stagingPath));
  if (fs.existsSync(stagingPath) && readCsv(stagingPath).rows.length > 0) return;
  writeCsvAtomic(stagingPath, headers, []);
}

function writeRequestedExportInstruction(root, runDate, request) {
  ensureSourceRequestStaging(root, { ...request, run_date: runDate });
  const stagingPath = path.resolve(root, request.staging_csv_path || "");
  const instructionPath = stagingPath.replace(/\.csv$/i, ".md");
  const commands = commandSequenceFor(runDate, request).map((command) => `- \`${command}\``).join("\n");
  const markdown = `# Source Request Demand Import Instructions

Candidate: ${request.candidate_id}
Topic: ${request.topic}
Import type: ${request.recommended_import_type}
Import rank: ${request.import_rank || "unranked"}
Primary recommended import: ${request.primary_recommended_import || "no"}
Priority reason: ${request.fallback_reason || request.priority || "source_request"}
Query or topic to validate: ${request.query_or_topic_to_validate}
Staging CSV: ${request.staging_csv_path}
Final destination: ${request.final_destination_path}

## Required Review Fields

${request.required_review_fields || "Use the staging CSV headers."}

## Source Requirement

${request.owner_must_provide || "Provide a reviewed demand-bearing export from an approved source."}

## Commands

${commands}

## Rules

- Put the raw reviewed export under \`imports/\` or \`research/\` before staging.
- Do not use Reddit, public feeds, Google Trends RSS, autocomplete, People Also Ask, or AI answers as validated demand.
- Do not manually move this staging file into \`imports/\`; use \`run-demand-promotion.mjs\`.
`;
  fs.writeFileSync(instructionPath, markdown);
}

function writeRequestedExportInstructions(root, runDate, requestedExports) {
  for (const request of requestedExports) writeRequestedExportInstruction(root, runDate, request);
}

function buildSourceRequest(root, runDate, report) {
  const manifestPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "manifest.json");
  const manifest = readJson(manifestPath, {});
  const candidateById = readCandidateMap(root, runDate);
  const reportsByTaskId = new Map(report.reports.map((item) => [item.task_id, item]));
  const blockedCount = Number(report.summary.blocked_no_reviewed_rows || 0);
  const stagedReviewedRows = Number(report.summary.current_staged_reviewed_rows || 0);
  const rows = Array.isArray(manifest.review_rows) ? manifest.review_rows : [];
  const remainingRows = rows.filter((row) => {
    const taskReport = reportsByTaskId.get(taskIdFor(row));
    return !["blocked_no_reviewed_rows", "staged_reviewed_rows"].includes(taskReport?.status || "");
  });
  const manifestRequestedExports = remainingRows.map((row) => {
    const candidate = candidateById.get(row.candidate_id) || {};
    return {
      request_id: `${row.candidate_id || "candidate"}-rank${row.import_rank || "x"}-${slugify(row.recommended_import_type)}`,
      priority: row.priority || "",
      candidate_id: row.candidate_id || "",
      topic: candidate.topic || row.topic || row.query_or_topic_to_validate || "",
      topic_id: candidate.topic_id || "",
      pillar_id: candidate.pillar_id || "",
      import_rank: row.import_rank || "",
      recommended_import_type: row.recommended_import_type || "",
      query_or_topic_to_validate: row.query_or_topic_to_validate || "",
      template_path: row.template_path || "",
      staging_csv_path: row.staging_csv_path || "",
      final_destination_path: row.final_destination_path || "",
      required_review_fields: row.required_review_fields || "",
      acceptable_sources: acceptableSourcesFor(row),
      owner_must_provide: sourceRequestLabel(row),
      minimum_real_rows: 1,
      validation_rule: "Rows must come from a reviewed demand-bearing source. Discovery-only rows, AI answers, autocomplete, PAA, public feeds, Reddit, and placeholders do not unlock packet intake.",
      normalization_command: normalizationCommandFor(runDate, row),
      source_review_artifact: "",
      fallback_reason: "",
    };
  });
  const reviewFallbackExports = manifestRequestedExports.length ? [] : fallbackRequestedExports(root, runDate, candidateById);
  const candidateFallbackExports = manifestRequestedExports.length || reviewFallbackExports.length ? [] : currentCandidateRequestedExports(runDate, candidateById);
  const requestedExportSource = manifestRequestedExports.length
    ? "manifest_remaining_rows"
    : reviewFallbackExports.length
      ? "current_demand_import_review_artifacts"
      : candidateFallbackExports.length
        ? "current_topic_candidates"
        : "none";
  const requestedExports = (manifestRequestedExports.length ? manifestRequestedExports : reviewFallbackExports.length ? reviewFallbackExports : candidateFallbackExports).slice(0, 24);
  const escalationRequired = blockedCount >= 3 && stagedReviewedRows === 0;
  const normalizationGuidance = normalizationGuidanceFor(requestedExports);
  writeRequestedExportInstructions(root, runDate, requestedExports);

  return {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: report.generated_at,
    status: escalationRequired
      ? requestedExports.length
        ? "escalation_required"
        : "escalation_required_no_remaining_manifest_rows"
      : stagedReviewedRows > 0
        ? "not_required_staged_rows_present"
        : "not_required",
    trigger_threshold: 3,
    blocked_no_reviewed_rows: blockedCount,
    rows_added_total: Number(report.summary.rows_added_total || 0),
    reason_counts: report.summary.by_reason_code || {},
    blocked_report_paths: report.blocked_reports.map((item) => item.report_path),
    source_probe_lock: {
      active: escalationRequired,
      reason: escalationRequired
        ? `${blockedCount} acquisition attempt(s) found no reviewed rows and no staged reviewed rows are available.`
        : "",
      blocked_actions: escalationRequired
        ? ["launch_exact_query_worker", "retry_rate_limited_source", "use_discovery_only_rows", "write_placeholder_rows"]
        : [],
      unlock_condition: "Owner provides one listed reviewed export or source access with real rows, or first-party GA4/GSC/Bing data produces reviewed demand rows.",
    },
    required_owner_action: escalationRequired
      ? "Provide one reviewed demand-bearing export or verified source access from the requested_exports list."
      : "",
    recommended_action:
      escalationRequired
        ? "provide_real_reviewed_export_or_wait_for_first_party_rows_before_more_generic_acquisition"
        : "continue_standard_acquisition",
    acceptable_source_access: [
      "Google Search Console verified-property export or OAuth rows",
      "Bing Webmaster verified-property export",
      "Manual Google Trends CSV/API export with visible data",
      "Owner-reviewed Ahrefs/Semrush/AlsoAsked/AnswerThePublic export with separate demand validation",
    ],
    disallowed_sources: ["ChatGPT answers", "Reddit", "Google Trends RSS/headlines", "autocomplete", "People Also Ask", "public feeds", "placeholder rows"],
    source_order: [
      "Google Search Console verified-property export or OAuth rows",
      "Bing Webmaster verified-property export",
      "Manual Google Trends CSV/API export with visible data",
      "Owner-reviewed Ahrefs/Semrush/AlsoAsked/AnswerThePublic export with separate demand validation",
    ],
    requested_export_count: requestedExports.length,
    requested_export_source: requestedExportSource,
    normalization_guidance: normalizationGuidance,
    source_specific_alternate_route:
      "For GSC/Bing/Google Trends CSV/API rows, prefer a source-specific requested export when present. If this source-request fallback only lists generic query-tool rows, follow docs/seo-aeo/local-automation-runbook.md source-specific staging guidance instead of converting first-party rows into generic rows.",
    requested_exports: requestedExports,
	    next_commands_after_owner_input: requestedExports[0]
	      ? commandSequenceFor(runDate, requestedExports[0])
	      : [
	          `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate <candidate-id> --type <import-type> --source-file <raw-export.csv> --reviewed-by <name> --dry-run`,
	          `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate <candidate-id> --type <import-type> --source-file <raw-export.csv> --reviewed-by <name> --apply`,
	          `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
	          `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}`,
	        ],
    optional_scaffold_command_after_packet_approval: scaffoldCommandFor(runDate),
    scaffold_command_requires_approval: true,
    scaffold_command_gate:
      "The scaffolded apply command is optional. Run it only after plain promotion has completed, the promotion report shows a ready handoff, and packet scaffolding has been approved.",
    source_files: {
      manifest: relative(root, manifestPath),
      reports_dir: `automation-runs/${runDate}/demand-acquisition-tasks/reports`,
    },
    rule:
      "This request names source inputs needed to unblock validated demand. It does not validate demand, promote imports, scaffold packets, approve publishing, or make discovery-only rows factual evidence.",
  };
}

function writeSourceRequestMarkdown(filePath, request) {
  const exportLines = request.requested_exports.length
    ? request.requested_exports
        .slice(0, 24)
        .map((item, index) => {
          const commands = commandSequenceFor(request.run_date, item).map(formatCommandLine).join("\n");
          return `${index + 1}. \`${item.candidate_id}\` (${item.recommended_import_type}, rank ${item.import_rank})
   - Topic: ${item.topic || "n/a"}
   - Query/topic: ${item.query_or_topic_to_validate || "n/a"}
   - Need: ${item.owner_must_provide}
   - Staging: \`${item.staging_csv_path}\`
   - Destination: \`${item.final_destination_path}\`
	   - Required fields: ${item.required_review_fields || "n/a"}
	   - Command sequence:
${commands}
	   - Optional scaffold command after packet approval: \`${scaffoldCommandFor(request.run_date)}\``;
        })
        .join("\n")
    : "- No remaining manifest rows were available.";
  const sourceOrder = request.source_order.map((item) => `- ${item}`).join("\n");
  const markdown = `# Demand Source Request

Run date: ${request.run_date}
Generated at: ${request.generated_at}
Status: ${request.status}
Source probe lock: ${request.source_probe_lock.active ? "active" : "inactive"}
Blocked no-row acquisitions: ${request.blocked_no_reviewed_rows}
Recommended action: ${request.recommended_action}

## Source Order

${sourceOrder}

## Normalization Route

${request.normalization_guidance}

Source-specific alternate route: ${request.source_specific_alternate_route}

## Requested Exports

${exportLines}

## Rule

${request.rule}
`;
  fs.writeFileSync(filePath, markdown);
}

function writeMarkdown(filePath, report) {
  const blockedLines = report.blocked_reports.length
    ? report.blocked_reports
        .slice(0, 12)
        .map((item) => `- \`${item.task_id}\` (${item.reason_code}): ${item.blocked_reason || "No blocked reason recorded."}`)
        .join("\n")
    : "- None.";
  const markdown = `# Demand Acquisition Report Rollup

Run date: ${report.run_date}
Generated at: ${report.generated_at}

## Summary

- Total reports: ${report.summary.total_reports}
- Staged reviewed rows reports: ${report.summary.staged_reviewed_rows}
- Current staged reviewed rows reports: ${report.summary.current_staged_reviewed_rows}
- Current staged row total: ${report.summary.current_staged_row_total}
- Stale/already-handled staged reports: ${report.summary.stale_staged_reviewed_rows}
- Source-request valid for promotion: ${report.summary.source_request_valid_for_promotion}
- Source-request promoted: ${report.summary.source_request_promoted}
- Source-request blocked: ${report.summary.source_request_blocked}
- Source-request empty staging: ${report.summary.source_request_empty_staging}
- Blocked no reviewed rows reports: ${report.summary.blocked_no_reviewed_rows}
- Rows added total: ${report.summary.rows_added_total}
- Recommended action: ${report.recommended_action}
- Source request: ${report.source_request?.status || "missing"}${report.source_request?.markdown_path ? ` (${report.source_request.markdown_path})` : ""}

## Status Counts

\`\`\`json
${JSON.stringify(report.summary.by_status, null, 2)}
\`\`\`

## Reason Counts

\`\`\`json
${JSON.stringify(report.summary.by_reason_code, null, 2)}
\`\`\`

## Blocked Reports

${blockedLines}

## Source-First Policy

If three or more acquisition attempts are blocked with no reviewed rows, do not launch another exact-query worker unless a real accessible export source has already been identified. Choose the source first, then the candidate. Approved options include verified Google Search Console exports, owner-supplied Ahrefs, Semrush, AlsoAsked, or AnswerThePublic exports paired with demand validation; verified Bing Webmaster exports; manual Google Trends CSV/API exports; or another approved demand-bearing source. Discovery-only sources still cannot unlock intake without a separate demand-bearing validation source. If no export source is accessible, ask the owner for one instead of retrying rate-limited or empty sources.

## Rule

This rollup summarizes acquisition attempts only. It does not validate demand, promote imports, scaffold packets, approve publishing, or convert discovery-only rows into evidence.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks"));
  const reports = readReports(root, runDate);
  const blockedReports = reports.filter((item) => item.status === "blocked_no_reviewed_rows");
  const stagedReviewedRows = reports.filter((item) => item.status === "staged_reviewed_rows").length;
  const stagedState = currentStagedRows(root, runDate, reports);
  const validation = validationSummary(root, runDate);
  const summary = {
    total_reports: reports.length,
    staged_reviewed_rows: stagedReviewedRows,
    current_staged_reviewed_rows: stagedState.current_staged_reviewed_rows,
    current_staged_row_total: stagedState.current_staged_row_total,
    stale_staged_reviewed_rows: stagedState.stale_staged_reviewed_rows,
    source_request_valid_for_promotion: validation.valid_for_promotion,
    source_request_promoted: validation.promoted,
    source_request_blocked: validation.blocked,
    source_request_empty_staging: validation.empty_staging,
    blocked_no_reviewed_rows: blockedReports.length,
    rows_added_total: reports.reduce((total, item) => total + (Number.isFinite(item.rows_added) ? item.rows_added : 0), 0),
    by_status: countBy(reports, "status"),
    by_reason_code: countBy(blockedReports, "reason_code"),
  };
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    summary,
    recommended_action: recommendedAction(summary),
    reports,
    current_staged_reports: stagedState.current_rows,
    stale_staged_reports: stagedState.stale_rows,
    validation_report: validation,
    blocked_reports: blockedReports,
    rule: "This rollup summarizes acquisition attempts only. It does not validate demand, promote imports, scaffold packets, approve publishing, or convert discovery-only rows into evidence.",
  };
  const jsonPath = path.join(outputDir, "report-rollup.json");
  const markdownPath = path.join(outputDir, "report-rollup.md");
  const sourceRequestPath = path.join(outputDir, "source-request.json");
  const sourceRequestMarkdownPath = path.join(outputDir, "source-request.md");
  const sourceRequest = buildSourceRequest(root, runDate, report);
  writeJsonAtomic(sourceRequestPath, sourceRequest);
  writeSourceRequestMarkdown(sourceRequestMarkdownPath, sourceRequest);
  report.source_request = {
    status: sourceRequest.status,
    recommended_action: sourceRequest.recommended_action,
    requested_export_count: sourceRequest.requested_export_count,
    json_path: relative(root, sourceRequestPath),
    markdown_path: relative(root, sourceRequestMarkdownPath),
  };
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        report_rollup_json: relative(root, jsonPath),
        report_rollup_md: relative(root, markdownPath),
        total_reports: summary.total_reports,
        blocked_no_reviewed_rows: summary.blocked_no_reviewed_rows,
        current_staged_reviewed_rows: summary.current_staged_reviewed_rows,
        stale_staged_reviewed_rows: summary.stale_staged_reviewed_rows,
        recommended_action: report.recommended_action,
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
