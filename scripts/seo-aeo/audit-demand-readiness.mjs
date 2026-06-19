#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const REPORT_HEADERS = [
  "date",
  "candidate_id",
  "topic_id",
  "topic",
  "topic_score",
  "priority",
  "recommended_import_type",
  "import_rank",
  "primary_recommended_import",
  "query_or_topic_to_validate",
  "staging_csv_path",
  "final_destination_path",
  "required_review_fields",
  "staging_rows",
  "destination_rows",
  "staging_builder_readable_rows",
  "destination_builder_readable_rows",
  "staging_validated_rows",
  "destination_validated_rows",
  "validation_status",
  "readiness_status",
  "notes",
];

const VALIDATED_DEMAND_SOURCES = new Set([
  "bing_webmaster_query_export",
  "google_trends_csv_export",
  "google_trends_api_export",
  "gsc_emerging_query_export",
]);

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

function cell(row, header) {
  const found = Object.entries(row).find(([key]) => key.trim().toLowerCase() === header.trim().toLowerCase());
  return String(found?.[1] ?? "").trim();
}

function hasAny(row, headers) {
  return headers.some((header) => cell(row, header));
}

function importedQueryText(row) {
  return hasAny(row, ["query", "question", "keyword", "search term", "search query", "term", "topic", "related query", "rising query", "prompt"]);
}

function affirmative(value) {
  return ["yes", "true", "validated", "approved", "reviewed"].includes(String(value || "").trim().toLowerCase());
}

function sourceTypeForImportType(importType) {
  if (importType === "reviewed_generic_query_tool_export") return "other_query_tool_export";
  if (importType === "gsc_search_query_export") return "gsc_emerging_query_export";
  return importType || "unknown";
}

function builderReadableRows(rows) {
  return rows.filter(importedQueryText).length;
}

function validatedRowsFor(importType, rows) {
  if (!rows.length) return 0;
  const readableRows = rows.filter(importedQueryText);
  if (VALIDATED_DEMAND_SOURCES.has(importType)) return readableRows.length;
  if (importType === "reviewed_generic_query_tool_export") {
    return readableRows.filter((row) => affirmative(cell(row, "validated_demand")) && cell(row, "validation_source") && cell(row, "reviewed_by")).length;
  }
  return 0;
}

function expectedHeadersFor(importType) {
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") return ["date", "source", "property_id", "reviewed_by", "query"];
  if (importType === "google_trends_csv_export") return ["date", "query", "country", "language"];
  if (importType === "bing_webmaster_query_export") return ["source", "Date", "Search Keywords", "Clicks", "Impressions"];
  if (importType === "reviewed_generic_query_tool_export") return ["source", "query", "validated_demand", "validation_source", "reviewed_by"];
  return [];
}

function missingHeaders(headers, required) {
  const normalized = new Set(headers.map((header) => header.trim().toLowerCase()));
  return required.filter((header) => !normalized.has(header.trim().toLowerCase()));
}

