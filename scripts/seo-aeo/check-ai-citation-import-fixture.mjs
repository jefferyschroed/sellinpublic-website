#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-20";
const HEADERS = [
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
        query_set_version: RUN_DATE,
        status: "active",
        surfaces: [{ surface_id: "chatgpt", active: true }],
        queries: [
          {
            query_id: "q1",
            query: "what is employee generated content",
            target_page_url: "https://sellinpublic.co/blog/example/",
            active: true,
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

function validRow(overrides = {}) {
  return {
    capture_date: RUN_DATE,
    query_set_id: "fixture-ai-citation",
    query_set_version: RUN_DATE,
    query_id: "q1",
    query: "what is employee generated content",
    surface: "chatgpt",
    capture_method: "manual_ai_answer_observation",
    source_export_id: "manual-answer-review-2099-01-20",
    source_file: "imports/ai-citations/current.csv",
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
    notes: "Manual review fixture.",
    ...overrides,
  };
}

function supplementalRow() {
  return validRow({
    query_set_id: "",
    query_set_version: "",
    query_id: "",
    query: "live route check",
    surface: "manual_url_check",
    answer_angle: "Route returned 200.",
    notes: "Supplemental URL observation.",
  });
}

function skeletonRow() {
  return validRow({
    source_export_id: "",
    source_file: "",
    captured_by: "ai-citation-capture-pack",
    reviewer: "",
    cited_url: "",
    cited_domain: "",
    is_sell_in_public: "",
    citation_position: "",
    answer_angle: "",
    answer_accuracy: "",
    competitors_cited: "",
    missing_angle: "",
    recommended_action: "",
    notes: "capture_id=q1:chatgpt; allowed_use=visibility_monitoring_only",
  });
}

function writeImport(root, fileName, rows) {
  const filePath = path.join(root, "imports/ai-citations", fileName);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, toCsv(HEADERS, rows));
}

function runPreflight(repo, tempRoot, args = []) {
  return spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/check-ai-citation-import.mjs"), "--date", RUN_DATE, "--strict", ...args],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
}

function runImporter(repo, tempRoot, args = []) {
  return spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/import-analytics-exports.mjs"), "--date", RUN_DATE, "--strict", ...args],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
}

function readReport(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "automation-runs", RUN_DATE, "ai-citation-import-preflight.json"), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-ai-citation-import-"));
  try {
    writeQuerySet(tempRoot);
    writeImport(tempRoot, "current.csv", [validRow(), supplementalRow()]);
    let result = runPreflight(repo, tempRoot);
    let output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    let report = readReport(tempRoot);
    assert(result.status === 0, `expected valid import to pass. Output: ${output}. Report: ${JSON.stringify(report.rows)}`);
    assert(report.valid_rows === 1, `expected one valid row, got ${report.valid_rows}`);
    assert(report.supplemental_rows === 1, `expected one supplemental row, got ${report.supplemental_rows}`);

    fs.rmSync(path.join(tempRoot, "imports/ai-citations"), { recursive: true, force: true });
    writeImport(tempRoot, "unsafe.csv", [
      validRow({
        surface: "unknown_surface",
        reviewer: "",
        notes: "Captured by unofficial ChatGPT network response in devtools.",
      }),
    ]);
    result = runPreflight(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 1, `expected unsafe import to fail. Output: ${output}`);
    report = readReport(tempRoot);
    assert(report.invalid_rows === 1, `expected one invalid row, got ${report.invalid_rows}`);
    const issues = report.rows[0].issues || "";
    assert(issues.includes("unsupported_surface"), `expected unsupported_surface issue, got ${issues}`);
    assert(issues.includes("missing_reviewer"), `expected missing_reviewer issue, got ${issues}`);
    assert(issues.includes("unsafe_capture_method"), `expected unsafe_capture_method issue, got ${issues}`);

    fs.rmSync(path.join(tempRoot, "imports/ai-citations"), { recursive: true, force: true });
    fs.rmSync(path.join(tempRoot, "analytics"), { recursive: true, force: true });
    writeImport(tempRoot, "copied-skeleton.csv", [skeletonRow()]);
    result = runPreflight(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 1, `expected copied skeleton preflight to fail. Output: ${output}`);
    report = readReport(tempRoot);
    assert(report.invalid_rows === 1, `expected one invalid skeleton row, got ${report.invalid_rows}`);
    const skeletonIssues = report.rows[0].issues || "";
    assert(skeletonIssues.includes("missing_source_provenance"), `expected missing_source_provenance issue, got ${skeletonIssues}`);
    assert(skeletonIssues.includes("missing_reviewer"), `expected missing_reviewer issue, got ${skeletonIssues}`);
    assert(skeletonIssues.includes("missing_observation_detail"), `expected missing_observation_detail issue, got ${skeletonIssues}`);

    result = runImporter(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 1, `expected copied skeleton importer to fail strict mode. Output: ${output}`);
    assert(!fs.existsSync(path.join(tempRoot, "analytics", "ai_citation_log.csv")), "strict importer must not create ai_citation_log.csv from skeleton rows.");

    console.log(JSON.stringify({ ok: true, fixture: "ai-citation-import-preflight" }, null, 2));
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
