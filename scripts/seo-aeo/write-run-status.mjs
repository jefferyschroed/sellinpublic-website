#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { artifactSnapshot } from "./lib/artifact-identity.mjs";
import { ensureDir, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv } from "./lib/csv.mjs";
import { daysAgo, today } from "./lib/dates.mjs";
import { pageFeedbackRollup } from "./lib/scoring.mjs";
import { summarizeSubagentStatusLedger } from "./lib/subagent-status-ledger.mjs";
import {
  isActiveEvidenceBackedContentDecision,
  isOpenContentDecisionLifecycle,
} from "./lib/content-decisions.mjs";

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

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function timeMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function artifactFreshness(root, report, sourcePaths) {
  const reportGeneratedAt = report?.generated_at || "";
  const reportTime = timeMs(reportGeneratedAt);
  const storedSnapshots = Object.values(report?.source_snapshot || {}).filter((snapshot) => snapshot?.path);
  const storedByPath = new Map(storedSnapshots.map((snapshot) => [normalizePath(snapshot.path), snapshot]));
  const sources = sourcePaths.map((sourcePath) => {
    const current = artifactSnapshot(root, sourcePath);
    const stored = storedByPath.get(normalizePath(sourcePath)) || {};
    const newerThanReport = Boolean(reportTime && timeMs(current.generated_at) > reportTime + 1000);
    const hashChanged = Boolean(stored.sha256 && current.sha256 && stored.sha256 !== current.sha256);
    const existenceChanged = Boolean("exists" in stored && stored.exists !== current.exists);
    return {
      ...current,
      stored_generated_at: stored.generated_at || "",
      stored_sha256: stored.sha256 || "",
      newer_than_report: newerThanReport,
      hash_changed_since_review: hashChanged,
      existence_changed_since_review: existenceChanged,
    };
  });
  const staleSources = sources
    .filter((source) => source.newer_than_report || source.hash_changed_since_review || source.existence_changed_since_review)
    .map((source) => source.path);
  return {
    report_generated_at: reportGeneratedAt,
    status: !reportGeneratedAt ? "unknown" : staleSources.length ? "stale" : "fresh",
    stale_source_files: staleSources,
    sources,
  };
}

function actionRank(action) {
  const match = String(action.priority || "P9").toUpperCase().match(/^P(\d+)/);
  return match ? Number(match[1]) : 9;
}

function actionTieBreak(action) {
  const order = {
    regenerate_deploy_review_packet: 0,
    fix_live_deployment_routes: 1,
    review_deploy_packet_for_approval: 2,
    run_demand_promotion: 3,
    provide_reviewed_demand_source_access: 4,
  };
  return order[action.action] ?? 50;
}

function sortActions(actions) {
  return [...actions].sort((a, b) => actionRank(a) - actionRank(b) || actionTieBreak(a) - actionTieBreak(b));
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output || "{}");
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

function rowCount(root, filePath) {
  return readCsv(path.join(root, filePath)).rows.length;
}

function searchQueryRowCount(root, source) {
  return readCsv(path.join(root, "analytics", "search_query_daily.csv")).rows.filter((row) => row.source === source).length;
}

function isGa4OwnedRow(row) {
  return (
    String(row.source_export_id || "").startsWith("ga4:") ||
    row.source_file === "google-analytics-data-api" ||
    String(row.captured_by || "").includes("pull-ga4.mjs")
  );
}

function csvRowCount(filePath) {
  return readCsv(filePath).rows.length;
}

function csvFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv") && !entry.name.startsWith("."))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function yamlClusterCount(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const source = fs.readFileSync(filePath, "utf8");
  const matches = source.match(/^\s+-\s+cluster_id:/gm);
  return matches ? matches.length : 0;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = String(row[key] || "missing").trim() || "missing";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function stepByName(report, name) {
  return (report?.steps || []).find((step) => step.name === name) || null;
}

function parsedStep(report, name) {
  const step = stepByName(report, name);
  return {
    step,
    parsed: parseJsonOutput(step?.output),
  };
}

function safeCredentialSummary(root, config) {
  const mode = config.google?.credentialMode || process.env.GOOGLE_CREDENTIAL_MODE || "auto";
  const oauthPath = process.env.GOOGLE_OAUTH_CREDENTIALS || config.google?.oauthCredentialJsonPath || "";
  const servicePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || config.google?.serviceAccountJsonPath || "";
  const oauthAbsolute = oauthPath ? path.resolve(root, oauthPath) : "";
  const serviceAbsolute = servicePath ? path.resolve(root, servicePath) : "";
  const oauth = readJson(oauthAbsolute, {});
  const service = readJson(serviceAbsolute, {});

  return {
    credential_mode: mode,
    oauth_credentials: {
      path: oauthPath ? relative(root, oauthAbsolute) : "",
      exists: Boolean(oauthAbsolute && fs.existsSync(oauthAbsolute)),
      has_refresh_token: Boolean(oauth?.refresh_token),
      authorized_identity_recorded: Boolean(oauth?.authorized_email),
    },
    service_account_credentials: {
      path: servicePath ? relative(root, serviceAbsolute) : "",
      exists: Boolean(serviceAbsolute && fs.existsSync(serviceAbsolute)),
      client_identity_recorded: Boolean(service?.client_email),
    },
  };
}

function googleSummary(root, config, dailyReport) {
  const { parsed: ga4Output, step: ga4Step } = parsedStep(dailyReport, "Pull GA4 page metrics");
  const { parsed: gscOutput, step: gscStep } = parsedStep(dailyReport, "Pull GSC query metrics");
  const credentials = safeCredentialSummary(root, config);
  const pageRows = readCsv(path.join(root, "analytics", "page_daily.csv")).rows;
  const ga4Rows = pageRows.filter(isGa4OwnedRow);

  return {
    credentials,
    ga4: {
      step_status: ga4Step?.status || "missing",
      start_date: ga4Output?.startDate || "",
      end_date: ga4Output?.endDate || "",
      source_rows: ga4Output?.sourceRows ?? null,
      normalized_rows: ga4Output?.normalizedRows ?? null,
      rows_written: ga4Output?.rowsWritten ?? null,
      total_rows: ga4Output?.ga4TotalRows ?? ga4Rows.length,
      all_page_daily_rows: pageRows.length,
      output_path: ga4Output?.path ? relative(root, ga4Output.path) : "analytics/page_daily.csv",
    },
    search_console: {
      step_status: gscStep?.status || "missing",
      start_date: gscOutput?.startDate || "",
      end_date: gscOutput?.endDate || "",
      source_rows: gscOutput?.sourceRows ?? null,
      normalized_rows: gscOutput?.normalizedRows ?? null,
      rows_written: gscOutput?.rowsWritten ?? null,
      total_rows: searchQueryRowCount(root, "google_search_console"),
      all_search_query_rows: rowCount(root, "analytics/search_query_daily.csv"),
      output_path: gscOutput?.path ? relative(root, gscOutput.path) : "analytics/search_query_daily.csv",
    },
  };
}

function bingSummary(root, config, dailyReport) {
  const { parsed: bingOutput, step: bingStep } = parsedStep(dailyReport, "Pull Bing Webmaster query metrics");
  const configuredSiteUrl = process.env.BING_WEBMASTER_SITE_URL || config.bing?.webmasterSiteUrl || "";
  const hasApiKey = Boolean(process.env.BING_WEBMASTER_API_KEY || config.bing?.webmasterApiKey);

  return {
    credentials: {
      api_key_configured: hasApiKey,
      site_url_configured: Boolean(configuredSiteUrl),
      site_url: configuredSiteUrl,
    },
    webmaster: {
      step_status: bingStep?.status || "missing",
      start_date: bingOutput?.startDate || "",
      end_date: bingOutput?.endDate || "",
      source_rows: bingOutput?.sourceRows ?? null,
      normalized_rows: bingOutput?.normalizedRows ?? null,
      rows_written: bingOutput?.rowsWritten ?? null,
      total_rows: searchQueryRowCount(root, "bing_webmaster_tools"),
      output_path: bingOutput?.path ? relative(root, bingOutput.path) : "analytics/search_query_daily.csv",
    },
  };
}

function sourceDiagnostics(report, source) {
  const sourceReport = report?.[source] || {};
  const windows = Array.isArray(sourceReport.windows) ? sourceReport.windows : [];
  const targetRows = windows
    .filter((item) => item.id === "target_range")
    .reduce((sum, item) => sum + Number(item.row_count || 0), 0);
  const targetAllRows = windows
    .filter((item) => item.id === "target_all_data_state")
    .reduce((sum, item) => sum + Number(item.row_count || 0), 0);
  const widerRows = windows
    .filter((item) => item.id !== "target_range" && item.id !== "target_all_data_state")
    .reduce((sum, item) => sum + Number(item.row_count || 0), 0);

  let zeroRowState = "missing";
  if (!report?.status) zeroRowState = "missing";
  else if (sourceReport.access_status && sourceReport.access_status !== "ok") zeroRowState = "config_risk";
  else if (source === "gsc" && targetAllRows > 0 && targetRows === 0) zeroRowState = "recent_data_pending";
  else if (targetRows > 0 || targetAllRows > 0) zeroRowState = "not_zero";
  else if (widerRows > 0) zeroRowState = "needs_wider_window";
  else zeroRowState = "verified_empty";

  return {
    zero_row_state: zeroRowState,
    access_status: sourceReport.access_status || "missing",
    target_rows: targetRows,
    target_all_rows: targetAllRows,
    wider_rows: widerRows,
    reason: report?.reason || "",
    error: sourceReport.error || "",
  };
}

function measurementDiagnosticsSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "measurement-diagnostics.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "measurement-diagnostics.md");
  const report = readJson(jsonPath, {});
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    status: report.status || "missing",
    reason: report.reason || "",
    target_range: report.target_range || {},
    ga4: sourceDiagnostics(report, "ga4"),
    search_console: sourceDiagnostics(report, "gsc"),
  };
}

function discoverySummary(root, runDate, dailyReport) {
  const runName = `${runDate}-daily-discovery`;
  const trendDir = path.join(root, "research", "trend-intelligence", runName);
  const queryDir = path.join(root, "research", "query-intelligence", runName);
  const trendHandoff = path.join(trendDir, "brief-handoff-candidates.yaml");
  const queryHandoff = path.join(queryDir, "brief-handoff.yaml");
  const trendRowsPath = path.join(trendDir, "normalized-discovery-queries.csv");
  const trendManifestPath = path.join(trendDir, "source-manifest.json");
  const trendClustersPath = path.join(trendDir, "query-clusters.yaml");
  const queryRowsPath = path.join(queryDir, "normalized-queries.csv");
  const queryManifestPath = path.join(queryDir, "source-manifest.json");
  const queryClustersPath = path.join(queryDir, "query-clusters.yaml");
  const trendManifest = readJson(trendManifestPath, {});
  const queryManifest = readJson(queryManifestPath, {});
  const { parsed: buildOutput } = parsedStep(dailyReport, "Build daily trend/query discovery");
  const { parsed: validationOutput, step: validationStep } = parsedStep(dailyReport, "Validate current query intelligence");
  const artifactRows = fs.existsSync(queryRowsPath)
    ? csvRowCount(queryRowsPath)
    : fs.existsSync(trendRowsPath)
      ? csvRowCount(trendRowsPath)
      : null;
  const artifactSources = Array.isArray(queryManifest?.sources)
    ? queryManifest.sources.length
    : Array.isArray(trendManifest?.sources)
      ? trendManifest.sources.length
      : null;
  const artifactClusters = fs.existsSync(queryClustersPath)
    ? yamlClusterCount(queryClustersPath)
    : fs.existsSync(trendClustersPath)
      ? yamlClusterCount(trendClustersPath)
      : null;
  const normalizedRowsPath = fs.existsSync(queryRowsPath) ? queryRowsPath : trendRowsPath;
  const manifest = Array.isArray(queryManifest?.sources) ? queryManifest : trendManifest;

  return {
    run_id: runName,
    trend_dir: relative(root, trendDir),
    trend_handoff_path: fs.existsSync(trendHandoff) ? relative(root, trendHandoff) : "",
    trend_handoff_status: readYamlScalar(trendHandoff, "handoff_status") || buildOutput?.handoff_status || "missing",
    query_intelligence_dir: fs.existsSync(queryDir) ? relative(root, queryDir) : "",
    query_handoff_path: fs.existsSync(queryHandoff) ? relative(root, queryHandoff) : "",
    query_handoff_status: readYamlScalar(queryHandoff, "handoff_status") || validationOutput?.handoff_status || "missing",
    validation_status: validationStep?.status || "missing",
    rows: artifactRows ?? buildOutput?.rows ?? 0,
    clusters: artifactClusters ?? buildOutput?.clusters ?? null,
    sources: artifactSources ?? buildOutput?.sources ?? null,
    manual_reddit_capture: manualRedditCaptureSummary(root, runDate, dailyReport, normalizedRowsPath, manifest),
  };
}