function validationStatus(importType, parsed) {
  const missing = missingHeaders(parsed.headers, expectedHeadersFor(importType));
  if (missing.length) return `blocked_missing_headers:${missing.join("|")}`;
  if (!parsed.rows.length) return "empty";
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") {
    const errors = parsed.rows.flatMap((row, index) => {
      const rowErrors = [];
      if (!cell(row, "date")) rowErrors.push(`row_${index + 1}:missing_date`);
      if (!cell(row, "source")) rowErrors.push(`row_${index + 1}:missing_source`);
      if (!cell(row, "property_id")) rowErrors.push(`row_${index + 1}:missing_property_id`);
      if (!cell(row, "reviewed_by")) rowErrors.push(`row_${index + 1}:missing_reviewed_by`);
      if (!cell(row, "query")) rowErrors.push(`row_${index + 1}:missing_query`);
      if (!hasAny(row, ["clicks", "impressions", "avg_position"])) rowErrors.push(`row_${index + 1}:missing_clicks_impressions_or_avg_position`);
      return rowErrors;
    });
    return errors.length ? `blocked:${errors.slice(0, 5).join("|")}` : "valid_for_promotion";
  }
  if (importType === "google_trends_csv_export") {
    const errors = parsed.rows.flatMap((row, index) => {
      const rowErrors = [];
      if (!cell(row, "date")) rowErrors.push(`row_${index + 1}:missing_date`);
      if (!cell(row, "query")) rowErrors.push(`row_${index + 1}:missing_query`);
      if (!hasAny(row, ["term", "topic"])) rowErrors.push(`row_${index + 1}:missing_term_or_topic`);
      return rowErrors;
    });
    return errors.length ? `blocked:${errors.slice(0, 5).join("|")}` : "valid_for_promotion";
  }
  if (importType === "bing_webmaster_query_export") {
    const errors = parsed.rows.flatMap((row, index) => {
      const rowErrors = [];
      if (!cell(row, "Date")) rowErrors.push(`row_${index + 1}:missing_Date`);
      if (!cell(row, "Search Keywords")) rowErrors.push(`row_${index + 1}:missing_Search Keywords`);
      if (!hasAny(row, ["Clicks", "Impressions"])) rowErrors.push(`row_${index + 1}:missing_clicks_or_impressions`);
      return rowErrors;
    });
    return errors.length ? `blocked:${errors.slice(0, 5).join("|")}` : "valid_for_promotion";
  }
  if (importType === "reviewed_generic_query_tool_export") {
    const errors = parsed.rows.flatMap((row, index) => {
      const rowErrors = [];
      if (!cell(row, "source")) rowErrors.push(`row_${index + 1}:missing_source`);
      if (!cell(row, "query")) rowErrors.push(`row_${index + 1}:missing_query`);
      if (!affirmative(cell(row, "validated_demand"))) rowErrors.push(`row_${index + 1}:validated_demand_not_approved`);
      if (!cell(row, "validation_source")) rowErrors.push(`row_${index + 1}:missing_validation_source`);
      if (!cell(row, "reviewed_by")) rowErrors.push(`row_${index + 1}:missing_reviewed_by`);
      return rowErrors;
    });
    return errors.length ? `blocked:${errors.slice(0, 5).join("|")}` : "valid_for_promotion";
  }
  return "unknown_import_type";
}

function safePath(root, value) {
  if (!value) return "";
  const absolute = path.resolve(root, value);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) return "";
  return absolute;
}

function rowReadiness(row) {
  if (row.destination_rows > 0 && row.destination_builder_readable_rows === 0) return "promoted_rows_builder_unreadable";
  if (row.destination_rows > 0) return row.destination_validated_rows > 0 ? "promoted_validated_rows_present" : "promoted_rows_not_validated";
  if (row.staging_rows > 0 && row.validation_status === "valid_for_promotion" && row.staging_builder_readable_rows === 0) {
    return "validator_valid_but_builder_unreadable";
  }
  if (row.staging_rows > 0) return row.validation_status === "valid_for_promotion" ? "staged_valid_for_promotion" : "staged_blocked";
  return "missing_reviewed_export";
}

