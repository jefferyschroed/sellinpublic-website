#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readCsv } from "./lib/csv.mjs";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";
import { canonicalPageUrl } from "./lib/scoring.mjs";

const DEFAULT_QUERY_SET = "docs/seo-aeo/ai-citation-query-set.json";
const DEFAULT_LOG = "analytics/ai_citation_log.csv";
const CADENCE_MAX_AGE_DAYS = {
  daily: 2,
  weekly: 10,
  weekly_thursday: 10,
  biweekly: 18,
  monthly: 40,
};

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function bool(value) {
  return value === true || ["true", "1", "yes", "active"].includes(normalize(value));
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.floor((end - start) / 86_400_000);
}

function maxAgeFor(querySet) {
  return CADENCE_MAX_AGE_DAYS[normalize(querySet.cadence)] ?? CADENCE_MAX_AGE_DAYS.weekly;
}

function isEffective(row, runDate) {
  const start = row.effective_start_date || "";
  return !start || start <= runDate;
}

function validateQuerySet(querySet) {
  const issues = [];
  if (!querySet || typeof querySet !== "object") return [{ type: "missing_or_invalid_json", detail: DEFAULT_QUERY_SET }];
  for (const field of ["schema_version", "query_set_id", "query_set_version", "status", "effective_start_date", "cadence", "rule"]) {
    if (!String(querySet[field] || "").trim()) issues.push({ type: "missing_required_field", detail: field });
  }
  if (!Array.isArray(querySet.surfaces) || !querySet.surfaces.length) issues.push({ type: "missing_surfaces", detail: "surfaces" });
  if (!Array.isArray(querySet.queries) || !querySet.queries.length) issues.push({ type: "missing_queries", detail: "queries" });

  const surfaceIds = new Set();
  for (const [index, surface] of (querySet.surfaces || []).entries()) {
    if (!surface.surface_id) issues.push({ type: "missing_surface_id", detail: `surfaces[${index}]` });
    const key = normalize(surface.surface_id);
    if (key && surfaceIds.has(key)) issues.push({ type: "duplicate_surface_id", detail: surface.surface_id });
    if (key) surfaceIds.add(key);
  }

  const queryIds = new Set();
  for (const [index, query] of (querySet.queries || []).entries()) {
    for (const field of ["query_id", "query", "target_page_url", "effective_start_date"]) {
      if (!String(query[field] || "").trim()) issues.push({ type: "missing_query_field", detail: `queries[${index}].${field}` });
    }
    const key = normalize(query.query_id);
    if (key && queryIds.has(key)) issues.push({ type: "duplicate_query_id", detail: query.query_id });
    if (key) queryIds.add(key);
  }
  return issues;
}

function activeSurfaces(querySet) {
  return (querySet.surfaces || []).filter((surface) => bool(surface.active));
}

function activeQueries(querySet, runDate) {
  return (querySet.queries || []).filter((query) => bool(query.active) && isEffective(query, runDate));
}

function expectedCaptures(querySet, runDate) {
  const setId = querySet.query_set_id || "";
  const version = querySet.query_set_version || "";
  return activeQueries(querySet, runDate).flatMap((query) =>
    activeSurfaces(querySet).map((surface) => ({
      query_set_id: setId,
      query_set_version: version,
      query_id: query.query_id,
      query: query.query,
      surface: surface.surface_id,
      target_page_url: query.target_page_url,
      slug: query.target_slug || "",
      intent: query.intent || "",
      capture_id: `${query.query_id}:${surface.surface_id}`,
    }))
  );
}

function rowMatchesExpected(row, expected) {
  const rowSet = normalize(row.query_set_id);
  const rowVersion = normalize(row.query_set_version);
  const rowQueryId = normalize(row.query_id);
  const rowSurface = normalize(row.surface);
  if (rowSet && rowSet !== normalize(expected.query_set_id)) return false;
  if (rowVersion && rowVersion !== normalize(expected.query_set_version)) return false;
  if (rowQueryId) return rowQueryId === normalize(expected.query_id) && rowSurface === normalize(expected.surface);
  return (
    normalize(row.query) === normalize(expected.query) &&
    rowSurface === normalize(expected.surface) &&
    canonicalPageUrl(row.target_page_url || "") === canonicalPageUrl(expected.target_page_url || "")
  );
}

function hasReviewedProvenance(row) {
  return Boolean(String(row.source_export_id || row.source_file || "").trim()) && Boolean(String(row.reviewer || row.reviewed_by || "").trim());
}

function hasMeaningfulObservation(row) {
  return ["cited_url", "answer_accuracy", "recommended_action", "missing_angle", "answer_angle"].some((field) =>
    String(row[field] || "").trim()
  );
}

function newest(rows) {
  return [...rows].sort((a, b) => String(a.capture_date || "").localeCompare(String(b.capture_date || ""))).at(-1) || null;
}

function uniqueExtraRows(logRows, expectedRows) {
  return logRows
    .filter((row) => !expectedRows.some((expected) => rowMatchesExpected(row, expected)))
    .map((row) => ({
      capture_date: row.capture_date || "",
      query_id: row.query_id || "",
      query: row.query || "",
      surface: row.surface || "",
      target_page_url: row.target_page_url || "",
    }));
}

