#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toCsv } from "./lib/csv.mjs";

const PAGE_DAILY_HEADERS = [
  "date",
  "page_url",
  "slug",
  "page_type",
  "publish_date",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "ga4_sessions",
  "ga4_engaged_sessions",
  "ga4_avg_engagement_time_seconds",
  "ga4_conversions",
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr",
  "gsc_avg_position",
  "bing_clicks",
  "bing_impressions",
  "bing_ctr",
  "bing_avg_position",
  "ai_citations",
  "distribution_clicks",
  "content_health_score",
  "refresh_priority_score",
  "decision_evidence_status",
  "decision_evidence_row_count",
  "decision_evidence_date_count",
  "decision_evidence_required_date_count",
  "decision_evidence_included",
  "decision_evidence_reason",
  "notes",
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function runScript(root, tempRoot, args) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "seo-aeo", "generate-content-decisions.mjs"), ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`generate-content-decisions.mjs failed with ${result.status}: ${output}`);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`generate-content-decisions.mjs did not return JSON: ${output}`);
  }
}

function readRows(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureRows() {
  const base = {
    page_url: "https://sellinpublic.co/blog/lifecycle-refresh/",
    slug: "lifecycle-refresh",
    page_type: "blog",
    publish_date: "2026-06-01",
    source_file: "content-decision-lifecycle-fixture",
    property_id: "fixture",
    timezone: "America/Los_Angeles",
    captured_by: "scripts/seo-aeo/check-content-decision-lifecycle.mjs",
    reviewed_by: "fixture-reviewer",
    ga4_sessions: "20",
    ga4_engaged_sessions: "6",
    ga4_avg_engagement_time_seconds: "42",
    ga4_conversions: "0",
    gsc_clicks: "10",
    gsc_impressions: "1000",
    gsc_ctr: "0.01",
    gsc_avg_position: "8",
    bing_clicks: "0",
    bing_impressions: "0",
    bing_ctr: "",
    bing_avg_position: "",
    ai_citations: "0",
    distribution_clicks: "20",
    content_health_score: "",
    refresh_priority_score: "",
    decision_evidence_status: "",
    decision_evidence_row_count: "",
    decision_evidence_date_count: "",
    decision_evidence_required_date_count: "",
    decision_evidence_included: "",
    decision_evidence_reason: "",
  };

  return ["2026-06-10", "2026-06-11"].map((date, index) => ({
    ...base,
    date,
    source_export_id: `fixture:gsc:${date}:lifecycle-refresh`,
    gsc_clicks: String(Number(base.gsc_clicks) + index),
    gsc_impressions: String(Number(base.gsc_impressions) + index * 10),
    notes: index ? "Second reviewed evidence date." : "Initial reviewed evidence date.",
  }));
}

function writeRows(filePath, rows) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  fs.writeFileSync(filePath, toCsv(headers, rows));
}