function candidateIndex(root, runDate) {
  const { rows } = readCsv(path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv"));
  return new Map(rows.map((row) => [row.candidate_id, row]));
}

function rowReport(root, runDate, manifestRow, candidatesById) {
  const stagingPath = safePath(root, manifestRow.staging_csv_path);
  const destinationPath = safePath(root, manifestRow.final_destination_path);
  const stagingParsed = stagingPath ? readCsv(stagingPath) : { headers: [], rows: [] };
  const destinationParsed = destinationPath ? readCsv(destinationPath) : { headers: [], rows: [] };
  const importType = manifestRow.recommended_import_type;
  const candidate = candidatesById.get(manifestRow.candidate_id) || {};
  const validation = stagingPath && fs.existsSync(stagingPath) ? validationStatus(importType, stagingParsed) : "missing_staging_file";
  const report = {
    date: runDate,
    candidate_id: manifestRow.candidate_id,
    topic_id: candidate.topic_id || "",
    topic: candidate.topic || "",
    topic_score: candidate.topic_score_guess || "",
    priority: manifestRow.priority || "",
    source_readiness: candidate.source_readiness || "",
    gate_reasons: candidate.gate_reasons || "",
    packet_intake_status: candidate.packet_intake_status || "",
    aeo_question: candidate.aeo_question || "",
    intent: candidate.intent || "",
    recommended_import_type: importType,
    import_rank: manifestRow.import_rank,
    primary_recommended_import: manifestRow.primary_recommended_import,
    query_or_topic_to_validate: manifestRow.query_or_topic_to_validate || candidate.aeo_question || candidate.topic || "",
    staging_csv_path: manifestRow.staging_csv_path,
    final_destination_path: manifestRow.final_destination_path,
    required_review_fields: manifestRow.required_review_fields || "",
    staging_rows: stagingParsed.rows.length,
    destination_rows: destinationParsed.rows.length,
    staging_builder_readable_rows: builderReadableRows(stagingParsed.rows),
    destination_builder_readable_rows: builderReadableRows(destinationParsed.rows),
    staging_validated_rows: validatedRowsFor(importType, stagingParsed.rows),
    destination_validated_rows: validatedRowsFor(importType, destinationParsed.rows),
    validation_status: validation,
    readiness_status: "",
    notes: "",
  };
  report.readiness_status = rowReadiness(report);
  report.notes =
    report.readiness_status === "missing_reviewed_export"
      ? "No reviewed staging rows and no promoted destination rows."
      : report.readiness_status === "validator_valid_but_builder_unreadable"
        ? "The validator would allow promotion, but build-discovery-run.mjs would not read any query text from this file."
        : report.readiness_status === "promoted_rows_builder_unreadable"
          ? "Rows are promoted, but build-discovery-run.mjs would not read any query text from this file."
      : report.readiness_status === "staged_valid_for_promotion"
        ? "Run run-demand-promotion.mjs --apply before rebuilding discovery or scaffolding."
        : report.readiness_status === "promoted_validated_rows_present"
          ? "Promoted rows can be consumed by build-discovery-run.mjs."
          : "Rows exist but validation blocks handoff readiness.";
  return report;
}

function priorityWeight(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "P0") return 0;
  if (normalized === "P1") return 1;
  if (normalized === "P2") return 2;
  if (normalized === "P3") return 3;
  return 9;
}

function importTypeSourceLabel(importType) {
  if (importType === "reviewed_generic_query_tool_export") return "reviewed query-tool export";
  if (importType === "gsc_search_query_export" || importType === "gsc_emerging_query_export") return "verified-property Google Search Console export";
  if (importType === "google_trends_csv_export") return "manual Google Trends CSV/API export";
  if (importType === "bing_webmaster_query_export") return "verified-property Bing Webmaster export";
  return importType || "approved export";
}

function chooseNextUnambiguousAction(rows, existingDiscovery, projected) {
  if (projected.hard_gate_status === "prerequisites_present_needs_discovery_rebuild") {
    return {
      action: "run_validated_demand_apply_and_discovery_chain",
      reason: "The staged or promoted rows appear sufficient for hard query-handoff prerequisites. Rebuild discovery before packet intake.",
      command_chain: [
        "node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --dry-run",
        "node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --apply --approval-marker DEMAND-PROMOTION-APPROVED:<run-date>",
        "Optional after reviewing the promotion report and receiving packet approval: node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --apply --scaffold-limit 1",
      ],
    };
  }

  const candidates = rows
    .filter((row) => row.readiness_status === "missing_reviewed_export")
    .filter((row) => String(row.primary_recommended_import || "").toLowerCase() === "yes")
    .filter((row) => Number(row.import_rank || 0) === 1)
    .filter((row) => row.topic_id)
    .sort((a, b) => {
      const sourceReadyDelta = (a.source_readiness === "ready" ? 0 : 1) - (b.source_readiness === "ready" ? 0 : 1);
      if (sourceReadyDelta) return sourceReadyDelta;
      const priorityDelta = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (priorityDelta) return priorityDelta;
      return Number(b.topic_score || 0) - Number(a.topic_score || 0);
    });

  const selected = candidates[0] || rows.find((row) => row.readiness_status === "missing_reviewed_export" && row.topic_id) || null;
  if (!selected) {
    return {
      action: "review_demand_import_worklist",
      reason: "No single missing reviewed export could be selected from the current demand import pack.",
    };
  }

  const existingRows = Number(existingDiscovery.rows || 0);
  const minimumRowsNeeded = Math.max(1, 5 - existingRows);
  const sourceLabel = importTypeSourceLabel(selected.recommended_import_type);
  return {
    action: "fill_one_reviewed_demand_export",
    candidate_id: selected.candidate_id,
    topic_id: selected.topic_id,
    topic: selected.topic,
    topic_score: selected.topic_score,
    priority: selected.priority,
    source_readiness: selected.source_readiness,
    recommended_import_type: selected.recommended_import_type,
    import_rank: selected.import_rank,
    source_label: sourceLabel,
    query_or_topic_to_validate: selected.query_or_topic_to_validate,
    staging_csv_path: selected.staging_csv_path,
    final_destination_path: selected.final_destination_path,
    required_review_fields: selected.required_review_fields,
    minimum_builder_readable_rows_needed: minimumRowsNeeded,
    reason:
      `${selected.candidate_id} is the highest-priority mapped candidate with a rank-1 missing reviewed export. ` +
      `Fill its ${sourceLabel} first so the query handoff can gain validated demand and stop treating this topic as monitor-only.`,
    rules: [
      "Use real reviewed export rows only; do not invent demand data.",
      "Discovery tools can validate search language only when the required review fields are populated.",
      "Do not cite query-tool, autocomplete, PAA, or AI-answer rows as public factual evidence.",
      "After filling the staging CSV, run the demand-promotion dry-run before applying or scaffolding anything.",
    ],
    command_chain_after_filling: [
      "node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --dry-run",
      "node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --apply --approval-marker DEMAND-PROMOTION-APPROVED:<run-date>",
      "Optional after reviewing the promotion report and receiving packet approval: node scripts/seo-aeo/run-demand-promotion.mjs --date <run-date> --apply --scaffold-limit 1",
    ],
  };
}

