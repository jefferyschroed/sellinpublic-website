#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-13";
const RUN_ID = `${RUN_DATE}-daily-discovery`;
const IMPORT_HEADERS = [
  "capture_date",
  "observed_at",
  "source",
  "source_type",
  "source_record_id",
  "query",
  "subreddit",
  "thread_url",
  "post_or_comment",
  "surface",
  "country",
  "language",
  "intent",
  "funnel_stage",
  "confidence",
  "evidence_use",
  "allowed_public_use",
  "capture_method",
  "collection_method",
  "api_used",
  "uses_reddit_api",
  "sanitization_status",
  "license_or_terms_note",
  "captured_by",
  "notes",
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(cwd, args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (options.allowFailure !== true) {
    assert(result.status === 0, `${args.join(" ")} failed: ${output}`);
  }
  return { ...result, output };
}

function writeRedditCapture(root) {
  const importPath = path.join(root, "imports", "reddit-manual-captures", `${RUN_DATE}-reddit-manual-capture.csv`);
  ensureDir(path.dirname(importPath));
  fs.writeFileSync(
    importPath,
    toCsv(IMPORT_HEADERS, [
      {
        capture_date: RUN_DATE,
        observed_at: RUN_DATE,
        source: "reddit",
        source_type: "reddit_manual_capture",
        source_record_id: "manual-reddit-001",
        query: "how do sales teams get employees to post on linkedin without sounding scripted",
        subreddit: "sales",
        thread_url: "https://www.reddit.com/r/sales/comments/example/manual_capture_fixture_001/",
        post_or_comment: "sanitized_discussion_summary",
        surface: "reddit",
        country: "US",
        language: "en",
        intent: "how_to",
        funnel_stage: "problem_aware",
        confidence: "low",
        evidence_use: "discovery_only",
        allowed_public_use: "none",
        capture_method: "manual_capture_no_api",
        collection_method: "manual_capture_no_api",
        api_used: "false",
        uses_reddit_api: "false",
        sanitization_status: "sanitized",
        license_or_terms_note: "Manual Reddit observation for discovery only; no usernames or verbatim personal details retained.",
        captured_by: "fixture",
        notes: "Sanitized manual capture. Use only for buyer-language discovery and source-gap routing.",
      },
      {
        capture_date: RUN_DATE,
        observed_at: RUN_DATE,
        source: "reddit",
        source_type: "reddit_manual_capture",
        source_record_id: "manual-reddit-002",
        query: "what should employee advocacy posts include besides company announcements",
        subreddit: "marketing",
        thread_url: "https://www.reddit.com/r/marketing/comments/example/manual_capture_fixture_002/",
        post_or_comment: "sanitized_discussion_summary",
        surface: "reddit",
        country: "US",
        language: "en",
        intent: "definition",
        funnel_stage: "problem_aware",
        confidence: "low",
        evidence_use: "discovery_only",
        allowed_public_use: "none",
        capture_method: "manual_capture_no_api",
        collection_method: "manual_capture_no_api",
        api_used: "false",
        uses_reddit_api: "false",
        sanitization_status: "sanitized",
        license_or_terms_note: "Manual Reddit observation for discovery only; no usernames or verbatim personal details retained.",
        captured_by: "fixture",
        notes: "Sanitized manual capture. Use only for buyer-language discovery and source-gap routing.",
      },
    ])
  );
  return importPath;
}

function writeRedditCaptureWithRows(root, rows, fileName = `${RUN_DATE}-reddit-manual-capture.csv`) {
  const importPath = path.join(root, "imports", "reddit-manual-captures", fileName);
  ensureDir(path.dirname(importPath));
  const headers = Array.from(new Set([...IMPORT_HEADERS, ...rows.flatMap((row) => Object.keys(row))]));
  fs.writeFileSync(importPath, toCsv(headers, rows));
  return importPath;
}

function validRedditRow(overrides = {}) {
  return {
    capture_date: RUN_DATE,
    observed_at: RUN_DATE,
    source: "reddit",
    source_type: "reddit_manual_capture",
    source_record_id: "manual-reddit-valid",
    query: "how do sales teams get employees to post on linkedin without sounding scripted",
    subreddit: "sales",
    thread_url: "https://www.reddit.com/r/sales/comments/example/manual_capture_fixture_valid/",
    post_or_comment: "sanitized_discussion_summary",
    surface: "reddit",
    country: "US",
    language: "en",
    intent: "how_to",
    funnel_stage: "problem_aware",
    confidence: "low",
    evidence_use: "discovery_only",
    allowed_public_use: "none",
    capture_method: "manual_capture_no_api",
    collection_method: "manual_capture_no_api",
    api_used: "false",
    uses_reddit_api: "false",
    sanitization_status: "sanitized",
    license_or_terms_note: "Manual Reddit observation for discovery only; no usernames or verbatim personal details retained.",
    captured_by: "fixture",
    notes: "Sanitized manual capture. Use only for buyer-language discovery and source-gap routing.",
    ...overrides,
  };
}

function readCsvRows(filePath) {
  assert(fs.existsSync(filePath), `Expected CSV artifact to exist: ${filePath}`);
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function readJson(filePath) {
  assert(fs.existsSync(filePath), `Expected JSON artifact to exist: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isFalseFlag(value) {
  if (value === false) return true;
  return /^(false|0|no)$/i.test(String(value ?? "").trim());
}

function handoffStatus(root) {
  const candidates = [
    path.join(root, "research", "query-intelligence", RUN_ID, "brief-handoff.yaml"),
    path.join(root, "research", "trend-intelligence", RUN_ID, "brief-handoff-candidates.yaml"),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const match = fs.readFileSync(filePath, "utf8").match(/^handoff_status:\s*"?([^"\n]+)"?/m);
    if (match) return match[1].trim();
  }
  return "";
}

function assertRedditRows(rows) {
  const redditRows = rows.filter((row) => row.source_type === "reddit_manual_capture");
  assert(
    redditRows.length === 2,
    `Expected 2 reddit_manual_capture normalized rows from the manual capture import, got ${redditRows.length}.`
  );
  for (const row of redditRows) {
    assert(row.evidence_use === "discovery_only", `${row.query_id || row.query} must use evidence_use=discovery_only.`);
    assert(row.allowed_public_use === "none", `${row.query_id || row.query} must use allowed_public_use=none.`);
  }
  return redditRows;
}

function assertRedditSources(manifest) {
  assert(Array.isArray(manifest.sources), "source-manifest.json must include sources.");
  const redditSources = manifest.sources.filter((source) => source.source_type === "reddit_manual_capture");
  assert(redditSources.length >= 1, "source-manifest.json must include a reddit_manual_capture source.");
  for (const source of redditSources) {
    assert(source.evidence_use === "discovery_only", `${source.source_id} must use evidence_use=discovery_only.`);
    assert(source.allowed_public_use === "none", `${source.source_id} must use allowed_public_use=none.`);
    assert(
      source.collection_method === "manual_capture_no_api",
      `${source.source_id} must use collection_method=manual_capture_no_api.`
    );
    if (Object.hasOwn(source, "api_used")) assert(isFalseFlag(source.api_used), `${source.source_id} api_used must be false.`);
    if (Object.hasOwn(source, "uses_reddit_api")) {
      assert(isFalseFlag(source.uses_reddit_api), `${source.source_id} uses_reddit_api must be false.`);
    }
  }
  return redditSources;
}

function assertUnsafeRowRejected(repo, overrides, expectedText) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-manual-reddit-reject-"));
  try {
    writeRedditCaptureWithRows(tempRoot, [validRedditRow(overrides)], `${RUN_DATE}-reddit-manual-reject.csv`);
    const result = runNode(tempRoot, [path.join(repo, "scripts/seo-aeo/build-discovery-run.mjs"), "--date", RUN_DATE], {
      allowFailure: true,
    });
    assert(result.status !== 0, `Unsafe manual Reddit row was accepted: ${JSON.stringify(overrides)}`);
    assert(
      result.output.includes(expectedText),
      `Unsafe row failure should mention ${expectedText}. Output: ${result.output}`
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-manual-reddit-capture-"));
  try {
    const importPath = writeRedditCapture(tempRoot);
    runNode(tempRoot, [path.join(repo, "scripts/seo-aeo/build-discovery-run.mjs"), "--date", RUN_DATE]);

    const trendDir = path.join(tempRoot, "research", "trend-intelligence", RUN_ID);
    const normalizedPath = path.join(trendDir, "normalized-discovery-queries.csv");
    const manifestPath = path.join(trendDir, "source-manifest.json");
    const redditRows = assertRedditRows(readCsvRows(normalizedPath));
    const redditSources = assertRedditSources(readJson(manifestPath));

    const validation = runNode(
      tempRoot,
      [
        path.join(repo, "scripts/seo-aeo/validate-query-intelligence.mjs"),
        path.join("research", "query-intelligence", RUN_ID),
        "--json",
        "--require-handoff-ready",
      ],
      { allowFailure: true }
    );
    const status = handoffStatus(tempRoot);
    assert(status !== "ready", "Reddit-only manual captures must not produce a ready handoff.");
    assert(
      validation.status !== 0 || status !== "ready",
      "validate-query-intelligence --require-handoff-ready must fail or handoff_status must not be ready for Reddit-only rows."
    );
    assertUnsafeRowRejected(repo, { username: "example-user" }, "forbidden Reddit raw/user field");
    assertUnsafeRowRejected(repo, { thread_url: "https://example.com/not-reddit" }, "thread_url must be a Reddit URL");
    assertUnsafeRowRejected(repo, { allowed_public_use: "topic_direction" }, "allowed_public_use=none");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "manual-reddit-capture-lane",
          run_date: RUN_DATE,
          import_path: path.relative(tempRoot, importPath).split(path.sep).join("/"),
          reddit_rows: redditRows.length,
          reddit_sources: redditSources.length,
          handoff_status: status || "missing",
          require_handoff_ready_exit_code: validation.status,
          unsafe_rows_rejected: 3,
        },
        null,
        2
      )
    );
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