function run() {
  const root = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-content-decision-lifecycle-"));
  try {
    const analyticsDir = path.join(tempRoot, "analytics");
    fs.mkdirSync(analyticsDir, { recursive: true });
    fs.writeFileSync(path.join(analyticsDir, "page_daily.csv"), toCsv(PAGE_DAILY_HEADERS, fixtureRows()));

    const firstOutput = runScript(root, tempRoot, ["--date", "2026-06-17"]);
    const decisionPath = path.join(analyticsDir, "content_decisions.csv");
    const firstRows = readRows(decisionPath);
    assert(firstRows.length === 1, `Expected one initial decision row, got ${firstRows.length}.`);
    assert(firstRows[0].decision_id, "Expected generated decision_id.");
    assert(firstRows[0].status === "proposed", `Expected initial proposed status, got ${firstRows[0].status}.`);
    assert(firstRows[0].first_seen_date === "2026-06-17", `Expected first_seen_date 2026-06-17, got ${firstRows[0].first_seen_date}.`);
    assert(firstRows[0].last_seen_date === "2026-06-17", `Expected last_seen_date 2026-06-17, got ${firstRows[0].last_seen_date}.`);
    assert(firstRows[0].evidence_signature, "Expected evidence_signature.");
    assert(firstRows[0].evidence_status === "decision_grade", `Expected decision-grade evidence status, got ${firstRows[0].evidence_status}.`);
    assert(firstRows[0].evidence_row_count === "2", `Expected two reviewed evidence rows, got ${firstRows[0].evidence_row_count}.`);
    assert(firstRows[0].evidence_date_count === "2", `Expected two reviewed evidence dates, got ${firstRows[0].evidence_date_count}.`);
    assert(firstRows[0].evidence_required_date_count === "2", `Expected required evidence date count 2, got ${firstRows[0].evidence_required_date_count}.`);

    const approvedRow = {
      ...firstRows[0],
      status: "approved",
      due_date: "2026-06-30",
      notes: "Owner approved this refresh scope; keep these notes.",
    };
    writeRows(decisionPath, [approvedRow]);

    const secondOutput = runScript(root, tempRoot, ["--date", "2026-06-18"]);
    const secondRows = readRows(decisionPath);
    assert(secondRows.length === 1, `Expected repeated run to keep one decision row, got ${secondRows.length}.`);
    assert(secondRows[0].decision_id === firstRows[0].decision_id, "Expected repeated run to preserve decision_id.");
    assert(secondRows[0].status === "approved", `Expected approved status to be preserved, got ${secondRows[0].status}.`);
    assert(secondRows[0].due_date === "2026-06-30", `Expected due_date to be preserved, got ${secondRows[0].due_date}.`);
    assert(secondRows[0].notes === approvedRow.notes, "Expected owner notes to be preserved.");
    assert(secondRows[0].first_seen_date === "2026-06-17", `Expected first_seen_date to stay 2026-06-17, got ${secondRows[0].first_seen_date}.`);
    assert(secondRows[0].last_seen_date === "2026-06-18", `Expected last_seen_date to move to 2026-06-18, got ${secondRows[0].last_seen_date}.`);
    assert(secondRows[0].decision_date === "2026-06-18", `Expected decision_date to refresh to 2026-06-18, got ${secondRows[0].decision_date}.`);
    assert(secondRows[0].evidence_status === "decision_grade", `Expected decision-grade evidence status to persist, got ${secondRows[0].evidence_status}.`);
    assert(secondRows[0].evidence_row_count === "2", `Expected evidence_row_count to persist, got ${secondRows[0].evidence_row_count}.`);
    assert(secondRows[0].evidence_date_count === "2", `Expected evidence_date_count to persist, got ${secondRows[0].evidence_date_count}.`);

    writeRows(path.join(analyticsDir, "page_daily.csv"), [
      ...fixtureRows(),
      {
        ...fixtureRows()[0],
        date: "2026-06-12",
        source_export_id: "fixture:gsc:2026-06-12:lifecycle-refresh",
        gsc_clicks: "18",
        gsc_impressions: "1200",
        notes: "Third reviewed evidence date that changes the signature.",
      },
    ]);

    const thirdOutput = runScript(root, tempRoot, ["--date", "2026-06-19"]);
    const thirdRows = readRows(decisionPath);
    assert(thirdRows.length === 1, `Expected changed evidence to keep one decision row, got ${thirdRows.length}.`);
    assert(thirdRows[0].decision_id === firstRows[0].decision_id, "Expected changed evidence to preserve decision_id.");
    assert(
      thirdRows[0].status === "evidence_changed_needs_review",
      `Expected changed evidence to force review status, got ${thirdRows[0].status}.`
    );
    assert(thirdRows[0].due_date === "2026-06-30", `Expected due_date to be preserved after evidence change, got ${thirdRows[0].due_date}.`);
    assert(/previous_status=approved/.test(thirdRows[0].notes || ""), "Expected notes to preserve previous approved status.");
    assert(thirdRows[0].last_seen_date === "2026-06-19", `Expected last_seen_date to move to 2026-06-19, got ${thirdRows[0].last_seen_date}.`);
    assert(thirdRows[0].evidence_row_count === "3", `Expected changed evidence row count 3, got ${thirdRows[0].evidence_row_count}.`);
    assert(thirdRows[0].evidence_date_count === "3", `Expected changed evidence date count 3, got ${thirdRows[0].evidence_date_count}.`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "content_decision_lifecycle",
          first_run_proposed: firstOutput.proposed,
          second_run_proposed: secondOutput.proposed,
          third_run_proposed: thirdOutput.proposed,
          decision_id: thirdRows[0].decision_id,
          preserved: {
            status: secondRows[0].status,
            due_date: secondRows[0].due_date,
            notes: secondRows[0].notes,
          },
          evidence_change_guard: {
            status: thirdRows[0].status,
            row_count: thirdRows[0].evidence_row_count,
            date_count: thirdRows[0].evidence_date_count,
          },
          lifecycle: {
            first_seen_date: thirdRows[0].first_seen_date,
            last_seen_date: thirdRows[0].last_seen_date,
          },
          evidence: {
            status: secondRows[0].evidence_status,
            row_count: secondRows[0].evidence_row_count,
            date_count: secondRows[0].evidence_date_count,
          },
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