function readExistingDiscovery(root, runDate) {
  const dir = path.join(root, "research", "trend-intelligence", `${runDate}-daily-discovery`);
  const rows = readCsv(path.join(dir, "normalized-discovery-queries.csv")).rows;
  return {
    path: fs.existsSync(dir) ? relative(root, dir) : "",
    rows: rows.length,
    source_types: Array.from(new Set(rows.map((row) => row.source_type).filter(Boolean))),
    validated_rows: rows.filter((row) => {
      if (VALIDATED_DEMAND_SOURCES.has(row.source_type)) return true;
      return row.source_type === "other_query_tool_export" && affirmative(row.validated_demand) && row.validation_source && row.reviewed_by;
    }).length,
    row_details: rows.map((row) => ({
      topic_id: row.topic_id || "",
      intent: row.intent || "",
      source_type: row.source_type || "",
      validated:
        VALIDATED_DEMAND_SOURCES.has(row.source_type) ||
        (row.source_type === "other_query_tool_export" && affirmative(row.validated_demand) && row.validation_source && row.reviewed_by),
      performance: row.source_type === "gsc_emerging_query_export",
    })),
  };
}

function projectedSummary(rows, existing) {
  const promotedRows = rows.filter((row) => Number(row.destination_rows || 0) > 0);
  const stagedRows = rows.filter((row) => row.readiness_status === "staged_valid_for_promotion");
  const promotedRowCount = promotedRows.reduce((sum, row) => sum + Number(row.destination_builder_readable_rows || 0), 0);
  const stagedRowCount = stagedRows.reduce((sum, row) => sum + Number(row.staging_builder_readable_rows || 0), 0);
  const promotedValidatedRows = promotedRows.reduce((sum, row) => sum + Number(row.destination_validated_rows || 0), 0);
  const stagedValidatedRows = stagedRows.reduce((sum, row) => sum + Number(row.staging_validated_rows || 0), 0);
  const promotedSourceTypes = new Set(promotedRows.filter((row) => row.destination_builder_readable_rows > 0).map((row) => sourceTypeForImportType(row.recommended_import_type)));
  const stagedSourceTypes = new Set(stagedRows.filter((row) => row.staging_builder_readable_rows > 0).map((row) => sourceTypeForImportType(row.recommended_import_type)));
  const existingSourceTypes = new Set(existing.source_types || []);
  const projectedSourceTypesAfterApply = new Set([...existingSourceTypes, ...promotedSourceTypes, ...stagedSourceTypes]);
  const projectedRowsAfterApply = Number(existing.rows || 0) + stagedRowCount + promotedRowCount;
  const projectedValidatedRowsAfterApply = Number(existing.validated_rows || 0) + stagedValidatedRows + promotedValidatedRows;
  const projectedClusters = projectedClusterSummary(rows, existing);

  const hardGateStatus =
    projectedRowsAfterApply >= 5 &&
    projectedSourceTypesAfterApply.size >= 2 &&
    projectedValidatedRowsAfterApply > 0 &&
    projectedClusters.non_monitor_cluster_count >= 1
      ? "prerequisites_present_needs_discovery_rebuild"
      : "missing_handoff_prerequisites";

  const missing = [];
  if (projectedRowsAfterApply < 5) missing.push(`needs_at_least_5_rows:projected_${projectedRowsAfterApply}`);
  if (projectedSourceTypesAfterApply.size < 2) missing.push(`needs_at_least_2_source_types:projected_${projectedSourceTypesAfterApply.size}`);
  if (projectedValidatedRowsAfterApply < 1) missing.push("needs_validated_demand_row");
  if (projectedClusters.non_monitor_cluster_count < 1) missing.push("needs_non_monitor_cluster");

  return {
    promoted_row_count: promotedRowCount,
    staged_row_count: stagedRowCount,
    promoted_validated_rows: promotedValidatedRows,
    staged_validated_rows: stagedValidatedRows,
    projected_rows_after_apply: projectedRowsAfterApply,
    projected_validated_rows_after_apply: projectedValidatedRowsAfterApply,
    projected_source_types_after_apply: Array.from(projectedSourceTypesAfterApply).sort(),
    projected_non_monitor_cluster_count: projectedClusters.non_monitor_cluster_count,
    topic_id_resolved_count: projectedClusters.topic_id_resolved_count,
    projected_candidate_clusters: projectedClusters.candidate_clusters,
    hard_gate_status: hardGateStatus,
    missing_prerequisites: missing,
    caveat:
      "This preflight checks hard handoff prerequisites only. build-discovery-run.mjs must still rebuild clusters and produce at least one non-monitor handoff candidate.",
  };
}