function manualRedditCaptureSummary(root, runDate, dailyReport, normalizedRowsPath, manifest) {
  const importDir = path.join(root, "imports", "reddit-manual-captures");
  const inputFiles = csvFiles(importDir);
  const inputRows = inputFiles.reduce((sum, filePath) => sum + readCsv(filePath).rows.length, 0);
  const normalizedRows = fs.existsSync(normalizedRowsPath)
    ? readCsv(normalizedRowsPath).rows.filter((row) => row.source_type === "reddit_manual_capture")
    : [];
  const manifestSources = (manifest?.sources || []).filter((source) => source.source_type === "reddit_manual_capture");
  const { parsed: apiOutput, step: apiStep } = parsedStep(dailyReport, "Pull Reddit discovery trends");
  const { parsed: fixtureOutput, step: fixtureStep } = parsedStep(dailyReport, "Check manual Reddit capture lane fixture");
  let laneStatus = "no_manual_captures";
  if (normalizedRows.length > 0) laneStatus = "imported_discovery_only";
  else if (inputFiles.length > 0 || inputRows > 0) laneStatus = "inputs_present_no_normalized_rows";

  return {
    lane_status: laneStatus,
    import_dir: "imports/reddit-manual-captures",
    template_path: "docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv",
    input_file_count: inputFiles.length,
    input_row_count: inputRows,
    normalized_row_count: normalizedRows.length,
    source_count: manifestSources.length,
    api_step_status: apiStep?.status || "missing",
    api_skipped: apiOutput?.skipped === true || apiStep?.status === "skipped",
    api_used: apiStep?.status === "completed" && apiOutput?.skipped !== true,
    fixture_step_status: fixtureStep?.status || "missing",
    fixture_unsafe_rows_rejected: fixtureOutput?.unsafe_rows_rejected ?? null,
    evidence_use: "discovery_only",
    allowed_public_use: "none",
    validates_demand: false,
    validates_facts: false,
    rule:
      "Sanitized manual Reddit captures can route topic/source-gap work only. They cannot validate demand, support factual claims, or unlock packet intake without separate validated demand and source readiness.",
  };
}

function candidateSummary(root, runDate) {
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const { rows } = readCsv(planPath);
  return {
    path: fs.existsSync(planPath) ? relative(root, planPath) : "",
    total: rows.length,
    by_packet_intake_status: countBy(rows, "packet_intake_status"),
    by_asset_decision: countBy(rows, "asset_decision"),
    by_recommended_asset: countBy(rows, "recommended_asset"),
    intake_ready: rows.filter((row) => row.packet_intake_status === "intake_ready").length,
    blocked_before_packet: rows.filter((row) => row.packet_intake_status === "blocked_before_packet").length,
    not_intake_ready: rows.filter((row) => row.packet_intake_status !== "intake_ready").length,
    top_candidates: rows.slice(0, 12).map((row) => ({
      candidate_id: row.candidate_id,
      topic: row.topic,
      topic_id: row.topic_id,
      pillar_id: row.pillar_id,
      score: row.topic_score_guess,
      packet_intake_status: row.packet_intake_status,
      query_run_status: row.query_run_status,
      next_action: row.next_action,
    })),
  };
}

function demandImportWorklistSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const csvPath = path.join(dir, "demand-import-worklist.csv");
  const jsonPath = path.join(dir, "demand-import-worklist.json");
  const markdownPath = path.join(dir, "demand-import-worklist.md");
  const report = readJson(jsonPath, {});
  const rows = Array.isArray(report.rows) ? report.rows : readCsv(csvPath).rows;

  return {
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    candidate_count: report.candidate_count ?? new Set(rows.map((row) => row.candidate_id)).size,
    request_count: report.request_count ?? rows.length,
    by_recommended_import_type: countBy(rows, "recommended_import_type"),
    top_requests: rows.slice(0, 12).map((row) => ({
      candidate_id: row.candidate_id,
      topic: row.topic,
      priority: row.priority,
      import_rank: row.import_rank,
      primary_recommended_import: row.primary_recommended_import,
      priority_reason: row.priority_reason,
      recommended_import_type: row.recommended_import_type,
      destination_path: row.destination_path,
      status: row.status,
    })),
  };
}

function demandImportPackSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack");
  const manifestPath = path.join(dir, "manifest.json");
  const checklistPath = path.join(dir, "review-checklist.csv");
  const readmePath = path.join(dir, "README.md");
  const validationJsonPath = path.join(dir, "validation-report.json");
  const validationMdPath = path.join(dir, "validation-report.md");
  const manifest = readJson(manifestPath, {});
  const sourceRequestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  const sourceRequest = readJson(sourceRequestPath, {});
  let rows = Array.isArray(manifest.review_rows) ? manifest.review_rows : readCsv(checklistPath).rows;
  const sourceRequestFallbackActive = !rows.length && String(sourceRequest.status || "").startsWith("escalation_required");
  if (sourceRequestFallbackActive) {
    rows = Array.isArray(sourceRequest.requested_exports) ? sourceRequest.requested_exports : [];
  }
  const validation = readJson(validationJsonPath, {});

  return {
    output_dir: fs.existsSync(dir) ? relative(root, dir) : "",
    manifest_path: fs.existsSync(manifestPath) ? relative(root, manifestPath) : "",
    checklist_path: fs.existsSync(checklistPath) ? relative(root, checklistPath) : "",
    readme_path: fs.existsSync(readmePath) ? relative(root, readmePath) : "",
    validation_report_json: fs.existsSync(validationJsonPath) ? relative(root, validationJsonPath) : "",
    validation_report_md: fs.existsSync(validationMdPath) ? relative(root, validationMdPath) : "",
    request_count: sourceRequestFallbackActive ? sourceRequest.requested_export_count ?? rows.length : manifest.request_count ?? rows.length,
    staging_file_count: rows.filter((row) => row.staging_csv_path).length,
    by_recommended_import_type: countBy(rows, "recommended_import_type"),
    source_request_fallback: {
      active: sourceRequestFallbackActive,
      path: fs.existsSync(sourceRequestPath) ? relative(root, sourceRequestPath) : "",
      requested_export_count: sourceRequest.requested_export_count ?? 0,
      requested_export_source: sourceRequest.requested_export_source || "",
    },
    validation: {
      mode: validation.apply ? "apply" : fs.existsSync(validationJsonPath) ? "dry-run" : "missing",
      valid_for_promotion: validation.valid_for_promotion ?? 0,
      already_promoted: validation.already_promoted ?? 0,
      promoted: validation.promoted ?? 0,
      blocked: validation.blocked ?? 0,
      empty_staging: validation.empty_staging ?? 0,
    },
  };
}

function demandImportReviewSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const jsonPath = path.join(dir, "demand-import-review-rollup.json");
  const csvPath = path.join(dir, "demand-import-review-rollup.csv");
  const markdownPath = path.join(dir, "demand-import-review-rollup.md");
  const report = readJson(jsonPath, {});
  const rows = Array.isArray(report.rows) ? report.rows : readCsv(csvPath).rows;

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    review_count: report.review_count ?? rows.length,
    by_import_status: report.by_import_status || countBy(rows, "import_status"),
    by_handoff_status: report.by_handoff_status || countBy(rows, "handoff_status"),
    blocked_missing_reviewed_export:
      report.by_import_status?.blocked_missing_reviewed_export ?? rows.filter((row) => row.import_status === "blocked_missing_reviewed_export").length,
  };
}

function demandReadinessSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const jsonPath = path.join(dir, "demand-readiness-preflight.json");
  const csvPath = path.join(dir, "demand-readiness-preflight.csv");
  const markdownPath = path.join(dir, "demand-readiness-preflight.md");
  const report = readJson(jsonPath, {});
  const validationPath = path.join(dir, "demand-import-pack", "validation-report.json");
  const validation = readJson(validationPath, {});
  const currentStagedPromotableRows = validation.valid_for_promotion ?? 0;
  let nextUnambiguousAction = report.next_unambiguous_action || {};
  if (nextUnambiguousAction.action === "run_validated_demand_apply_and_discovery_chain" && Number(currentStagedPromotableRows || 0) === 0) {
    nextUnambiguousAction = {
      action: "no_current_demand_rows_to_promote",
      reason:
        "Existing discovery may already contain validated rows, but the current demand-import pack has zero promotable staged rows. Do not rerun promotion until new reviewed rows are staged.",
      command_chain: [],
    };
  }

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    overall_status: report.overall_status || "missing",
    projected_rows_after_apply: report.projected?.projected_rows_after_apply ?? 0,
    projected_validated_rows_after_apply: report.projected?.projected_validated_rows_after_apply ?? 0,
    projected_non_monitor_cluster_count: report.projected?.projected_non_monitor_cluster_count ?? 0,
    topic_id_resolved_count: report.projected?.topic_id_resolved_count ?? 0,
    projected_source_types_after_apply: report.projected?.projected_source_types_after_apply || [],
    hard_gate_status: report.projected?.hard_gate_status || "missing",
    missing_prerequisites: report.projected?.missing_prerequisites || [],
    current_staged_promotable_rows: currentStagedPromotableRows,
    next_unambiguous_action: nextUnambiguousAction,
    by_readiness_status: report.by_readiness_status || {},
  };
}

function demandAcquisitionSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const jsonPath = path.join(dir, "demand-acquisition-brief.json");
  const markdownPath = path.join(dir, "demand-acquisition-brief.md");
  const report = readJson(jsonPath, {});

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    acquisition_status: report.acquisition_status || "missing",
    hard_gate_status: report.hard_gate_status || "missing",
    candidate_id: report.next_unambiguous_action?.candidate_id || "",
    topic: report.next_unambiguous_action?.topic || "",
    staging_csv_path: report.next_unambiguous_action?.staging_csv_path || "",
    final_destination_path: report.next_unambiguous_action?.final_destination_path || "",
    strict_validation_commands: report.strict_validation_commands || [],
  };
}

function demandAcquisitionTaskSummary(root, runDate) {
  const dir = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks");
  const jsonPath = path.join(dir, "tasks.json");
  const csvPath = path.join(dir, "tasks.csv");
  const markdownPath = path.join(dir, "tasks.md");
  const report = readJson(jsonPath, {});
  const tasks = Array.isArray(report.tasks) ? report.tasks : readCsv(csvPath).rows;
  const firstTask = tasks[0] || {};
  const firstReportPath = firstTask.report_path ? path.join(root, firstTask.report_path) : "";
  const firstReportSource = firstReportPath && fs.existsSync(firstReportPath) ? fs.readFileSync(firstReportPath, "utf8") : "";
  const firstReportStatus = firstReportSource.match(/^status:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";
  const firstReportRowsAdded = firstReportSource.match(/^rows_added:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";
  const firstReportBlockedReason = firstReportSource.match(/^blocked_reason:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    task_count: report.task_count ?? tasks.length,
    filters: report.filters || {},
    first_task: firstTask.task_id
      ? {
          task_id: firstTask.task_id,
          candidate_id: firstTask.candidate_id,
          topic: firstTask.topic,
          recommended_import_type: firstTask.recommended_import_type,
          staging_csv_path: firstTask.staging_csv_path,
          final_destination_path: firstTask.final_destination_path,
          report_path: firstTask.report_path,
          prompt_path: firstTask.prompt_path,
          status: firstTask.status,
          report_status: firstReportStatus,
          rows_added: firstReportRowsAdded,
          blocked_reason: firstReportBlockedReason,
        }
      : {},
  };
}

function demandAcquisitionReportRollupSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "report-rollup.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "report-rollup.md");
  const report = readJson(jsonPath, {});

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    total_reports: report.summary?.total_reports ?? 0,
    blocked_no_reviewed_rows: report.summary?.blocked_no_reviewed_rows ?? 0,
    staged_reviewed_rows: report.summary?.staged_reviewed_rows ?? 0,
    current_staged_reviewed_rows: report.summary?.current_staged_reviewed_rows ?? 0,
    current_staged_row_total: report.summary?.current_staged_row_total ?? 0,
    stale_staged_reviewed_rows: report.summary?.stale_staged_reviewed_rows ?? 0,
    source_request_valid_for_promotion: report.summary?.source_request_valid_for_promotion ?? 0,
    source_request_promoted: report.summary?.source_request_promoted ?? 0,
    source_request_blocked: report.summary?.source_request_blocked ?? 0,
    source_request_empty_staging: report.summary?.source_request_empty_staging ?? 0,
    rows_added_total: report.summary?.rows_added_total ?? 0,
    by_reason_code: report.summary?.by_reason_code || {},
    recommended_action: report.recommended_action || "",
    source_request: report.source_request || {},
  };
}

function liveDeploymentSummary(root, runDate, dailyReport) {
  const jsonPath = path.join(root, "automation-runs", runDate, "live-deployment-check.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "live-deployment-check.md");
  const report = readJson(jsonPath, {});
  const { parsed, step } = parsedStep(dailyReport, "Check live deployment routes");
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    step_status: step?.status || "missing",
    status: report.status || parsed?.status || "missing",
    route_count: report.route_count ?? parsed?.route_count ?? 0,
    blocked_count: report.blocked_count ?? parsed?.blocked_count ?? 0,
    origin: report.origin || "",
    next_action: report.next_action || "",
  };
}

