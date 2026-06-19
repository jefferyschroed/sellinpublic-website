#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-20";
const AI_HEADERS = [
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

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeQuerySet(root) {
  const filePath = path.join(root, "docs/seo-aeo/ai-citation-query-set.json");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        schema_version: "1.0",
        query_set_id: "fixture-ai-citation",
        query_set_version: "2099-01-20",
        status: "active",
        effective_start_date: "2099-01-01",
        cadence: "weekly_thursday",
        timezone: "America/Los_Angeles",
        surfaces: [
          { surface_id: "chatgpt", active: true },
          { surface_id: "perplexity", active: true },
        ],
        queries: [
          {
            query_id: "q1",
            query: "what is employee generated content",
            intent: "definition",
            target_page_url: "https://sellinpublic.co/blog/example/",
            active: true,
            effective_start_date: "2099-01-01",
          },
          {
            query_id: "q2",
            query: "employee generated content examples",
            intent: "examples",
            target_page_url: "https://sellinpublic.co/blog/example/",
            active: true,
            effective_start_date: "2099-01-01",
          },
          {
            query_id: "future",
            query: "future query",
            intent: "future",
            target_page_url: "https://sellinpublic.co/blog/future/",
            active: true,
            effective_start_date: "2099-02-01",
          },
        ],
        rule: "Fixture query set for comparable AI citation checks.",
      },
      null,
      2
    )}\n`
  );
}

function row(queryId, query, surface) {
  return {
    capture_date: RUN_DATE,
    query_set_id: "fixture-ai-citation",
    query_set_version: "2099-01-20",
    query_id: queryId,
    query,
    surface,
    capture_method: surface === "google_search" ? "manual_serp_observation" : "manual_ai_answer_observation",
    source_export_id: "fixture-export",
    source_file: "analytics/ai_citation_log.csv",
    captured_by: "fixture",
    reviewer: "qa",
    target_page_url: "https://sellinpublic.co/blog/example/",
    cited_url: "",
    cited_domain: "",
    is_sell_in_public: "false",
    citation_position: "",
    answer_angle: "Fixture answer angle.",
    answer_accuracy: "accurate",
    competitors_cited: "example.com",
    missing_angle: "Fixture missing angle.",
    recommended_action: "monitor",
    notes: "Fixture reviewed no-citation observation.",
  };
}

function oldVersionRow(queryId, query, surface) {
  return {
    ...row(queryId, query, surface),
    query_set_version: "2099-01-13",
    notes: "Fixture row from an old query-set version. It must not satisfy the active denominator.",
  };
}

function writeLog(root, rows) {
  const filePath = path.join(root, "analytics/ai_citation_log.csv");
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(AI_HEADERS, rows));
}

function writeImport(root, fileName, rows) {
  const filePath = path.join(root, "imports/ai-citations", fileName);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(AI_HEADERS, rows));
}

function runChecker(repoRootPath, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRootPath, "scripts/seo-aeo/check-ai-citation-query-set.mjs"),
      "--date",
      RUN_DATE,
      "--query-set",
      "docs/seo-aeo/ai-citation-query-set.json",
      "--log",
      "analytics/ai_citation_log.csv",
    ],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`checker failed: ${output}`);
  return JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-query-set-check.json"), "utf8"));
}

function runImporter(repoRootPath, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRootPath, "scripts/seo-aeo/import-analytics-exports.mjs"), "--date", RUN_DATE],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`importer failed: ${output}`);
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-ai-citation-query-set-"));
  try {
    writeQuerySet(tempRoot);
    const completeRows = [
      row("q1", "what is employee generated content", "chatgpt"),
      row("q1", "what is employee generated content", "perplexity"),
      row("q2", "employee generated content examples", "chatgpt"),
      row("q2", "employee generated content examples", "perplexity"),
      oldVersionRow("q2", "employee generated content examples", "perplexity"),
      row("extra", "untracked query", "chatgpt"),
    ];
    writeLog(tempRoot, completeRows);
    const ready = runChecker(repo, tempRoot);
    assert(ready.status === "ready", `expected ready, got ${ready.status}`);
    assert(ready.expected_captures === 4, `expected 4 captures, got ${ready.expected_captures}`);
    assert(ready.reviewed_captures === 4, `expected 4 reviewed captures, got ${ready.reviewed_captures}`);
    assert(ready.extra_observations.length === 2, "expected one untracked observation and one old-version observation.");

    writeLog(tempRoot, [
      row("q1", "what is employee generated content", "chatgpt"),
      row("q1", "what is employee generated content", "perplexity"),
      row("q2", "employee generated content examples", "chatgpt"),
      oldVersionRow("q2", "employee generated content examples", "perplexity"),
    ]);
    const missing = runChecker(repo, tempRoot);
    assert(missing.status === "needs_capture", `expected needs_capture, got ${missing.status}`);
    assert(missing.missing_captures.length === 1, `expected one missing capture, got ${missing.missing_captures.length}`);
    assert(missing.missing_captures[0].capture_id === "q2:perplexity", `expected q2:perplexity to stay missing, got ${missing.missing_captures[0].capture_id}.`);

    fs.rmSync(path.join(tempRoot, "analytics", "ai_citation_log.csv"), { force: true });
    writeImport(tempRoot, "2099-01-20-current.csv", [row("q1", "what is employee generated content", "chatgpt")]);
    writeImport(tempRoot, "2099-01-20-old-version.csv", [oldVersionRow("q1", "what is employee generated content", "chatgpt")]);
    const importResult = runImporter(repo, tempRoot);
    const importedRows = fs.readFileSync(path.join(tempRoot, "analytics", "ai_citation_log.csv"), "utf8").trim().split("\n").slice(1);
    assert(importedRows.length === 1, `expected importer to reject the old query-set version, got ${importedRows.length} imported row(s).`);
    assert(importResult.invalid.length === 1, `expected one invalid old-version row, got ${importResult.invalid.length}.`);
    assert(
      importResult.invalid[0].issues.includes("query_set_version_mismatch"),
      "expected old-version import to be rejected for query_set_version_mismatch."
    );

    console.log(JSON.stringify({ ok: true, fixture: "ai-citation-query-set" }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