function projectedClusterSummary(rows, existing) {
  const groups = new Map();
  const ensureGroup = (key) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        topic_id: "",
        source_types: new Set(),
        validated_rows: 0,
        has_performance: false,
        projected_rows: 0,
      });
    }
    return groups.get(key);
  };

  for (const row of existing.row_details || []) {
    const key = row.topic_id || "unmapped_existing";
    const group = ensureGroup(key);
    group.topic_id = row.topic_id || group.topic_id;
    if (row.source_type) group.source_types.add(row.source_type);
    if (row.validated) group.validated_rows += 1;
    if (row.performance) group.has_performance = true;
    group.projected_rows += 1;
  }

  for (const row of rows) {
    const projectedCount =
      Number(row.destination_builder_readable_rows || 0) +
      (row.readiness_status === "staged_valid_for_promotion" ? Number(row.staging_builder_readable_rows || 0) : 0);
    if (!projectedCount) continue;
    const key = row.topic_id || row.candidate_id;
    const group = ensureGroup(key);
    group.topic_id = row.topic_id || group.topic_id;
    const sourceType = sourceTypeForImportType(row.recommended_import_type);
    group.source_types.add(sourceType);
    group.validated_rows +=
      Number(row.destination_validated_rows || 0) +
      (row.readiness_status === "staged_valid_for_promotion" ? Number(row.staging_validated_rows || 0) : 0);
    group.has_performance = group.has_performance || sourceType === "gsc_emerging_query_export";
    group.projected_rows += projectedCount;
  }

  const candidateClusters = Array.from(groups.values()).map((group) => {
    const sourceTypes = Array.from(group.source_types).sort();
    const nonMonitor = Boolean(group.topic_id) && (group.has_performance || (sourceTypes.length >= 2 && group.validated_rows > 0));
    return {
      key: group.key,
      topic_id: group.topic_id,
      source_types: sourceTypes,
      validated_rows: group.validated_rows,
      projected_rows: group.projected_rows,
      projected_decision: nonMonitor ? (group.has_performance ? "refresh_packet_possible" : "map_as_section_or_faq_possible") : "monitor",
    };
  });

  return {
    non_monitor_cluster_count: candidateClusters.filter((cluster) => cluster.projected_decision !== "monitor").length,
    topic_id_resolved_count: candidateClusters.filter((cluster) => cluster.topic_id).length,
    candidate_clusters: candidateClusters.slice(0, 24),
  };
}

