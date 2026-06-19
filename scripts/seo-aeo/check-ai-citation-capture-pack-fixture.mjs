#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";

const RUN_DATE = "2099-01-20";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeReport(root, overrides = {}) {
  const outputDir = path.join(root, "automation-runs", RUN_DATE);
  ensureDir(outputDir);
  fs.writeFileSync(
    path.join(outputDir, "ai-citation-query-set-check.json"),
    `${JSON.stringify(
      {
        status: "needs_capture",
        query_set_id: "fixture-ai-citation",
        query_set_version: "2099-01-20",
        missing_captures: [
          {
            status: "missing_capture",
            capture_id: "q1:chatgpt",
            query_set_id: "fixture-ai-citation",
            query_set_version: "2099-01-20",
            query_id: "q1",
            query: "what is employee generated content",
            surface: "chatgpt",
            target_page_url: "https://sellinpublic.co/blog/example/",
            intent: "definition",
            priority: "core",
          },
        ],
        stale_captures: [],
        unreviewed_captures: [],
        ...overrides,
      },
      null,
      2
    )}\n`
  );
}

function runPack(repo, tempRoot) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/write-ai-citation-capture-pack.mjs"), "--date", RUN_DATE],
    { cwd: tempRoot, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`capture pack failed: ${output}`);
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-ai-citation-capture-pack-"));
  try {
    writeReport(tempRoot);
    const summary = runPack(repo, tempRoot);
    assert(summary.status === "capture_needed", `expected capture_needed, got ${summary.status}`);
    assert(summary.capture_rows === 1, `expected one capture row, got ${summary.capture_rows}`);
    const captureCsv = parseCsv(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-capture-pack.csv"), "utf8"));
    const importCsv = parseCsv(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "ai-citation-import-skeleton.csv"), "utf8"));
    assert(captureCsv.rows[0].query_id === "q1", "expected capture pack query_id q1.");
    assert(importCsv.rows[0].query_set_version === "2099-01-20", "expected import skeleton to preserve query-set version.");
    assert(importCsv.headers.includes("capture_method"), "expected import skeleton to include capture_method.");
    assert(importCsv.rows[0].capture_method === "manual_ai_answer_observation", "expected ChatGPT rows to default to manual_ai_answer_observation.");
    assert(importCsv.rows[0].reviewer === "", "expected import skeleton reviewer to remain blank for human review.");

    writeReport(tempRoot, { status: "ready", missing_captures: [], stale_captures: [], unreviewed_captures: [] });
    const ready = runPack(repo, tempRoot);
    assert(ready.status === "ready", `expected ready, got ${ready.status}`);
    assert(ready.capture_rows === 0, `expected zero capture rows, got ${ready.capture_rows}`);

    console.log(JSON.stringify({ ok: true, fixture: "ai-citation-capture-pack" }, null, 2));
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