function deploymentReadinessSummary(root, runDate, dailyReport) {
  const jsonPath = path.join(root, "automation-runs", runDate, "deployment-readiness.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "deployment-readiness.md");
  const report = readJson(jsonPath, {});
  const { parsed, step } = parsedStep(dailyReport, "Write deployment readiness");
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    step_status: step?.status || "missing",
    status: report.status || parsed?.status || "missing",
    netlify_cli_available: report.netlify?.cli_available ?? parsed?.netlify_cli_available ?? false,
    netlify_publish_check_status: report.netlify_publish_check?.status || "missing",
    netlify_publish_check_blocked_count: report.netlify_publish_check?.blocked_count ?? 0,
    netlify_publish_check_path: report.netlify_publish_check?.markdown_path || report.netlify_publish_check?.path || "",
    dirty_count: report.git?.dirty_count ?? parsed?.dirty_count ?? 0,
    next_action: report.next_action || "",
  };
}

function deployReviewSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "deploy-review-packet.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "deploy-review-packet.md");
  const report = readJson(jsonPath, {});
  const sourcePaths = [
    path.join("automation-runs", runDate, "deployment-readiness.json"),
    path.join("automation-runs", runDate, "netlify-publish-check.json"),
    path.join("automation-runs", runDate, "live-deployment-check.json"),
    path.join("automation-runs", runDate, "publish-plan.json"),
  ].map(normalizePath);
  const freshness = fs.existsSync(jsonPath)
    ? artifactFreshness(root, report, sourcePaths)
    : {
        report_generated_at: "",
        status: "missing",
        stale_source_files: [],
        sources: sourcePaths.map((sourcePath) => ({ path: sourcePath, exists: fs.existsSync(path.join(root, sourcePath)), generated_at: "", newer_than_report: false })),
      };
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    status: report.status || "missing",
    generated_at: report.generated_at || "",
    freshness_status: freshness.status,
    stale_source_files: freshness.stale_source_files,
    source_freshness: freshness.sources,
    approval_required: report.approval_required ?? true,
    blockers: report.blockers || [],
    deploy_static_changed_count: report.deploy_static_changed_paths?.length ?? 0,
    netlify_build_support_changed_count: report.netlify_build_support_changed_paths?.length ?? 0,
    process_review_changed_count: report.process_review_changed_paths?.length ?? 0,
    local_only_count: report.local_only_or_ignored_paths?.length ?? 0,
    uncategorized_changed_count: report.uncategorized_changed_paths?.length ?? 0,
    next_action: report.next_action || "",
  };
}

function runGatesSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "run-gates-daily.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "run-gates-daily.md");
  const report = readJson(jsonPath, {});
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    mode: report.mode || "daily",
    gate_status: report.gate_status || (fs.existsSync(jsonPath) ? "unknown" : "missing"),
    blocker_count: blockers.length,
    warning_count: warnings.length,
    top_blockers: blockers.slice(0, 5).map((item) => ({
      code: item.code || "",
      detail: item.detail || "",
      evidence: item.evidence || "",
    })),
  };
}

function gapLedgerSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const csvPath = path.join(dir, "gap-ledger.csv");
  const jsonPath = path.join(dir, "gap-ledger.json");
  const markdownPath = path.join(dir, "gap-ledger.md");
  const report = readJson(jsonPath, {});
  const rows = Array.isArray(report.rows) ? report.rows : readCsv(csvPath).rows;

  return {
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    row_count: report.row_count ?? rows.length,
    active_row_count: report.active_row_count ?? rows.filter((row) => !String(row.status || "").includes("stale_artifact")).length,
    stale_row_count: report.stale_row_count ?? rows.filter((row) => String(row.status || "").includes("stale_artifact")).length,
    by_gap_type: report.by_gap_type || countBy(rows, "gap_type"),
    by_owner: report.by_owner || countBy(rows, "owner"),
    by_status: report.by_status || countBy(rows, "status"),
    by_artifact_identity_status: report.by_artifact_identity_status || countBy(rows, "artifact_identity_status"),
    active_by_owner: report.active_by_owner || countBy(rows.filter((row) => !String(row.status || "").includes("stale_artifact")), "owner"),
    stale_by_artifact_identity_status: report.stale_by_artifact_identity_status || countBy(rows.filter((row) => String(row.status || "").includes("stale_artifact")), "artifact_identity_status"),
    top_gaps: rows.slice(0, 12).map((row) => ({
      candidate_id: row.candidate_id,
      gap_type: row.gap_type,
      gap_code: row.gap_code,
      owner: row.owner,
      status: row.status,
      source_path: row.source_path,
      required_action: row.required_action,
    })),
  };
}

function refreshTargetsSummary(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  const jsonPath = path.join(dir, "refresh-targets.json");
  const csvPath = path.join(dir, "refresh-targets.csv");
  const markdownPath = path.join(dir, "refresh-targets.md");
  const report = readJson(jsonPath, {});
  const rows = Array.isArray(report.rows) ? report.rows : readCsv(csvPath).rows;

  return {
    json_path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    csv_path: fs.existsSync(csvPath) ? relative(root, csvPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    row_count: report.row_count ?? rows.length,
    resolved_count: report.resolved_count ?? rows.filter((row) => row.target_resolution_status === "resolved").length,
    blocked_count: report.blocked_count ?? rows.filter((row) => row.target_resolution_status !== "resolved").length,
    rows: rows.slice(0, 12).map((row) => ({
      candidate_id: row.candidate_id,
      topic: row.topic,
      target_resolution_status: row.target_resolution_status,
      packet_path: row.packet_path,
      blockers: row.blockers,
      recommended_next_action: row.recommended_next_action,
    })),
  };
}

function codexAutomationSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "codex-automation-audit.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "codex-automation-audit.md");
  const report = readJson(jsonPath, {});
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    status: report.status || "missing",
    ready: report.summary?.ready ?? 0,
    needs_update: report.summary?.needs_update ?? 0,
    missing_required: report.summary?.missing_required ?? 0,
    total_expected: report.summary?.total_expected ?? 0,
  };
}

function skillStewardSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "skill-steward-closeout.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "skill-steward-closeout.md");
  const taskJsonPath = path.join(root, "automation-runs", runDate, "skill-steward-review-tasks", "tasks.json");
  const taskMarkdownPath = path.join(root, "automation-runs", runDate, "skill-steward-review-tasks", "tasks.md");
  const report = readJson(jsonPath, {});
  const taskReport = readJson(taskJsonPath, {});
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    decision: report.decision || "missing",
    learning_candidate_count: Array.isArray(report.learning_candidate_files) ? report.learning_candidate_files.length : 0,
    valid_candidate_count: report.valid_candidate_count ?? 0,
    invalid_candidate_count: report.invalid_candidate_count ?? 0,
    learning_candidate_files: (report.learning_candidate_files || []).slice(0, 12),
    review_tasks: {
      path: fs.existsSync(taskJsonPath) ? relative(root, taskJsonPath) : "",
      markdown_path: fs.existsSync(taskMarkdownPath) ? relative(root, taskMarkdownPath) : "",
      status: taskReport.status || "missing",
      task_count: taskReport.task_count ?? 0,
      not_started_count: taskReport.not_started_count ?? 0,
      report_present_count: taskReport.report_present_count ?? 0,
      prompts_dir: taskReport.prompts_dir || "",
      reports_dir: taskReport.reports_dir || "",
      first_task: taskReport.tasks?.[0]
        ? {
            task_id: taskReport.tasks[0].task_id,
            candidate_id: taskReport.tasks[0].candidate_id,
            target_skill: taskReport.tasks[0].target_skill,
            prompt_path: taskReport.tasks[0].prompt_path,
            report_path: taskReport.tasks[0].report_path,
            status: taskReport.tasks[0].status,
          }
        : null,
    },
    rule:
      "Skill learning candidates are review inputs only. Promotion still requires evidence, validation, forward testing, and human approval before any repo-local or global skill change.",
  };
}

function subagentSummary(root, runDate) {
  const queuePath = path.join(root, "automation-runs", runDate, "subagent-queue.json");
  const statusPath = path.join(root, "automation-runs", runDate, "subagent-status.json");
  const statusAuditPath = path.join(root, "automation-runs", runDate, "subagent-status-audit.json");
  const statusAuditMarkdownPath = path.join(root, "automation-runs", runDate, "subagent-status-audit.md");
  const dispatchPath = path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json");
  const artifactCheckPath = path.join(root, "automation-runs", runDate, "subagent-artifact-check.json");
  const artifactCheckMarkdownPath = path.join(root, "automation-runs", runDate, "subagent-artifact-check.md");
  const queue = readJson(queuePath, {});
  const status = readJson(statusPath, {});
  const dispatch = readJson(dispatchPath, {});
  const artifactCheck = readJson(artifactCheckPath, {});
  const selected = dispatch.selected_tasks || [];
  const statusLedger = summarizeSubagentStatusLedger(queue, status);

  return {
    queue_path: fs.existsSync(queuePath) ? relative(root, queuePath) : "",
    status_path: fs.existsSync(statusPath) ? relative(root, statusPath) : "",
    dispatch_path: fs.existsSync(dispatchPath) ? relative(root, dispatchPath) : "",
    status_ledger: {
      path: fs.existsSync(statusAuditPath) ? relative(root, statusAuditPath) : "",
      markdown_path: fs.existsSync(statusAuditMarkdownPath) ? relative(root, statusAuditMarkdownPath) : "",
      ...statusLedger,
    },
    artifact_check: {
      path: fs.existsSync(artifactCheckPath) ? relative(root, artifactCheckPath) : "",
      markdown_path: fs.existsSync(artifactCheckMarkdownPath) ? relative(root, artifactCheckMarkdownPath) : "",
      status: artifactCheck.status || "missing",
      completed_artifacts: artifactCheck.summary?.completed_artifacts ?? null,
      blockers: artifactCheck.summary?.blockers ?? null,
      warnings: artifactCheck.summary?.warnings ?? null,
    },
    queue_task_count: queue.task_count ?? (queue.tasks || []).length,
    counts: dispatch.counts || {
      total_tasks: (queue.tasks || []).length,
      ready_tasks: 0,
      selected_tasks: 0,
      blocked_tasks: 0,
      completed_tasks: 0,
    },
    selected_tasks: selected.slice(0, 24).map((task) => ({
      task_id: task.task_id,
      candidate_id: task.candidate_id,
      topic: task.topic,
      task_type: task.task_type || "",
      role: task.role,
      phase: task.phase,
      artifact_path: task.artifact_path,
      prompt_path: task.prompt_path,
    })),
  };
}

function isDemandAcquisitionSubagent(task) {
  return task.task_type === "demand_acquisition" || task.phase === "demand_acquisition";
}

function canonicalDispatchSummary(subagents, demandAcquisitionTasks) {
  const selected = subagents.selected_tasks || [];
  const expectedTaskId = demandAcquisitionTasks.first_task?.task_id || "";
  const demandSelected = selected.filter(isDemandAcquisitionSubagent);
  const expectedSelected = expectedTaskId ? demandSelected.some((task) => task.task_id === expectedTaskId) : false;
  let alignment = "not_applicable";
  if (expectedTaskId) {
    alignment =
      selected.length === 1 && expectedSelected
        ? "aligned_demand_acquisition_ready_batch"
        : "mismatch_ready_batch_does_not_include_exactly_one_demand_acquisition_task";
  }
  return {
    path: subagents.dispatch_path || "",
    mode: demandSelected.length ? "demand_acquisition" : selected.length ? "standard" : "none",
    selected_task_count: selected.length,
    expected_task_id: expectedTaskId,
    ready_batch_only: true,
    alignment,
  };
}

function blockerCounts(packets) {
  const counts = {};
  for (const packet of packets || []) {
    for (const item of packet.reasons || []) counts[item.code || "unknown"] = (counts[item.code || "unknown"] || 0) + 1;
  }
  return counts;
}

function publishSummary(root, runDate) {
  const planPath = path.join(root, "automation-runs", runDate, "publish-plan.json");
  const plan = readJson(planPath, {});
  return {
    path: fs.existsSync(planPath) ? relative(root, planPath) : "",
    status: plan.status || "missing",
    mode: plan.mode || "",
    limits: plan.limits || {},
    selected_count: (plan.selected_packets || []).length,
    blocked_count: (plan.blocked_packets || []).length,
    blocker_counts: blockerCounts(plan.blocked_packets || []),
    selected_packets: (plan.selected_packets || []).map((packet) => ({
      packet: packet.packet,
      slug: packet.slug,
      topic_id: packet.topic_id,
      topic_score: packet.topic_score,
    })),
    blocked_packets: (plan.blocked_packets || []).slice(0, 12).map((packet) => ({
      packet: packet.packet,
      slug: packet.slug,
      reasons: (packet.reasons || []).map((item) => item.code),
    })),
    next_manual_actions: plan.next_manual_actions || [],
  };
}