function writeMarkdown(filePath, report) {
  const missingLines = report.missing_captures.length
    ? report.missing_captures.map((row) => `- ${row.capture_id}: ${row.query} on ${row.surface}`).join("\n")
    : "- None.";
  const staleLines = report.stale_captures.length
    ? report.stale_captures.map((row) => `- ${row.capture_id}: latest ${row.latest_capture_date || "missing"}`).join("\n")
    : "- None.";
  const unreviewedLines = report.unreviewed_captures.length
    ? report.unreviewed_captures.map((row) => `- ${row.capture_id}: ${row.query} on ${row.surface}`).join("\n")
    : "- None.";
  const extraLines = report.extra_observations.length
    ? report.extra_observations.slice(0, 20).map((row) => `- ${row.capture_date}: ${row.query || row.query_id} on ${row.surface}`).join("\n")
    : "- None.";

  const markdown = `# AI Citation Query Set Check

Run date: ${report.run_date}
Status: ${report.status}
Query set: ${report.query_set_id} ${report.query_set_version}

## Summary

- Expected captures: ${report.expected_captures}
- Observed captures: ${report.observed_captures}
- Reviewed captures: ${report.reviewed_captures}
- Coverage: ${report.coverage_pct}%
- Missing captures: ${report.missing_captures.length}
- Stale captures: ${report.stale_captures.length}
- Unreviewed captures: ${report.unreviewed_captures.length}
- Extra observations: ${report.extra_observations.length}

## Missing Captures

${missingLines}

## Stale Captures

${staleLines}

## Unreviewed Captures

${unreviewedLines}

## Extra Observations

${extraLines}

## Rule

The query set is the fixed denominator for weekly AI/search citation checks. Rows here monitor visibility and answer quality; they do not validate demand or support factual article claims.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const querySetPath = path.join(root, arg("--query-set", DEFAULT_QUERY_SET));
  const logPath = path.join(root, arg("--log", DEFAULT_LOG));
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const jsonPath = path.join(outputDir, "ai-citation-query-set-check.json");
  const mdPath = path.join(outputDir, "ai-citation-query-set-check.md");

  const querySet = readJson(querySetPath, null);
  const logRows = readCsv(logPath).rows;
  const validationIssues = validateQuerySet(querySet);
  const expectedRows = validationIssues.length ? [] : expectedCaptures(querySet, runDate);
  const maxAgeDays = querySet ? maxAgeFor(querySet) : CADENCE_MAX_AGE_DAYS.weekly;
  const coverage = expectedRows.map((expected) => {
    const matches = logRows.filter((row) => rowMatchesExpected(row, expected));
    const latest = newest(matches);
    const latestAge = latest ? daysBetween(latest.capture_date, runDate) : Number.POSITIVE_INFINITY;
    const reviewedMatches = matches.filter((row) => hasReviewedProvenance(row) && hasMeaningfulObservation(row));
    return {
      ...expected,
      match_count: matches.length,
      reviewed_match_count: reviewedMatches.length,
      latest_capture_date: latest?.capture_date || "",
      status: !matches.length
        ? "missing_capture"
        : latestAge > maxAgeDays
          ? "stale_capture"
          : reviewedMatches.length
            ? "reviewed_capture"
            : "unreviewed_capture",
    };
  });

  const missing = coverage.filter((row) => row.status === "missing_capture");
  const stale = coverage.filter((row) => row.status === "stale_capture");
  const unreviewed = coverage.filter((row) => row.status === "unreviewed_capture");
  const reviewed = coverage.filter((row) => row.status === "reviewed_capture");
  const extra = validationIssues.length ? [] : uniqueExtraRows(logRows, expectedRows);
  const coveragePct = expectedRows.length ? Math.round((reviewed.length / expectedRows.length) * 1000) / 10 : 0;
  const status = validationIssues.length
    ? "blocked_invalid_query_set"
    : missing.length || stale.length || unreviewed.length
      ? "needs_capture"
      : "ready";

  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status,
    query_set_path: path.relative(root, querySetPath),
    citation_log_path: path.relative(root, logPath),
    query_set_id: querySet?.query_set_id || "",
    query_set_version: querySet?.query_set_version || "",
    expected_captures: expectedRows.length,
    observed_captures: coverage.filter((row) => row.match_count > 0).length,
    reviewed_captures: reviewed.length,
    coverage_pct: coveragePct,
    missing_captures: missing,
    stale_captures: stale,
    unreviewed_captures: unreviewed,
    extra_observations: extra,
    coverage,
    validation_issues: validationIssues,
    rule:
      "Fixed AI citation query-set rows monitor visibility and answer quality. They do not validate demand or support factual article claims.",
  };

  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: status !== "blocked_invalid_query_set",
        status,
        query_set_id: report.query_set_id,
        query_set_version: report.query_set_version,
        expected_captures: report.expected_captures,
        observed_captures: report.observed_captures,
        reviewed_captures: report.reviewed_captures,
        missing_captures: missing.length,
        stale_captures: stale.length,
        unreviewed_captures: unreviewed.length,
        coverage_pct: coveragePct,
        ai_citation_query_set_check_json: path.relative(root, jsonPath),
        ai_citation_query_set_check_md: path.relative(root, mdPath),
      },
      null,
      2
    )
  );
  if (status === "blocked_invalid_query_set") process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