function writeMarkdown(filePath, report) {
  const rowLines = report.rows.length
    ? report.rows
        .filter((row) => row.primary_recommended_import === "yes" || row.staging_rows > 0 || row.destination_rows > 0)
        .slice(0, 80)
        .map(
          (row) =>
            `- ${row.readiness_status}: ${row.candidate_id} rank ${row.import_rank} ${row.recommended_import_type}; staging ${row.staging_rows} (${row.staging_builder_readable_rows} builder-readable), destination ${row.destination_rows} (${row.destination_builder_readable_rows} builder-readable); ${row.notes}`
        )
        .join("\n")
    : "- No demand import rows found.";

  const action = report.next_unambiguous_action || {};
  const actionLines =
    action.action === "fill_one_reviewed_demand_export"
      ? [
          `- Action: ${action.action}`,
          `- Candidate: ${action.candidate_id}`,
          `- Topic: ${action.topic}`,
          `- Import: rank ${action.import_rank} ${action.recommended_import_type}`,
          `- Validate: ${action.query_or_topic_to_validate}`,
          `- Staging CSV: ${action.staging_csv_path}`,
          `- Final destination: ${action.final_destination_path}`,
          `- Required fields: ${action.required_review_fields}`,
          `- Minimum builder-readable rows needed now: ${action.minimum_builder_readable_rows_needed}`,
          `- Reason: ${action.reason}`,
        ].join("\n")
      : [
          `- Action: ${action.action || "none"}`,
          `- Reason: ${action.reason || "No action selected."}`,
        ].join("\n");
  const commandLines = (action.command_chain_after_filling || action.command_chain || [])
    .map((command) => `- \`${command.replaceAll("<run-date>", report.run_date)}\``)
    .join("\n");

  const markdown = `# Demand Readiness Preflight

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Overall status: ${report.overall_status}

## Projected Hard Gates

- Projected rows after apply: ${report.projected.projected_rows_after_apply}
- Projected source types after apply: ${report.projected.projected_source_types_after_apply.join(", ") || "none"}
- Projected validated rows after apply: ${report.projected.projected_validated_rows_after_apply}
- Projected non-monitor clusters after apply: ${report.projected.projected_non_monitor_cluster_count}
- Topic ID resolved clusters: ${report.projected.topic_id_resolved_count}
- Hard gate status: ${report.projected.hard_gate_status}
- Missing prerequisites: ${report.projected.missing_prerequisites.join(", ") || "none"}

## Next Unambiguous Action

${actionLines}

${commandLines ? `### After Filling Real Rows\n\n${commandLines}\n` : ""}

## Rule

This preflight does not promote files, create demand data, unlock packet intake, or prove that a query handoff is ready. It predicts whether staged/promoted demand rows are sufficient to justify running the guarded demand-promotion path.

${report.projected.caveat}

## Rows

${rowLines}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const manifestPath = path.join(outputDir, "demand-import-pack", "manifest.json");
  const manifest = readJson(manifestPath, {});
  const candidatesById = candidateIndex(root, runDate);
  const rows = (manifest.review_rows || []).map((row) => rowReport(root, runDate, row, candidatesById));
  const existingDiscovery = readExistingDiscovery(root, runDate);
  const projected = projectedSummary(rows, existingDiscovery);
  const nextUnambiguousAction = chooseNextUnambiguousAction(rows, existingDiscovery, projected);
  const status =
    rows.some((row) => row.readiness_status === "staged_valid_for_promotion")
      ? "staged_rows_ready_for_apply"
      : rows.some((row) => row.readiness_status === "promoted_validated_rows_present")
        ? "promoted_rows_ready_for_discovery_rebuild"
        : "needs_reviewed_exports";
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    overall_status: status,
    source_manifest_path: fs.existsSync(manifestPath) ? relative(root, manifestPath) : "",
    existing_discovery: existingDiscovery,
    projected,
    next_unambiguous_action: nextUnambiguousAction,
    by_readiness_status: Object.fromEntries(
      Array.from(new Set(rows.map((row) => row.readiness_status))).map((statusKey) => [
        statusKey,
        rows.filter((row) => row.readiness_status === statusKey).length,
      ])
    ),
    rows,
  };

  const jsonPath = path.join(outputDir, "demand-readiness-preflight.json");
  const csvPath = path.join(outputDir, "demand-readiness-preflight.csv");
  const mdPath = path.join(outputDir, "demand-readiness-preflight.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, REPORT_HEADERS, rows);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        overall_status: status,
        projected: report.projected,
        json_path: relative(root, jsonPath),
        markdown_path: relative(root, mdPath),
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
