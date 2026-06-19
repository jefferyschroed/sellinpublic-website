#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "./lib/config.mjs";
import { toCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const CAPTURE_HEADERS = [
  "run_date",
  "capture_status",
  "capture_id",
  "query_set_id",
  "query_set_version",
  "query_id",
  "query",
  "surface",
  "target_page_url",
  "intent",
  "priority",
  "latest_capture_date",
  "reviewed_match_count",
  "operator_instruction",
  "allowed_use",
];

const IMPORT_HEADERS = [
  "capture_date",
  "query_set_id",
  "query_set_version",
  "query_id",
  "query",
  "surface",
  "capture_method",
  "source_export_id",
  "source_file",
  "captured_by",
  "reviewer",
  "target_page_url",
  "cited_url",
  "cited_domain",
  "is_sell_in_public",
  "citation_position",
  "answer_angle",
  "answer_accuracy",
  "competitors_cited",
  "missing_angle",
  "recommended_action",
  "notes",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function captureRows(report, runDate) {
  const rows = [
    ...(report.missing_captures || []),
    ...(report.stale_captures || []),
    ...(report.unreviewed_captures || []),
  ];
  return rows.map((row) => {
    const captureStatus = row.status || (row.latest_capture_date ? "needs_review" : "missing_capture");
    return {
      run_date: runDate,
      capture_status: captureStatus,
      capture_id: row.capture_id || `${row.query_id || "query"}:${row.surface || "surface"}`,
      query_set_id: row.query_set_id || report.query_set_id || "",
      query_set_version: row.query_set_version || report.query_set_version || "",
      query_id: row.query_id || "",
      query: row.query || "",
      surface: row.surface || "",
      target_page_url: row.target_page_url || "",
      intent: row.intent || "",
      priority: row.priority || "",
      latest_capture_date: row.latest_capture_date || "",
      reviewed_match_count: row.reviewed_match_count ?? "",
      operator_instruction:
        "Manually review this exact query on this surface. Record cited URLs, competitors, answer angle, accuracy, missing angle, and recommended action. Do not use unofficial scraping or cite the answer as factual source evidence.",
      allowed_use: "visibility_monitoring_only",
    };
  });
}

function importSkeletonRows(rows, runDate) {
  return rows.map((row) => ({
    capture_date: runDate,
    query_set_id: row.query_set_id,
    query_set_version: row.query_set_version,
    query_id: row.query_id,
    query: row.query,
    surface: row.surface,
    capture_method: captureMethodForSurface(row.surface),
    source_export_id: "",
    source_file: "",
    captured_by: "ai-citation-capture-pack",
    reviewer: "",
    target_page_url: row.target_page_url,
    cited_url: "",
    cited_domain: "",
    is_sell_in_public: "",
    citation_position: "",
    answer_angle: "",
    answer_accuracy: "",
    competitors_cited: "",
    missing_angle: "",
    recommended_action: "",
    notes: `capture_id=${row.capture_id}; allowed_use=visibility_monitoring_only`,
  }));
}

function captureMethodForSurface(surface) {
  if (surface === "google_search") return "manual_serp_observation";
  if (surface === "google_ai_overview") return "manual_ai_overview_observation";
  if (["chatgpt", "perplexity", "gemini", "bing_copilot"].includes(surface)) return "manual_ai_answer_observation";
  return "";
}

function writeMarkdown(filePath, summary, rows) {
  const lines = rows.length
    ? rows.map((row) => `- ${row.capture_status}: ${row.capture_id} - ${row.query} on ${row.surface}`).join("\n")
    : "- None. The fixed query set is fully reviewed for the current freshness window.";
  const markdown = `# AI Citation Capture Pack

Run date: ${summary.run_date}
Status: ${summary.status}
Query set: ${summary.query_set_id} ${summary.query_set_version}

## Summary

- Capture rows: ${summary.capture_rows}
- Missing captures: ${summary.missing_captures}
- Stale captures: ${summary.stale_captures}
- Unreviewed captures: ${summary.unreviewed_captures}
- Capture worksheet: ${summary.capture_pack_csv}
- Import skeleton: ${summary.import_skeleton_csv}

## Capture Queue

${lines}

## Rules

Use this pack to complete manual visibility and answer-accuracy monitoring. Do not automate unofficial answer-engine scraping. Do not cite answer-engine output, autocomplete, or query tools as factual article evidence.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const reportPath = path.join(root, arg("--query-set-check", `automation-runs/${runDate}/ai-citation-query-set-check.json`));
  const report = readJsonIfExists(reportPath);
  if (!report.status) throw new Error(`Missing AI citation query-set check report: ${relative(root, reportPath)}`);

  const outputDir = path.join(root, "automation-runs", runDate);
  const rows = captureRows(report, runDate);
  const capturePackPath = path.join(outputDir, "ai-citation-capture-pack.csv");
  const importSkeletonPath = path.join(outputDir, "ai-citation-import-skeleton.csv");
  const jsonPath = path.join(outputDir, "ai-citation-capture-pack.json");
  const mdPath = path.join(outputDir, "ai-citation-capture-pack.md");

  writeCsvAtomic(capturePackPath, CAPTURE_HEADERS, rows);
  writeCsvAtomic(importSkeletonPath, IMPORT_HEADERS, importSkeletonRows(rows, runDate));

  const summary = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: rows.length ? "capture_needed" : "ready",
    query_set_id: report.query_set_id || "",
    query_set_version: report.query_set_version || "",
    source_check_report: relative(root, reportPath),
    capture_rows: rows.length,
    missing_captures: report.missing_captures?.length || 0,
    stale_captures: report.stale_captures?.length || 0,
    unreviewed_captures: report.unreviewed_captures?.length || 0,
    capture_pack_csv: relative(root, capturePackPath),
    import_skeleton_csv: relative(root, importSkeletonPath),
    capture_pack_md: relative(root, mdPath),
    rule: "Capture pack rows are monitoring tasks only. They do not validate demand or provide factual article evidence.",
  };
  writeJsonAtomic(jsonPath, summary);
  writeMarkdown(mdPath, summary, rows);
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
