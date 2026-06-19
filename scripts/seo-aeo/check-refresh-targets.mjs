#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";

const FIXTURE_DATE = "2099-01-10";
const FIXTURE_TOPIC_ID = "fixture-refresh-topic";
const FIXTURE_SLUG = "fixture-refresh-target";

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function cleanup(root) {
  fs.rmSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE), { recursive: true, force: true });
  fs.rmSync(path.join(root, "content-packets", `${FIXTURE_DATE}-${FIXTURE_SLUG}`), { recursive: true, force: true });
  fs.rmSync(path.join(root, "content-packets", `${FIXTURE_DATE}-${FIXTURE_SLUG}-duplicate`), { recursive: true, force: true });
}

function writePacket(root, dirname) {
  const packetDir = ensureDir(path.join(root, "content-packets", dirname));
  fs.writeFileSync(path.join(packetDir, "brief.yaml"), `packet_id: "${dirname}"\nstatus: "published-draft"\nslug: "${FIXTURE_SLUG}"\n`);
  fs.writeFileSync(path.join(packetDir, "publish-meta.yaml"), `status: "published-draft"\nslug: "${FIXTURE_SLUG}"\n`);
  fs.writeFileSync(path.join(packetDir, "refresh-notes.md"), `# Refresh Notes\n\nFixture only.\n`);
}

function writePlan(root) {
  const dir = ensureDir(path.join(root, "research", "daily-content-plan", FIXTURE_DATE));
  const planPath = path.join(dir, "topic-candidates.csv");
  const headers = [
    "date",
    "candidate_id",
    "topic",
    "topic_id",
    "asset_decision",
    "strategic_asset_decision",
    "recommended_asset",
    "packet_intake_status",
    "coverage_status",
  ];
  const row = [
    FIXTURE_DATE,
    "fixture-query-001",
    "fixture refresh topic",
    FIXTURE_TOPIC_ID,
    "refresh",
    "refresh",
    "refresh",
    "intake_ready",
    "published-draft",
  ];
  fs.writeFileSync(planPath, `${headers.join(",")}\n${row.join(",")}\n`);
}

function appendCoverage(root) {
  const coveragePath = path.join(root, "docs", "seo-aeo", "topic-coverage.csv");
  const original = fs.readFileSync(coveragePath, "utf8");
  const line = `${FIXTURE_TOPIC_ID},fixture-pillar,post,published-draft,${FIXTURE_SLUG},,fixture refresh topic,Fixture question?,90,create_or_refresh_packet,hub,ready,fixture,Sell In Public QA,${FIXTURE_DATE}\n`;
  fs.writeFileSync(coveragePath, original.endsWith("\n") ? `${original}${line}` : `${original}\n${line}`);
  return () => fs.writeFileSync(coveragePath, original);
}

function runResolver(root) {
  return spawnSync(process.execPath, ["scripts/seo-aeo/resolve-refresh-targets.mjs", "--date", FIXTURE_DATE], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function readReport(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "research", "daily-content-plan", FIXTURE_DATE, "refresh-targets.json"), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const root = process.cwd();
  cleanup(root);
  const restoreCoverage = appendCoverage(root);
  try {
    writePlan(root);
    writePacket(root, `${FIXTURE_DATE}-${FIXTURE_SLUG}`);

    let result = runResolver(root);
    let output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `resolved fixture should pass. Output: ${output}`);
    let report = readReport(root);
    assert(report.resolved_count === 1, `expected one resolved refresh target, got ${report.resolved_count}`);
    assert(report.rows[0].packet_path === normalizePath(`content-packets/${FIXTURE_DATE}-${FIXTURE_SLUG}`), `unexpected packet path ${report.rows[0].packet_path}`);
    assert(report.rows[0].target_resolution_status === "resolved", "expected target resolution status resolved");

    writePacket(root, `${FIXTURE_DATE}-${FIXTURE_SLUG}-duplicate`);
    result = runResolver(root);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `duplicate fixture should still write a blocked report. Output: ${output}`);
    report = readReport(root);
    assert(report.blocked_count === 1, `expected one blocked duplicate target, got ${report.blocked_count}`);
    assert(String(report.rows[0].blockers || "").includes("multiple_matching_packets"), "expected multiple_matching_packets blocker");
  } finally {
    restoreCoverage();
    cleanup(root);
  }

  console.log(JSON.stringify({ ok: true, fixture: "refresh-targets" }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