function emptyVerifiedRunCount(root) {
  const runsDir = path.join(root, "automation-runs");
  if (!fs.existsSync(runsDir)) return 0;
  return fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const diagnostics = readJson(path.join(runsDir, entry.name, "measurement-diagnostics.json"), {});
      return diagnostics.status === "verified_empty_all_windows";
    }).length;
}

function feedbackInputState({ feedbackRows, fixtureStep, rollupFixtureStep, lifecycleFixtureStep, measurementDiagnostics }) {
  if (fixtureStep?.status !== "completed") return "fixture_not_verified";
  if (rollupFixtureStep?.status !== "completed") return "rollup_fixture_not_verified";
  if (lifecycleFixtureStep?.status !== "completed") return "decision_lifecycle_fixture_not_verified";
  if (feedbackRows > 0) return "input_rows_present";
  if (measurementDiagnostics.status === "verified_empty_all_windows") return "healthy_empty";
  if (
    measurementDiagnostics.ga4?.zero_row_state === "config_risk" ||
    measurementDiagnostics.search_console?.zero_row_state === "config_risk"
  ) {
    return "measurement_config_risk";
  }
  return "needs_input_or_diagnostics";
}

function recommendedFeedbackInputAction(state) {
  if (state === "healthy_empty") return "acquire_first_reviewed_feedback_input";
  if (state === "input_rows_present") return "run_scoring_and_decision_review";
  if (state === "measurement_config_risk") return "fix_measurement_configuration";
  if (state === "rollup_fixture_not_verified") return "fix_feedback_signal_rollup_fixture";
  if (state === "decision_lifecycle_fixture_not_verified") return "fix_content_decision_lifecycle_fixture";
  if (state === "fixture_not_verified") return "fix_analytics_feedback_fixture";
  return "review_measurement_diagnostics_and_imports";
}

