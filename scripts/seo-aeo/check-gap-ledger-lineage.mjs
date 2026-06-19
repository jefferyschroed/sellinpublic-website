#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";

const FIXTURE_DATE = "2099-01-12";

function cleanup(root) {
  fs.rmSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE), { recursive: true, force: true });
}

function writeFixture(root) {
  const dir = ensureDir(path.join(root, "research", "daily-content-plan", FIXTURE_DATE));
  const headers = [
    "date",
    "candidate_id",
    "topic",
    "topic_id",
    "packet_intake_status",
    "gate_reasons",
    "required_before_packet",
    "query_run_status",
    "source_readiness",
    "next_action",
  ];
  const rows = [
    [FIXTURE_DATE, "query-001", "current topic", "topic-current", "intake_ready", "", "", "handoff_ready", "ready", "none"],
    [FIXTURE_DATE, "query-002", "matched topic", "topic-matched", "intake_ready", "", "", "handoff_ready", "ready", "none"],
  ];
  fs.writeFileSync(path.join(dir, "topic-candidates.csv"), `${headers.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}\n`);
  fs.writeFileSync(
    path.join(dir, "source-gaps-query-001.md"),
    `# Source Gaps: query-001\n\nCandidate: \`query-001\`  \nTopic: \`old mismatched topic\`  \nTopic ID: \`topic-old\`  \n\nSource readiness remains \`blocked\`.\n`
  );
  fs.writeFileSync(
    path.join(dir, "source-gaps-query-002.md"),
    `# Source Gaps: query-002\n\nCandidate: \`query-002\`  \nTopic: \`matched topic\`  \nTopic ID: \`topic-matched\`  \n\nsource_readiness_partial\n`
  );
}

function runLedger(root) {
  return spawnSync(process.execPath, ["scripts/seo-aeo/build-gap-ledger.mjs", "--date", FIXTURE_DATE], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function readReport(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE, "gap-ledger.json"), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const root = process.cwd();
  cleanup(root);
  try {
    writeFixture(root);
    const result = runLedger(root);
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `gap ledger fixture should pass. Output: ${output}`);
    const report = readReport(root);
    const stale = report.rows.find((row) => row.candidate_id === "query-001" && row.gap_type === "artifact_lineage");
    const active = report.rows.find((row) => row.candidate_id === "query-002" && row.gap_code === "source_readiness_partial");
    assert(stale, "expected mismatched artifact to become a stale lineage row.");
    assert(stale.status === "stale_artifact", `expected stale_artifact status, got ${stale.status}`);
    assert(active, "expected matched artifact blocker to stay active.");
    assert(Number(report.stale_row_count || 0) === 1, `expected stale row count 1, got ${report.stale_row_count}`);
    assert(Number(report.active_row_count || 0) === 1, `expected active row count 1, got ${report.active_row_count}`);
  } finally {
    cleanup(root);
  }

  console.log(JSON.stringify({ ok: true, fixture: "gap-ledger-lineage" }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