function analyticsSummary(root, dailyReport, measurementDiagnostics) {
  const decisionRows = readCsv(path.join(root, "analytics", "content_decisions.csv")).rows;
  const activeDecisionRows = decisionRows.filter(isActiveEvidenceBackedContentDecision);
  const openDecisionRowsWithoutEvidence = decisionRows.filter(
    (row) => isOpenContentDecisionLifecycle(row) && !isActiveEvidenceBackedContentDecision(row)
  );
  const { parsed: rollupOutput, step: rollupStep } = parsedStep(dailyReport, "Roll up feedback signals");
  const { parsed: rollupFixtureOutput, step: rollupFixtureStep } = parsedStep(dailyReport, "Check feedback signal rollup fixture");
  const { parsed: fixtureOutput, step: fixtureStep } = parsedStep(dailyReport, "Check analytics feedback fixture");
  const { parsed: lifecycleFixtureOutput, step: lifecycleFixtureStep } = parsedStep(dailyReport, "Check content decision lifecycle fixture");
  const { parsed: aiQuerySetOutput, step: aiQuerySetStep } = parsedStep(dailyReport, "Check AI citation query set");
  const { parsed: aiCapturePackOutput, step: aiCapturePackStep } = parsedStep(dailyReport, "Write AI citation capture pack");
  const { parsed: aiCaptureTaskOutput, step: aiCaptureTaskStep } = parsedStep(dailyReport, "Build AI citation capture task batch");
  const { parsed: aiCaptureRowStagingOutput, step: aiCaptureRowStagingStep } = parsedStep(dailyReport, "Stage completed AI citation capture rows");
  const { parsed: aiCitationImportPreflightOutput, step: aiCitationImportPreflightStep } = parsedStep(dailyReport, "Check AI citation import preflight");
  const aiQuerySetPath = path.join(root, "automation-runs", String(dailyReport?.run_date || ""), "ai-citation-query-set-check.json");
  const aiQuerySetReport = readJson(aiQuerySetPath, {});
  const aiCapturePackPath = path.join(root, "automation-runs", String(dailyReport?.run_date || ""), "ai-citation-capture-pack.json");
  const aiCapturePackReport = readJson(aiCapturePackPath, {});
  const aiCaptureTaskPath = path.join(root, "automation-runs", String(dailyReport?.run_date || ""), "ai-citation-capture-tasks", "tasks.json");
  const aiCaptureTaskReport = readJson(aiCaptureTaskPath, {});
  const aiCaptureRowStagingPath = path.join(root, "automation-runs", String(dailyReport?.run_date || ""), "ai-citation-capture-row-staging.json");
  const aiCaptureRowStagingReport = readJson(aiCaptureRowStagingPath, {});
  const aiCitationImportPreflightPath = path.join(root, "automation-runs", String(dailyReport?.run_date || ""), "ai-citation-import-preflight.json");
  const aiCitationImportPreflightReport = readJson(aiCitationImportPreflightPath, {});
  const pageDailyRows = readCsv(path.join(root, "analytics", "page_daily.csv")).rows;
  const pageRollup = pageFeedbackRollup(pageDailyRows);
  const decisionEvidenceStatusCounts = countBy(pageDailyRows, "decision_evidence_status");
  const pageRows = pageDailyRows.length;
  const queryRows = rowCount(root, "analytics/search_query_daily.csv");
  const aiCitationRows = rowCount(root, "analytics/ai_citation_log.csv");
  const distributionRows = rowCount(root, "analytics/distribution_daily.csv");
  const rawFeedbackRows = pageRows + queryRows + aiCitationRows + distributionRows;
  const eligibleDecisionEvidenceRows = pageRollup.decision_grade_row_count;
  const inputState = feedbackInputState({
    feedbackRows: rawFeedbackRows,
    fixtureStep,
    rollupFixtureStep,
    lifecycleFixtureStep,
    measurementDiagnostics,
  });
  return {
    feedback_input_state: inputState,
    recommended_feedback_input_action: recommendedFeedbackInputAction(inputState),
    raw_feedback_rows: rawFeedbackRows,
    eligible_decision_evidence_rows: eligibleDecisionEvidenceRows,
    empty_verified_run_count: inputState === "healthy_empty" ? emptyVerifiedRunCount(root) : 0,
    page_daily_rows: pageRows,
    page_signal_bearing_rows: pageRollup.signal_row_count,
    page_review_ready_rows: pageRollup.review_ready_row_count,
    page_decision_grade_rows: pageRollup.decision_grade_row_count,
    page_decision_grade_pages: pageRollup.decision_grade_page_count,
    page_decision_evidence_status_counts: decisionEvidenceStatusCounts,
    provisional_page_rows: Number(decisionEvidenceStatusCounts.provisional || 0),
    decision_grade_page_rows_with_status: Number(decisionEvidenceStatusCounts.decision_grade || 0),
    search_query_daily_rows: queryRows,
    ai_citation_log_rows: aiCitationRows,
    ai_citation_query_set: {
      step_status: aiQuerySetStep?.status || "missing",
      status: aiQuerySetReport.status || aiQuerySetOutput?.status || "missing",
      query_set_id: aiQuerySetReport.query_set_id || aiQuerySetOutput?.query_set_id || "",
      query_set_version: aiQuerySetReport.query_set_version || aiQuerySetOutput?.query_set_version || "",
      expected_captures: aiQuerySetReport.expected_captures ?? aiQuerySetOutput?.expected_captures ?? 0,
      observed_captures: aiQuerySetReport.observed_captures ?? aiQuerySetOutput?.observed_captures ?? 0,
      reviewed_captures: aiQuerySetReport.reviewed_captures ?? aiQuerySetOutput?.reviewed_captures ?? 0,
      missing_captures: aiQuerySetReport.missing_captures?.length ?? aiQuerySetOutput?.missing_captures ?? 0,
      stale_captures: aiQuerySetReport.stale_captures?.length ?? aiQuerySetOutput?.stale_captures ?? 0,
      unreviewed_captures: aiQuerySetReport.unreviewed_captures?.length ?? aiQuerySetOutput?.unreviewed_captures ?? 0,
      coverage_pct: aiQuerySetReport.coverage_pct ?? aiQuerySetOutput?.coverage_pct ?? 0,
      report_path: aiQuerySetReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-query-set-check.json` : "",
      markdown_path: aiQuerySetReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-query-set-check.md` : "",
      capture_pack: {
        step_status: aiCapturePackStep?.status || "missing",
        status: aiCapturePackReport.status || aiCapturePackOutput?.status || "missing",
        capture_rows: aiCapturePackReport.capture_rows ?? aiCapturePackOutput?.capture_rows ?? 0,
        capture_pack_csv: aiCapturePackReport.capture_pack_csv || aiCapturePackOutput?.capture_pack_csv || "",
        import_skeleton_csv: aiCapturePackReport.import_skeleton_csv || aiCapturePackOutput?.import_skeleton_csv || "",
        markdown_path: aiCapturePackReport.capture_pack_md || aiCapturePackOutput?.capture_pack_md || "",
      },
      capture_tasks: {
        step_status: aiCaptureTaskStep?.status || (aiCaptureTaskReport.status ? "completed_outside_daily_report" : "missing"),
        status: aiCaptureTaskReport.status || aiCaptureTaskOutput?.status || "missing",
        task_count: aiCaptureTaskReport.task_count ?? aiCaptureTaskOutput?.task_count ?? 0,
        not_started_count: aiCaptureTaskReport.not_started_count ?? aiCaptureTaskOutput?.not_started_count ?? 0,
        report_present_count: aiCaptureTaskReport.report_present_count ?? 0,
        completed_row_count: aiCaptureTaskReport.completed_row_count ?? 0,
        tasks_json: aiCaptureTaskOutput?.tasks_json || (aiCaptureTaskReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-capture-tasks/tasks.json` : ""),
        tasks_csv: aiCaptureTaskOutput?.tasks_csv || (aiCaptureTaskReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-capture-tasks/tasks.csv` : ""),
        markdown_path: aiCaptureTaskOutput?.tasks_md || (aiCaptureTaskReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-capture-tasks/tasks.md` : ""),
        prompts_dir: aiCaptureTaskReport.prompts_dir || "",
        reports_dir: aiCaptureTaskReport.reports_dir || "",
        rows_dir: aiCaptureTaskReport.rows_dir || "",
        first_task: aiCaptureTaskReport.tasks?.[0]
          ? {
              task_id: aiCaptureTaskReport.tasks[0].task_id,
              query_id: aiCaptureTaskReport.tasks[0].query_id,
              surface: aiCaptureTaskReport.tasks[0].surface,
              prompt_path: aiCaptureTaskReport.tasks[0].prompt_path,
              report_path: aiCaptureTaskReport.tasks[0].report_path,
              row_csv_path: aiCaptureTaskReport.tasks[0].row_csv_path,
              status: aiCaptureTaskReport.tasks[0].status,
            }
          : null,
        rule:
          aiCaptureTaskReport.rule ||
          "AI citation capture tasks are one-subagent-per-capture monitoring work only; row CSV files are created only after completed observations.",
      },
      capture_row_staging: {
        step_status: aiCaptureRowStagingStep?.status || (aiCaptureRowStagingReport.status ? "completed_outside_daily_report" : "missing"),
        status: aiCaptureRowStagingReport.status || aiCaptureRowStagingOutput?.status || "missing",
        apply: aiCaptureRowStagingReport.apply ?? aiCaptureRowStagingOutput?.apply ?? false,
        valid_completed_rows: aiCaptureRowStagingReport.valid_completed_rows ?? aiCaptureRowStagingOutput?.valid_completed_rows ?? 0,
        row_blockers: aiCaptureRowStagingReport.row_blockers ?? aiCaptureRowStagingOutput?.row_blockers ?? 0,
        blocked_reports: aiCaptureRowStagingReport.blocked_reports ?? aiCaptureRowStagingOutput?.blocked_reports ?? 0,
        not_started: aiCaptureRowStagingReport.not_started ?? aiCaptureRowStagingOutput?.not_started ?? 0,
        preview_csv: aiCaptureRowStagingReport.preview_csv || aiCaptureRowStagingOutput?.preview_csv || "",
        import_csv: aiCaptureRowStagingReport.import_csv || aiCaptureRowStagingOutput?.import_csv || "",
        report_path: aiCaptureRowStagingReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-capture-row-staging.json` : "",
        markdown_path: aiCaptureRowStagingReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-capture-row-staging.md` : "",
        rule:
          aiCaptureRowStagingReport.rule ||
          "Only captured-observation reports with exactly one validated row are staged into imports/ai-citations.",
      },
      import_preflight: {
        step_status: aiCitationImportPreflightStep?.status || (aiCitationImportPreflightReport.status ? "completed_outside_daily_report" : "missing"),
        status: aiCitationImportPreflightReport.status || aiCitationImportPreflightOutput?.status || "missing",
        valid_rows: aiCitationImportPreflightReport.valid_rows ?? aiCitationImportPreflightOutput?.valid_rows ?? 0,
        supplemental_rows: aiCitationImportPreflightReport.supplemental_rows ?? aiCitationImportPreflightOutput?.supplemental_rows ?? 0,
        invalid_rows: aiCitationImportPreflightReport.invalid_rows ?? aiCitationImportPreflightOutput?.invalid_rows ?? 0,
        files_checked: aiCitationImportPreflightReport.files_checked ?? 0,
        report_path: aiCitationImportPreflightReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-import-preflight.json` : "",
        markdown_path: aiCitationImportPreflightReport.status ? `automation-runs/${dailyReport?.run_date || ""}/ai-citation-import-preflight.md` : "",
      },
    },
    distribution_daily_rows: distributionRows,
    feedback_rollup: {
      step_status: rollupStep?.status || "missing",
      source_rows: rollupOutput?.source_rows ?? null,
      rolled_up_source_rows: rollupOutput?.rolled_up_source_rows ?? null,
      skipped_source_rows: rollupOutput?.skipped_source_rows ?? null,
      derived_page_rows: rollupOutput?.derived_page_rows ?? null,
      page_daily_rows: rollupOutput?.page_daily_rows ?? null,
      wrote_file: rollupOutput?.wrote_file ?? null,
    },
    feedback_rollup_fixture: {
      step_status: rollupFixtureStep?.status || "missing",
      fixture: rollupFixtureOutput?.fixture || "",
      derived_page_rows: rollupFixtureOutput?.derived_page_rows ?? null,
      rolled_up_source_rows: rollupFixtureOutput?.rolled_up_source_rows ?? null,
    },
    feedback_fixture: {
      step_status: fixtureStep?.status || "missing",
      fixture: fixtureOutput?.fixture || "",
      score_rows: fixtureOutput?.score_rows ?? null,
      proposed_decisions: fixtureOutput?.proposed_decisions ?? null,
      expected_decisions: fixtureOutput?.expected_decisions || {},
      actual_decisions: fixtureOutput?.actual_decisions || {},
    },
    content_decision_lifecycle_fixture: {
      step_status: lifecycleFixtureStep?.status || "missing",
      fixture: lifecycleFixtureOutput?.fixture || "",
      decision_id: lifecycleFixtureOutput?.decision_id || "",
      first_run_proposed: lifecycleFixtureOutput?.first_run_proposed ?? null,
      second_run_proposed: lifecycleFixtureOutput?.second_run_proposed ?? null,
      preserved: lifecycleFixtureOutput?.preserved || {},
      lifecycle: lifecycleFixtureOutput?.lifecycle || {},
    },
    content_decision_rows: decisionRows.length,
    content_decisions_by_status: countBy(decisionRows, "status"),
    content_decisions_by_decision: countBy(decisionRows, "decision"),
    content_decisions_by_outcome: countBy(decisionRows, "outcome"),
    open_content_decisions_without_decision_grade_evidence: openDecisionRowsWithoutEvidence.length,
    open_content_decisions_without_decision_grade_evidence_examples: openDecisionRowsWithoutEvidence.slice(0, 8).map((row) => ({
      decision_id: row.decision_id || "",
      slug: row.slug || "",
      decision: row.decision || "",
      status: row.status || "",
      evidence_status: row.evidence_status || "",
      evidence_row_count: row.evidence_row_count || "",
      evidence_date_count: row.evidence_date_count || "",
      evidence_signature: row.evidence_signature || "",
    })),
    active_content_decisions_by_status: countBy(activeDecisionRows, "status"),
    active_content_decisions: activeDecisionRows.length,
    active_content_decision_examples: activeDecisionRows.slice(0, 8).map((row) => ({
      decision_id: row.decision_id || "",
      slug: row.slug,
      decision: row.decision,
      status: row.status,
      outcome: row.outcome || "",
      first_seen_date: row.first_seen_date || "",
      last_seen_date: row.last_seen_date || row.decision_date || "",
      evidence_signature: row.evidence_signature || "",
      primary_signal: row.primary_signal,
      recommended_action: row.recommended_action,
    })),
  };
}

function overallStatus({ dailyReport, google, discovery, candidates, publish, liveDeployment }) {
  if (!dailyReport) return "missing_daily_report";
  if (dailyReport.status === "failed") return "daily_pipeline_failed";
  if (!google.credentials.oauth_credentials.exists && !google.credentials.service_account_credentials.exists) {
    return "needs_google_credentials";
  }
  if (google.ga4.step_status === "failed" || google.search_console.step_status === "failed") {
    return "google_metrics_failed";
  }
  if (discovery.query_handoff_status !== "ready") {
    return Number(discovery.rows || 0) > 0 ? "needs_validated_query_demand" : "needs_query_or_trend_inputs";
  }
  if (candidates.intake_ready === 0) return "needs_packet_intake_ready_candidates";
  if (liveDeployment.status && liveDeployment.status !== "ready") return "needs_live_deployment";
  if (publish.selected_count > 0) return "ready_for_publish_approval";
  return "blocked_before_generation";
}

function nextActions({
  runDate,
  google,
  bing,
  analytics,
  discovery,
  candidates,
  demandImportWorklist,
  demandImportPack,
  demandImportReviews,
  demandReadiness,
  demandAcquisition,
  demandAcquisitionTasks,
  demandAcquisitionReportRollup,
  liveDeployment,
  deploymentReadiness,
  deployReview,
  refreshTargets,
  gapLedger,
  codexAutomations,
  skillSteward,
  subagents,
  publish,
}) {
  const actions = [];
  const selectedDemandAcquisitionTasks = (subagents.selected_tasks || []).filter(isDemandAcquisitionSubagent);
  const sourceProbeLocked =
    demandAcquisitionReportRollup.source_request?.status === "escalation_required" ||
    demandAcquisitionReportRollup.source_request?.status === "escalation_required_no_remaining_manifest_rows" ||
    demandAcquisitionReportRollup.source_request?.source_probe_lock?.active === true;
  const promotableDemandRows = Number(demandImportPack.validation?.valid_for_promotion || 0);
  const liveDeploymentBlocked = liveDeployment.status === "blocked" || Number(liveDeployment.blocked_count || 0) > 0;

  if (deployReview.freshness_status && deployReview.freshness_status !== "fresh") {
    actions.push({
      priority: "P0",
      owner: "orchestrator_or_deploy_owner",
      action: "regenerate_deploy_review_packet",
      detail: `Deploy review packet freshness is ${deployReview.freshness_status}. Regenerate it with \`node scripts/seo-aeo/write-deploy-review-packet.mjs --date ${runDate}\` before deploy approval, deployment, or demand/content work. Stale sources: ${(deployReview.stale_source_files || []).join(", ") || "n/a"}.`,
    });
  }

  if (promotableDemandRows > 0 && liveDeploymentBlocked) {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "defer_demand_promotion_until_live_deployment_ready",
      detail: `${promotableDemandRows} staged reviewed demand import(s) are valid or already promoted, but live deployment is blocked for ${liveDeployment.blocked_count || 0} route(s). Do not run demand promotion apply until live deployment is ready, or until the deploy blocker is explicitly deferred and the command includes \`--live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:${runDate}\`.`,
    });
  } else if (promotableDemandRows > 0) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "run_demand_promotion",
      detail: `${promotableDemandRows} staged reviewed demand import(s) are valid or already promoted for the guarded promotion chain. Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run\`, inspect the report, then run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}\` before any scaffolded apply if promotion is approved. Do not launch more demand-acquisition subagents first.`,
    });
  }

  if (Number(analytics.ai_citation_query_set?.capture_pack?.capture_rows || 0) > 0) {
    const capturePack = analytics.ai_citation_query_set.capture_pack;
    const captureTasks = analytics.ai_citation_query_set.capture_tasks || {};
    actions.push({
      priority: "P1",
      owner: "analytics_feedback_agent",
      action: "complete_ai_citation_capture_pack",
      detail: `${capturePack.capture_rows} AI/search citation capture row(s) need manual or official-export review. Launch one subagent per task from ${captureTasks.markdown_path || capturePack.markdown_path || "automation-runs/<date>/ai-citation-capture-tasks/tasks.md"}. Capture subagents may write completed one-row CSVs under ${captureTasks.rows_dir || "automation-runs/<date>/ai-citation-capture-tasks/rows"}; then import with \`node scripts/seo-aeo/import-analytics-exports.mjs --date ${runDate} --strict\`. Do not use unofficial answer-engine scraping, and do not import placeholder rows.`,
    });
  }

  if (Number(analytics.ai_citation_query_set?.capture_row_staging?.row_blockers || 0) > 0) {
    const staging = analytics.ai_citation_query_set.capture_row_staging;
    actions.push({
      priority: "P1",
      owner: "analytics_feedback_agent",
      action: "fix_ai_citation_capture_row_blockers",
      detail: `${staging.row_blockers} AI citation capture row staging blocker(s) were found. Review ${staging.markdown_path || "automation-runs/<date>/ai-citation-capture-row-staging.md"}; only captured_observation reports with exactly one validated row should be staged into imports.`,
    });
  }

  if (Number(analytics.ai_citation_query_set?.import_preflight?.invalid_rows || 0) > 0) {
    const preflight = analytics.ai_citation_query_set.import_preflight;
    actions.push({
      priority: "P1",
      owner: "analytics_feedback_agent",
      action: "fix_ai_citation_import_preflight",
      detail: `${preflight.invalid_rows} AI citation import row(s) failed strict preflight. Review ${preflight.markdown_path || "automation-runs/<date>/ai-citation-import-preflight.md"} before running analytics import.`,
    });
  }

  if (liveDeployment.status === "blocked" || Number(liveDeployment.blocked_count || 0) > 0) {
    actions.push({
      priority: "P0",
      owner: "orchestrator_or_deploy_owner",
      action: "fix_live_deployment_routes",
      detail: `Live deployment check is blocked for ${liveDeployment.blocked_count || 0} route(s). Review ${deployReview.markdown_path || deploymentReadiness.markdown_path || "automation-runs/<date>/deploy-review-packet.md"}, deploy only after explicit approval through the Git-connected path or clean \`outputs/netlify-publish\` directory, then rerun \`node scripts/seo-aeo/check-live-deployment.mjs --date ${runDate}\`.`,
    });
  }

  if (deployReview.status === "ready_for_deploy_approval" && deployReview.freshness_status === "fresh" && liveDeployment.status === "blocked") {
    actions.push({
      priority: "P0",
      owner: "founder_or_deploy_owner",
      action: "review_deploy_packet_for_approval",
      detail: `Clean publish output is ready and the deploy review packet is ready at ${deployReview.markdown_path || deployReview.path}. Approval is still required; do not deploy local-only paths, automation runs, imports, config secrets, analytics, or outputs.`,
    });
  }

  if (sourceProbeLocked && promotableDemandRows === 0 && Number(demandAcquisitionReportRollup.current_staged_reviewed_rows || 0) === 0) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "provide_reviewed_demand_source_access",
      detail: `Source-request lock is active with ${demandAcquisitionReportRollup.source_request?.requested_export_count ?? 0} requested export(s). Review ${demandAcquisitionReportRollup.source_request?.markdown_path || "automation-runs/<date>/demand-acquisition-tasks/source-request.md"} and provide one reviewed demand-bearing export or verified source access with real rows before launching more demand acquisition/import/apply, packet scaffolding, generation, publishing, distribution, analytics-feedback, or content-movement work. Safe local orchestration, gap mapping, source-gap, QA-for-gap, and skill-steward tasks may continue only when selected by the canonical ready batch.`,
    });
  }

  if (!google.credentials.oauth_credentials.exists && !google.credentials.service_account_credentials.exists) {
    actions.push({
      priority: "P0",
      owner: "human_orchestrator",
      action: "connect_google_credentials",
      detail: "Create local OAuth or service-account credentials before expecting automated GA4/GSC pulls.",
    });
  }

  if (google.ga4.step_status === "completed" && google.ga4.total_rows === 0) {
    const state = liveDeployment.status === "blocked" ? "live_measurement_not_deployed" : google.ga4.diagnostics?.zero_row_state || "missing";
    const detailByState = {
      live_measurement_not_deployed: `GA4 API access works, but live deployment is blocked for ${liveDeployment.blocked_count || 0} route(s) or tags. Deploy the clean publish output and rerun live checks before interpreting GA4 zero rows as true no-traffic data.`,
      config_risk: `GA4 pull completed with zero rows, but measurement diagnostics show configuration/access risk. Review ${google.ga4.diagnostics?.error || "the configured GA4 property and OAuth access"}.`,
      needs_wider_window: "GA4 pull completed with zero rows for the configured window, but a wider diagnostics window found rows. Rerun the daily controller with a wider metrics window before treating GA4 as empty.",
      verified_empty: "GA4 API access works and diagnostics found zero rows across target and wider windows. Wait for real traffic/data or import approved manual analytics exports; do not create placeholder rows.",
      not_zero: "GA4 diagnostics found rows, but no GA4-owned rows are present in analytics/page_daily.csv. Rerun pull-ga4 or inspect the import/write path before assuming no traffic.",
      missing: "GA4 API access works, but analytics/page_daily.csv has no GA4-owned rows and measurement diagnostics are missing. Run diagnose-measurement-signals before deciding whether to wait, widen the window, or fix configuration.",
    };
    actions.push({
      priority: state === "config_risk" ? "P0" : state === "verified_empty" ? "P2" : "P1",
      owner: "analytics_feedback_agent",
      action:
        state === "live_measurement_not_deployed"
          ? "fix_live_deployment_before_interpreting_ga4"
          : state === "config_risk"
          ? "fix_ga4_measurement_configuration"
          : state === "needs_wider_window"
            ? "rerun_ga4_with_wider_metrics_window"
            : "monitor_or_import_page_metrics",
      detail: detailByState[state] || detailByState.missing,
    });
  }

  if (google.search_console.step_status === "completed" && google.search_console.total_rows === 0) {
    const state = liveDeployment.status === "blocked" ? "live_measurement_not_deployed" : google.search_console.diagnostics?.zero_row_state || "missing";
    const detailByState = {
      live_measurement_not_deployed: `Search Console API access works, but live deployment is blocked for ${liveDeployment.blocked_count || 0} route(s). Deploy the clean publish output and rerun live checks before treating zero search rows as normal.`,
      config_risk: `Search Console pull completed with zero rows, but measurement diagnostics show configuration/access risk. Review ${google.search_console.diagnostics?.error || "the configured Search Console property and OAuth access"}.`,
      needs_wider_window: "Search Console pull completed with zero rows for the configured window, but a wider diagnostics window found rows. Rerun the daily controller with a wider metrics window before treating search demand as absent.",
      recent_data_pending: "Search Console all-data diagnostics found rows while final data is still empty. Wait for finalization or use only reviewed exports; do not unlock packet intake from unfinalized rows without review.",
      verified_empty: "Search Console API access works and diagnostics found zero rows across target and wider windows. Wait for real query data or import approved query exports; do not create placeholder rows.",
      not_zero: "Search Console diagnostics found rows, but analytics/search_query_daily.csv is still empty. Rerun pull-gsc or inspect the import/write path before assuming no demand.",
      missing: "Search Console API access works, but search_query_daily.csv has no signal rows and measurement diagnostics are missing. Run diagnose-measurement-signals before deciding whether to wait, widen the window, or fix configuration.",
    };
    actions.push({
      priority: state === "config_risk" ? "P0" : state === "verified_empty" ? "P2" : "P1",
      owner: "query_intelligence_agent",
      action:
        state === "live_measurement_not_deployed"
          ? "fix_live_deployment_before_interpreting_gsc"
          : state === "config_risk"
          ? "fix_search_console_measurement_configuration"
          : state === "needs_wider_window"
            ? "rerun_gsc_with_wider_metrics_window"
            : state === "recent_data_pending"
              ? "wait_for_search_console_finalization"
              : "monitor_or_import_search_queries",
      detail: detailByState[state] || detailByState.missing,
    });
  }

  if (bing.webmaster.step_status === "skipped_missing_setup") {
    actions.push({
      priority: "P2",
      owner: "analytics_feedback_agent",
      action: "connect_optional_bing_webmaster_api",
      detail: "Bing Webmaster API is not configured. Add BING_WEBMASTER_API_KEY and BING_WEBMASTER_SITE_URL when Bing Search Performance data is available, or keep using reviewed Bing export imports.",
    });
  }

  if (bing.webmaster.step_status === "completed" && bing.webmaster.total_rows === 0) {
    actions.push({
      priority: "P2",
      owner: "analytics_feedback_agent",
      action: "monitor_or_import_bing_queries",
      detail: "Bing Webmaster API access works, but no Bing query rows are present yet. Wait for Bing weekly data or import approved Bing Webmaster exports.",
    });
  }

  if (discovery.query_handoff_status !== "ready") {
    const hasDiscoveryRows = Number(discovery.rows || 0) > 0;
    actions.push({
      priority: "P0",
      owner: "query_intelligence_agent",
      action: "produce_current_ready_query_handoff",
      detail: hasDiscoveryRows
        ? `Current query handoff is ${discovery.query_handoff_status} with ${discovery.rows} discovery row(s). Add validated demand inputs under imports/query-exports, Bing Webmaster exports, or Google Trends CSV exports, or wait for GSC query rows, before packet intake. Public feed, Google Trends RSS, manual AI, SERP, and topic-seed inputs can route gap-resolution work but cannot unlock publishable packet intake.`
        : `Current query handoff is ${discovery.query_handoff_status}. Add approved current-date inputs under imports/query-exports, imports/trends, imports/ai-query-observations, imports/serp-observations, or imports/topic-seeds for ${discovery.run_id}. Manual-only inputs can route gap-resolution work but cannot unlock publishable packet intake.`,
    });
    if (Number(demandImportWorklist.request_count || 0) > 0) {
      actions.push({
        priority: "P0",
        owner: "query_intelligence_agent",
        action: "complete_demand_import_worklist",
        detail: `${demandImportWorklist.request_count} validated-demand import request(s) across ${demandImportWorklist.candidate_count} candidate(s) are listed in ${demandImportWorklist.markdown_path || demandImportWorklist.csv_path}. Fill the requested exports from approved sources before rerunning the daily controller.`,
      });
      if (Number(demandImportPack.request_count || 0) > 0) {
        actions.push({
          priority: "P0",
          owner: "query_intelligence_agent",
          action: "fill_demand_import_pack",
          detail: `${demandImportPack.staging_file_count} header-only staging file(s) are prepared in ${demandImportPack.output_dir}. Fill them with reviewed export rows, run-demand-promotion.mjs --dry-run, then run marker-approved --apply only after the report has no blocked rows and promotion is approved.`,
        });
      }
      if (Number(demandImportReviews.review_count || 0) > 0) {
        actions.push({
          priority: "P0",
          owner: "query_intelligence_agent",
          action: "resolve_blocked_rank1_demand_reviews",
          detail: `${demandImportReviews.review_count} rank-1 demand-import review artifact(s) are summarized in ${demandImportReviews.markdown_path || demandImportReviews.csv_path}. ${demandImportReviews.blocked_missing_reviewed_export} are blocked because reviewed exports are missing.`,
        });
      }
      if (demandReadiness.overall_status && demandReadiness.overall_status !== "missing") {
        const currentStagedPromotableRows = Number(demandReadiness.current_staged_promotable_rows || 0);
        const demandApplyReady =
          demandReadiness.hard_gate_status === "prerequisites_present_needs_discovery_rebuild" &&
          currentStagedPromotableRows > 0;
        const shouldRunDemandApply = demandApplyReady && !liveDeploymentBlocked;
        const demandApplyBlockedByLiveDeployment = demandApplyReady && liveDeploymentBlocked;
        const nextDemandAction = demandReadiness.next_unambiguous_action?.action
          ? ` Next unambiguous action: ${demandReadiness.next_unambiguous_action.action}${
              demandReadiness.next_unambiguous_action.candidate_id ? ` for ${demandReadiness.next_unambiguous_action.candidate_id}` : ""
            }${
              demandReadiness.next_unambiguous_action.staging_csv_path ? ` using ${demandReadiness.next_unambiguous_action.staging_csv_path}` : ""
            }.`
          : "";
        actions.push({
          priority: shouldRunDemandApply ? "P0" : demandApplyBlockedByLiveDeployment ? "P1" : "P1",
          owner: "query_intelligence_agent",
          action: shouldRunDemandApply
            ? "run_validated_demand_apply_and_discovery_chain"
            : demandApplyBlockedByLiveDeployment
              ? "wait_for_live_deployment_before_demand_apply"
            : "satisfy_demand_readiness_prerequisites",
          detail: `Demand readiness preflight is ${demandReadiness.overall_status}; hard gate ${demandReadiness.hard_gate_status}. Current staged promotable rows ${currentStagedPromotableRows}. Projected rows ${demandReadiness.projected_rows_after_apply}, source types ${demandReadiness.projected_source_types_after_apply.length}, validated rows ${demandReadiness.projected_validated_rows_after_apply}, non-monitor clusters ${demandReadiness.projected_non_monitor_cluster_count}. Missing: ${demandReadiness.missing_prerequisites.join(", ") || "none"}.${nextDemandAction}${
            demandApplyBlockedByLiveDeployment
              ? ` Live deployment is blocked for ${liveDeployment.blocked_count || 0} route(s), so demand apply must wait unless explicitly deferred with \`--live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:${runDate}\`.`
              : ""
          } See ${demandReadiness.markdown_path || demandReadiness.json_path}.`,
        });
      }
      if (demandAcquisition.acquisition_status && demandAcquisition.acquisition_status !== "missing") {
        actions.push({
          priority: "P0",
          owner: "query_intelligence_agent",
          action: "use_demand_acquisition_brief",
          detail: `Demand acquisition brief is ${demandAcquisition.acquisition_status} for ${demandAcquisition.candidate_id || "the selected candidate"}. Fill ${demandAcquisition.staging_csv_path || "the named staging CSV"} with real reviewed rows only, then run strict validation. See ${demandAcquisition.markdown_path || demandAcquisition.json_path}.`,
        });
      }
      if (Number(demandAcquisitionTasks?.task_count || 0) > 0) {
        if (Number(demandAcquisitionReportRollup?.blocked_no_reviewed_rows || 0) >= 3 && Number(demandAcquisitionReportRollup?.current_staged_reviewed_rows || 0) === 0) {
          actions.push({
            priority: "P0",
            owner: "orchestrator",
            action: sourceProbeLocked ? "provide_reviewed_demand_source_access" : "review_demand_acquisition_blocker_pattern",
            detail: `${demandAcquisitionReportRollup.blocked_no_reviewed_rows} demand acquisition attempt(s) are blocked with no reviewed rows, and current staged reviewed rows are ${demandAcquisitionReportRollup.current_staged_reviewed_rows}. Review ${demandAcquisitionReportRollup.markdown_path || demandAcquisitionReportRollup.json_path} and ${demandAcquisitionReportRollup.source_request?.markdown_path || "the generated demand source request"} before launching more exact-query workers, and prefer a real reviewed export from GSC/Bing/Google Trends or Ahrefs, Semrush, AlsoAsked, AnswerThePublic plus validation when accessible.`,
          });
        }
        if (demandAcquisitionTasks.first_task?.report_status === "blocked_no_reviewed_rows") {
          actions.push({
            priority: "P0",
            owner: "orchestrator",
            action: "choose_next_accessible_reviewed_demand_source",
            detail: `The first demand acquisition task (${demandAcquisitionTasks.first_task.task_id}) is blocked: ${demandAcquisitionTasks.first_task.blocked_reason || "no reviewed rows available"}. Choose the next real accessible reviewed source/candidate before dispatching another acquisition subagent. Do not repeat the same blocked source or invent rows.`,
          });
        } else if (!sourceProbeLocked) {
          const selectedExpectedTask =
            demandAcquisitionTasks.first_task?.task_id &&
            selectedDemandAcquisitionTasks.length === 1 &&
            selectedDemandAcquisitionTasks[0].task_id === demandAcquisitionTasks.first_task.task_id;
          actions.push({
            priority: "P0",
            owner: "orchestrator",
            action: selectedExpectedTask ? "dispatch_canonical_ready_batch" : "rebuild_canonical_ready_batch_for_demand_acquisition",
            detail: selectedExpectedTask
              ? `Canonical dispatch is ${subagents.dispatch_path}. Launch exactly one demand_acquisition subagent for ${demandAcquisitionTasks.first_task.task_id} from ready-batch only. Do not dispatch demand-acquisition-tasks prompts directly; promotion still uses run-demand-promotion.mjs.`
              : `Demand acquisition task ${demandAcquisitionTasks.first_task?.task_id || "first task"} exists, but canonical dispatch ${subagents.dispatch_path || "ready-batch.json"} does not contain exactly that one demand_acquisition task. Rebuild subagent queue and dispatch after demand acquisition tasks, then launch only the ready-batch-selected prompt.`,
          });
        }
      }
    }
  }

  if (analytics.active_content_decisions > 0) {
    const pendingApproval = analytics.active_content_decisions_by_status.proposed || 0;
    actions.push({
      priority: pendingApproval ? "P1" : "P2",
      owner: "analytics_feedback_agent",
      action: pendingApproval ? "review_performance_decisions_for_packet_routing" : "route_approved_performance_decisions",
      detail: `${analytics.active_content_decisions} active content decision(s) exist. Proposed decisions can create gap-resolution candidates, but owner approval is required before packet refresh or generation work.`,
    });
  }

  if (Number(analytics.content_decisions_by_status.evidence_changed_needs_review || 0) > 0) {
    actions.push({
      priority: "P1",
      owner: "analytics_feedback_agent",
      action: "review_changed_evidence_decisions",
      detail: `${analytics.content_decisions_by_status.evidence_changed_needs_review} content decision(s) have changed evidence signatures. Review evidence_signature, source_export_ids, and owner notes before routing refresh, expansion, merge, retire, or packet work.`,
    });
  }

  if (analytics.feedback_input_state === "healthy_empty") {
    const demandAction = demandAcquisition?.candidate_id
      ? ` The first reviewed input should come from ${demandAcquisition.markdown_path || demandAcquisition.json_path}: ${demandAcquisition.candidate_id} -> ${demandAcquisition.staging_csv_path}.`
      : demandReadiness?.next_unambiguous_action?.candidate_id
        ? ` The first reviewed input should be ${demandReadiness.next_unambiguous_action.candidate_id} -> ${demandReadiness.next_unambiguous_action.staging_csv_path}.`
        : "";
    actions.push({
      priority: "P2",
      owner: "analytics_feedback_agent",
      action: "acquire_first_reviewed_feedback_input",
      detail: `GA4/GSC access is valid, diagnostics classify the current windows as verified empty, and the analytics feedback fixture passes. Do not create placeholder analytics rows or dispatch no-data Analytics Feedback work.${demandAction}`,
    });
  }

  if (
    subagents.artifact_check?.status &&
    !["passed", "missing"].includes(subagents.artifact_check.status)
  ) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "fix_subagent_artifact_handoff_blockers",
      detail: `Completed subagent artifacts are not dependency-safe yet. Review ${subagents.artifact_check.markdown_path || subagents.artifact_check.path} before launching the next wave.`,
    });
  }

  if (
    selectedDemandAcquisitionTasks.length === 0 &&
    subagents.counts?.selected_tasks > 0 &&
    discovery.query_handoff_status === "ready" &&
    candidates.intake_ready > 0
  ) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "launch_ready_subagents_one_per_prompt",
      detail: `${subagents.counts.selected_tasks} ready subagent task(s) are selected in ${subagents.dispatch_path}. Claim each task, launch one narrow subagent per prompt, then complete only after its artifact exists.`,
    });
  } else if (selectedDemandAcquisitionTasks.length === 0 && subagents.counts?.selected_tasks > 0) {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "launch_gap_resolution_subagents_only",
      detail: `${subagents.counts.selected_tasks} ready subagent task(s) exist, but current query handoff is ${discovery.query_handoff_status} and intake-ready candidates are ${candidates.intake_ready}. Launch only the narrow gap-resolution or orchestration work named in each prompt; do not draft, scaffold publishable packets, generate, or publish.`,
    });
  }

  if (candidates.not_intake_ready > 0) {
    const breakdown = Object.entries(candidates.by_packet_intake_status)
      .filter(([status]) => status !== "intake_ready")
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");
    actions.push({
      priority: "P1",
      owner: "topic_cartographer_and_source_registry",
      action: "resolve_packet_intake_gaps",
      detail: `${candidates.not_intake_ready} candidate(s) are not intake-ready (${breakdown || "no breakdown"}). Resolve query, source, SME, parent-asset, or thin-topic gaps before scaffolding publishable packets.`,
    });
  }

  if (Number(refreshTargets.blocked_count || 0) > 0) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "resolve_ambiguous_refresh_targets",
      detail: `${refreshTargets.blocked_count} refresh target(s) are blocked in ${refreshTargets.markdown_path || refreshTargets.json_path}. Do not scaffold replacement packets; reconcile topic coverage or packet slug lineage first.`,
    });
  } else if (Number(refreshTargets.resolved_count || 0) > 0) {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "route_resolved_refresh_targets_through_scope_gates",
      detail: `${refreshTargets.resolved_count} refresh target(s) are mapped in ${refreshTargets.markdown_path || refreshTargets.json_path}. Use the existing packet paths only after Analytics Feedback, route QA, and Orchestrator scope approval.`,
    });
  }

  if (Number((gapLedger.active_row_count ?? gapLedger.row_count) || 0) > 0) {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "route_gap_ledger_by_owner",
      detail: `${gapLedger.active_row_count ?? gapLedger.row_count} active open gap row(s) are summarized in ${gapLedger.markdown_path || gapLedger.csv_path}. Use the active owner breakdown to dispatch narrow gap-resolution agents; this ledger does not unlock packet intake.`,
    });
  }

  if (Number(gapLedger.stale_row_count || 0) > 0) {
    actions.push({
      priority: "P2",
      owner: "orchestrator",
      action: "reconcile_stale_gap_artifact_lineage",
      detail: `${gapLedger.stale_row_count} stale or mismatched artifact lineage row(s) are separated in ${gapLedger.markdown_path || gapLedger.csv_path}. Re-map by topic/topic_id before using them for future subagent routing.`,
    });
  }

  if (codexAutomations.status && codexAutomations.status !== "ready" && codexAutomations.status !== "missing") {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "repair_codex_automation_inventory",
      detail: `Codex automation audit is ${codexAutomations.status}. Review ${codexAutomations.markdown_path || codexAutomations.path} before relying on recurring daily/weekly/monthly runs.`,
    });
  } else if (codexAutomations.status === "missing") {
    actions.push({
      priority: "P1",
      owner: "orchestrator",
      action: "run_codex_automation_audit",
      detail: "Run node scripts/seo-aeo/audit-codex-automations.mjs --date <yyyy-mm-dd> so recurring automation health is captured in the daily handoff.",
    });
  }

  if (Number(skillSteward.valid_candidate_count || 0) > 0) {
    const reviewTasks = skillSteward.review_tasks || {};
    actions.push({
      priority: "P1",
      owner: "skill_steward_agent",
      action: "review_skill_learning_candidates",
      detail: `${skillSteward.valid_candidate_count} valid skill learning candidate(s) are waiting for governed review. Launch one report-only Skill Steward subagent per task from ${reviewTasks.markdown_path || skillSteward.markdown_path || skillSteward.path}. Do not promote them automatically; require evidence, validation, forward testing, and human approval before changing repo-local or global skills.`,
    });
  }

  if (publish.selected_count > 0) {
    actions.push({
      priority: "P0",
      owner: "founder_or_gtm_owner",
      action: "review_publish_plan_before_generation",
      detail: `${publish.selected_count} packet(s) are selected. Review ${publish.path} before running --generate-approved.`,
    });
  } else if (publish.blocked_count > 0) {
    actions.push({
      priority: "P0",
      owner: "orchestrator",
      action: "do_not_generate_blocked_packets",
      detail: `Publish governor selected 0 packets and blocked ${publish.blocked_count}. Fix blocker codes before generation: ${Object.keys(publish.blocker_counts).join(", ") || "none"}.`,
    });
  }

  return sortActions(actions);
}

function writeMarkdown(filePath, status) {
  const actionLines = status.next_actions.length
    ? status.next_actions.map((item) => `- ${item.priority} ${item.owner}: ${item.action} - ${item.detail}`).join("\n")
    : "- No next actions recorded.";
  const selectedSubagents = status.subagents.selected_tasks.length
    ? status.subagents.selected_tasks
        .map((task) => `- ${task.task_id}: ${task.role} -> \`${task.artifact_path}\``)
        .join("\n")
    : "- No ready subagent tasks selected.";
  const publishBlockers = Object.entries(status.publishing.blocker_counts)
    .map(([code, count]) => `- ${code}: ${count}`)
    .join("\n");
  const liveDeploymentBlocked = status.live_deployment.status === "blocked" || Number(status.live_deployment.blocked_count || 0) > 0;
  const rawDemandNextAction = status.demand_readiness.next_unambiguous_action?.action || "none";
  const demandApplyActionPending =
    Number(status.demand_readiness.current_staged_promotable_rows || 0) > 0 ||
    Number(status.demand_import_pack.validation.valid_for_promotion || 0) > 0 ||
    rawDemandNextAction === "run_validated_demand_apply_and_discovery_chain";
  const demandNextAction =
    liveDeploymentBlocked && demandApplyActionPending
      ? "wait_for_live_deployment_before_demand_apply"
      : rawDemandNextAction;
  const demandAcquisitionStatus =
    liveDeploymentBlocked && status.demand_acquisition.acquisition_status === "run_validated_demand_apply_and_discovery_chain"
      ? "wait_for_live_deployment_before_demand_apply"
      : status.demand_acquisition.acquisition_status;
  const demandRollupRecommendedAction =
    liveDeploymentBlocked && status.demand_acquisition_report_rollup.recommended_action === "run_demand_promotion_dry_run"
      ? "deferred_by_live_deployment_blocker"
      : status.demand_acquisition_report_rollup.recommended_action || "none";

  const markdown = `# SEO/AEO Run Status

Run date: ${status.run_date}
Metrics date: ${status.metrics_date}
Metrics range: ${status.metrics_start_date || "n/a"} to ${status.metrics_end_date || status.metrics_date || "n/a"}
Overall status: ${status.overall_status}

## Gates

- Daily report: ${status.daily_report.status} (${status.daily_report.path || "missing"})
- Google credentials: ${status.google.credentials.credential_mode}; OAuth file ${status.google.credentials.oauth_credentials.exists ? "present" : "missing"}
- GA4 pull: ${status.google.ga4.step_status}; GA4 rows ${status.google.ga4.total_rows}; source rows ${status.google.ga4.source_rows ?? "n/a"}; all page rows ${status.google.ga4.all_page_daily_rows}
- Search Console pull: ${status.google.search_console.step_status}; total rows ${status.google.search_console.total_rows}; source rows ${status.google.search_console.source_rows ?? "n/a"}; normalized rows ${status.google.search_console.normalized_rows ?? "n/a"}
- Measurement diagnostics: ${status.measurement_diagnostics.status}; GA4 ${status.google.ga4.diagnostics.zero_row_state}, GSC ${status.google.search_console.diagnostics.zero_row_state}
- Bing Webmaster pull: ${status.bing.webmaster.step_status}; total rows ${status.bing.webmaster.total_rows}; source rows ${status.bing.webmaster.source_rows ?? "n/a"}; normalized rows ${status.bing.webmaster.normalized_rows ?? "n/a"}
	- Feedback rollup: ${status.analytics.feedback_rollup.step_status}; derived page rows ${status.analytics.feedback_rollup.derived_page_rows ?? "n/a"}; rolled-up source rows ${status.analytics.feedback_rollup.rolled_up_source_rows ?? "n/a"}
	- Feedback rollup fixture: ${status.analytics.feedback_rollup_fixture.step_status}; derived page rows ${status.analytics.feedback_rollup_fixture.derived_page_rows ?? "n/a"}
	- Analytics feedback fixture: ${status.analytics.feedback_fixture.step_status}; proposed decisions ${status.analytics.feedback_fixture.proposed_decisions ?? "n/a"}
		- Content decision lifecycle fixture: ${status.analytics.content_decision_lifecycle_fixture.step_status}; decision ID ${status.analytics.content_decision_lifecycle_fixture.decision_id || "n/a"}
			- Feedback input state: ${status.analytics.feedback_input_state}; raw feedback lane rows ${status.analytics.raw_feedback_rows}; page decision-grade rows after rollup ${status.analytics.eligible_decision_evidence_rows}; recommended action ${status.analytics.recommended_feedback_input_action}
			- Decision evidence status: provisional ${status.analytics.provisional_page_rows}; decision-grade ${status.analytics.decision_grade_page_rows_with_status}; counts ${JSON.stringify(status.analytics.page_decision_evidence_status_counts)}
			- Active content decisions: ${status.analytics.active_content_decisions}; open rows without decision-grade evidence ${status.analytics.open_content_decisions_without_decision_grade_evidence}
			- AI citation query set: ${status.analytics.ai_citation_query_set.status}; reviewed ${status.analytics.ai_citation_query_set.reviewed_captures}/${status.analytics.ai_citation_query_set.expected_captures}; observed ${status.analytics.ai_citation_query_set.observed_captures}; missing ${status.analytics.ai_citation_query_set.missing_captures}; stale ${status.analytics.ai_citation_query_set.stale_captures}; coverage ${status.analytics.ai_citation_query_set.coverage_pct}%${status.analytics.ai_citation_query_set.markdown_path ? `; ${status.analytics.ai_citation_query_set.markdown_path}` : ""}
			- AI citation capture pack: ${status.analytics.ai_citation_query_set.capture_pack.status}; rows ${status.analytics.ai_citation_query_set.capture_pack.capture_rows}; import skeleton ${status.analytics.ai_citation_query_set.capture_pack.import_skeleton_csv || "n/a"}
			- AI citation capture tasks: ${status.analytics.ai_citation_query_set.capture_tasks.status}; tasks ${status.analytics.ai_citation_query_set.capture_tasks.task_count}; not started ${status.analytics.ai_citation_query_set.capture_tasks.not_started_count}; rows completed ${status.analytics.ai_citation_query_set.capture_tasks.completed_row_count}; ${status.analytics.ai_citation_query_set.capture_tasks.markdown_path || "n/a"}
			- AI citation row staging: ${status.analytics.ai_citation_query_set.capture_row_staging.status}; valid rows ${status.analytics.ai_citation_query_set.capture_row_staging.valid_completed_rows}; blockers ${status.analytics.ai_citation_query_set.capture_row_staging.row_blockers}; import ${status.analytics.ai_citation_query_set.capture_row_staging.import_csv || "n/a"}
			- AI citation import preflight: ${status.analytics.ai_citation_query_set.import_preflight.status}; valid ${status.analytics.ai_citation_query_set.import_preflight.valid_rows}; invalid ${status.analytics.ai_citation_query_set.import_preflight.invalid_rows}; ${status.analytics.ai_citation_query_set.import_preflight.markdown_path || "n/a"}
- Query handoff: ${status.discovery.query_handoff_status}
- Manual Reddit captures: ${status.discovery.manual_reddit_capture.lane_status}; files ${status.discovery.manual_reddit_capture.input_file_count}; normalized rows ${status.discovery.manual_reddit_capture.normalized_row_count}; Reddit API ${status.discovery.manual_reddit_capture.api_skipped ? "skipped" : status.discovery.manual_reddit_capture.api_step_status}; fixture ${status.discovery.manual_reddit_capture.fixture_step_status}
- Candidate intake ready: ${status.candidates.intake_ready}/${status.candidates.total}
- Demand import worklist: ${status.demand_import_worklist.request_count} request(s) across ${status.demand_import_worklist.candidate_count} candidate(s)
- Demand import pack: ${status.demand_import_pack.staging_file_count} staging file(s); validation ${status.demand_import_pack.validation.mode}, valid ${status.demand_import_pack.validation.valid_for_promotion}, already promoted ${status.demand_import_pack.validation.already_promoted || 0}, promoted ${status.demand_import_pack.validation.promoted}, blocked ${status.demand_import_pack.validation.blocked}, empty ${status.demand_import_pack.validation.empty_staging}
- Demand import reviews: ${status.demand_import_reviews.review_count} review artifact(s); blocked missing reviewed export ${status.demand_import_reviews.blocked_missing_reviewed_export}
- Demand readiness preflight: ${status.demand_readiness.overall_status}; hard gate ${status.demand_readiness.hard_gate_status}; current staged promotable rows ${status.demand_readiness.current_staged_promotable_rows}; projected validated rows ${status.demand_readiness.projected_validated_rows_after_apply}; projected non-monitor clusters ${status.demand_readiness.projected_non_monitor_cluster_count}
- Demand next action: ${demandNextAction}${status.demand_readiness.next_unambiguous_action?.candidate_id && demandNextAction === rawDemandNextAction ? ` (${status.demand_readiness.next_unambiguous_action.candidate_id})` : ""}
- Demand acquisition brief: ${demandAcquisitionStatus}; ${status.demand_acquisition.markdown_path || "missing"}
- Demand acquisition tasks: ${status.demand_acquisition_tasks.task_count} task(s); ${status.demand_acquisition_tasks.markdown_path || "missing"}${status.demand_acquisition_tasks.first_task?.prompt_path ? `; first prompt ${status.demand_acquisition_tasks.first_task.prompt_path}` : ""}
- Demand acquisition report rollup: ${status.demand_acquisition_report_rollup.total_reports} report(s); blocked no reviewed rows ${status.demand_acquisition_report_rollup.blocked_no_reviewed_rows}; current staged reviewed rows ${status.demand_acquisition_report_rollup.current_staged_reviewed_rows}; source-request valid ${status.demand_acquisition_report_rollup.source_request_valid_for_promotion}; stale staged reports ${status.demand_acquisition_report_rollup.stale_staged_reviewed_rows}; recommended action ${demandRollupRecommendedAction}${status.demand_acquisition_report_rollup.markdown_path ? `; ${status.demand_acquisition_report_rollup.markdown_path}` : ""}
- Demand source request: ${status.demand_acquisition_report_rollup.source_request?.status || "missing"}; requested exports ${status.demand_acquisition_report_rollup.source_request?.requested_export_count ?? "n/a"}${status.demand_acquisition_report_rollup.source_request?.markdown_path ? `; ${status.demand_acquisition_report_rollup.source_request.markdown_path}` : ""}
- Live deployment: ${status.live_deployment.status}; blocked ${status.live_deployment.blocked_count}; routes ${status.live_deployment.route_count}${status.live_deployment.markdown_path ? `; ${status.live_deployment.markdown_path}` : ""}
- Deployment readiness: ${status.deployment_readiness.status}; clean publish ${status.deployment_readiness.netlify_publish_check_status} (${status.deployment_readiness.netlify_publish_check_blocked_count} blocked); Netlify CLI ${status.deployment_readiness.netlify_cli_available ? "available" : "missing"}; dirty paths ${status.deployment_readiness.dirty_count}${status.deployment_readiness.markdown_path ? `; ${status.deployment_readiness.markdown_path}` : ""}
- Deploy review: ${status.deploy_review.status}; freshness ${status.deploy_review.freshness_status}; static changes ${status.deploy_review.deploy_static_changed_count}; build support changes ${status.deploy_review.netlify_build_support_changed_count}; uncategorized ${status.deploy_review.uncategorized_changed_count}${status.deploy_review.markdown_path ? `; ${status.deploy_review.markdown_path}` : ""}
- Final daily gates: ${status.run_gates.gate_status}; blockers ${status.run_gates.blocker_count}; warnings ${status.run_gates.warning_count}${status.run_gates.markdown_path ? `; ${status.run_gates.markdown_path}` : ""}
- Canonical dispatch: ${status.canonical_dispatch.mode}; selected ${status.canonical_dispatch.selected_task_count}; expected ${status.canonical_dispatch.expected_task_id || "n/a"}; alignment ${status.canonical_dispatch.alignment}; ${status.canonical_dispatch.path || "missing"}
- Subagent status ledger: queue ${status.subagents.status_ledger.queue_task_count}; ledger entries ${status.subagents.status_ledger.ledger_entry_count}; current entries ${status.subagents.status_ledger.current_queue_entry_count}; implicit queued current ${status.subagents.status_ledger.implicit_queued_current_task_count}; preserved history ${status.subagents.status_ledger.out_of_current_queue_entry_count}${status.subagents.status_ledger.markdown_path ? `; ${status.subagents.status_ledger.markdown_path}` : ""}
- Refresh targets: ${status.refresh_targets.row_count} candidate(s); resolved ${status.refresh_targets.resolved_count}, blocked ${status.refresh_targets.blocked_count}
- Gap ledger: ${status.gap_ledger.row_count} total row(s); active ${status.gap_ledger.active_row_count}, stale/lineage ${status.gap_ledger.stale_row_count}
- Codex automations: ${status.codex_automations.status}; ready ${status.codex_automations.ready}/${status.codex_automations.total_expected}, needs update ${status.codex_automations.needs_update}, missing ${status.codex_automations.missing_required}
- Skill Steward: ${status.skill_steward.decision}; valid candidates ${status.skill_steward.valid_candidate_count}, invalid ${status.skill_steward.invalid_candidate_count}${status.skill_steward.markdown_path ? `; ${status.skill_steward.markdown_path}` : ""}; review tasks ${status.skill_steward.review_tasks.task_count} (${status.skill_steward.review_tasks.not_started_count} not started)${status.skill_steward.review_tasks.markdown_path ? `; ${status.skill_steward.review_tasks.markdown_path}` : ""}
- Publish governor: ${status.publishing.status}; selected ${status.publishing.selected_count}, blocked ${status.publishing.blocked_count}

## Next Actions

${actionLines}

## Ready Subagents

${selectedSubagents}

## Publish Blockers

${publishBlockers || "- None."}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const explicitMetricsDate = arg("--metrics-date", "");
  const config = loadConfig(root);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const dailyReportPath = path.join(outputDir, "daily-report.json");
  const contentReportPath = path.join(outputDir, "content-run-report.json");
  const dailyReport = readJson(dailyReportPath, null);
  const contentReport = readJson(contentReportPath, null);
  const metricsDate = explicitMetricsDate || dailyReport?.metrics_end_date || dailyReport?.metrics_date || daysAgo(3);
  const metricsStartDate = dailyReport?.metrics_start_date || "";
  const metricsEndDate = dailyReport?.metrics_end_date || metricsDate;
  const measurementDiagnostics = measurementDiagnosticsSummary(root, runDate);
  const google = googleSummary(root, config, dailyReport || {});
  google.ga4.diagnostics = measurementDiagnostics.ga4;
  google.search_console.diagnostics = measurementDiagnostics.search_console;
  const bing = bingSummary(root, config, dailyReport || {});
  const discovery = discoverySummary(root, runDate, dailyReport || {});
  const candidates = candidateSummary(root, runDate);
  const demandImportWorklist = demandImportWorklistSummary(root, runDate);
  const demandImportPack = demandImportPackSummary(root, runDate);
  const demandImportReviews = demandImportReviewSummary(root, runDate);
  const demandReadiness = demandReadinessSummary(root, runDate);
  const demandAcquisition = demandAcquisitionSummary(root, runDate);
  const demandAcquisitionTasks = demandAcquisitionTaskSummary(root, runDate);
  const demandAcquisitionReportRollup = demandAcquisitionReportRollupSummary(root, runDate);
  const liveDeployment = liveDeploymentSummary(root, runDate, dailyReport || {});
  const deploymentReadiness = deploymentReadinessSummary(root, runDate, dailyReport || {});
  const deployReview = deployReviewSummary(root, runDate);
  const runGates = runGatesSummary(root, runDate);
  const gapLedger = gapLedgerSummary(root, runDate);
  const codexAutomations = codexAutomationSummary(root, runDate);
  const skillSteward = skillStewardSummary(root, runDate);
  const subagents = subagentSummary(root, runDate);
  const publishing = publishSummary(root, runDate);
  const refreshTargets = refreshTargetsSummary(root, runDate);
  const analytics = analyticsSummary(root, dailyReport || {}, measurementDiagnostics);
  const status = {
    schema_version: "1.0",
    run_date: runDate,
    metrics_date: metricsDate,
    metrics_start_date: metricsStartDate,
    metrics_end_date: metricsEndDate,
    generated_at: new Date().toISOString(),
    overall_status: overallStatus({ dailyReport, google, discovery, candidates, publish: publishing, liveDeployment }),
    daily_report: {
      path: fs.existsSync(dailyReportPath) ? relative(root, dailyReportPath) : "",
      status: dailyReport?.status || "missing",
      failed_steps: (dailyReport?.steps || []).filter((step) => step.status === "failed").map((step) => step.name),
      skipped_steps: (dailyReport?.steps || []).filter((step) => /^skipped/.test(step.status)).map((step) => ({
        name: step.name,
        status: step.status,
      })),
    },
    content_run_report: {
      path: fs.existsSync(contentReportPath) ? relative(root, contentReportPath) : "",
      status: contentReport?.status || "missing",
      generate_mode: contentReport?.generate_mode || "",
    },
    google,
    measurement_diagnostics: measurementDiagnostics,
    bing,
    analytics,
    discovery,
    candidates,
    demand_import_worklist: demandImportWorklist,
    demand_import_pack: demandImportPack,
    demand_import_reviews: demandImportReviews,
    demand_readiness: demandReadiness,
    demand_acquisition: demandAcquisition,
    demand_acquisition_tasks: demandAcquisitionTasks,
    demand_acquisition_report_rollup: demandAcquisitionReportRollup,
    live_deployment: liveDeployment,
    deployment_readiness: deploymentReadiness,
    deploy_review: deployReview,
    run_gates: runGates,
    refresh_targets: refreshTargets,
    gap_ledger: gapLedger,
    codex_automations: codexAutomations,
    skill_steward: skillSteward,
    subagents,
    publishing,
  };
  status.canonical_dispatch = canonicalDispatchSummary(subagents, demandAcquisitionTasks);
  status.next_actions = nextActions({
    runDate,
    google,
    bing,
    analytics,
    discovery,
    candidates,
    demandImportWorklist,
    demandImportPack,
    demandImportReviews,
    demandReadiness,
    demandAcquisition,
    demandAcquisitionTasks,
      demandAcquisitionReportRollup,
      liveDeployment,
      deploymentReadiness,
      deployReview,
      refreshTargets,
    gapLedger,
    codexAutomations,
    skillSteward,
    subagents,
    publish: publishing,
  });

  const jsonPath = path.join(outputDir, "run-status.json");
  const markdownPath = path.join(outputDir, "run-status.md");
  const nextActionsPath = path.join(outputDir, "next-actions.json");
  writeJsonAtomic(jsonPath, status);
  writeJsonAtomic(nextActionsPath, {
    run_date: runDate,
    generated_at: status.generated_at,
    overall_status: status.overall_status,
    next_actions: status.next_actions,
  });
  writeMarkdown(markdownPath, status);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        overall_status: status.overall_status,
        run_status_json: relative(root, jsonPath),
        run_status_md: relative(root, markdownPath),
        next_actions_json: relative(root, nextActionsPath),
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
