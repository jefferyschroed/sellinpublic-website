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

function runScript(root, tempRoot, scriptName) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "seo-aeo", scriptName)], {
    cwd: tempRoot,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with ${result.status}: ${output}`);
  }
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${scriptName} did not return JSON: ${output}`);
  }
}

function readCsvRows(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureRows() {
  const base = {
    page_type: "blog",
    publish_date: "2026-06-01",
    source_file: "analytics-feedback-fixture",
    property_id: "fixture",
    timezone: "America/Los_Angeles",
    captured_by: "scripts/seo-aeo/check-analytics-feedback.mjs",
    reviewed_by: "fixture-reviewer",
    bing_clicks: "0",
    bing_impressions: "0",
    bing_ctr: "",
    bing_avg_position: "",
    content_health_score: "",
    refresh_priority_score: "",
    decision_evidence_status: "",
    decision_evidence_row_count: "",
    decision_evidence_date_count: "",
    decision_evidence_required_date_count: "",
    decision_evidence_included: "",
    decision_evidence_reason: "",
  };

  const fixtures = [
    {
      slug: "example-keep",
      page_url: "https://sellinpublic.co/blog/example-keep/",
      ga4_sessions: "80",
      ga4_engaged_sessions: "50",
      ga4_avg_engagement_time_seconds: "90",
      ga4_conversions: "3",
      gsc_clicks: "30",
      gsc_impressions: "40",
      gsc_ctr: "0.75",
      gsc_avg_position: "2",
      ai_citations: "3",
      distribution_clicks: "0",
      notes: "Strong cross-channel fixture row.",
    },
    {
      slug: "example-refresh",
      page_url: "https://sellinpublic.co/blog/example-refresh/",
      ga4_sessions: "20",
      ga4_engaged_sessions: "6",
      ga4_avg_engagement_time_seconds: "42",
      ga4_conversions: "0",
      gsc_clicks: "10",
      gsc_impressions: "1000",
      gsc_ctr: "0.01",
      gsc_avg_position: "8",
      ai_citations: "0",
      distribution_clicks: "20",
      notes: "High impressions and low CTR fixture row.",
    },
    {
      slug: "example-expand",
      page_url: "https://sellinpublic.co/blog/example-expand/",
      ga4_sessions: "3",
      ga4_engaged_sessions: "1",
      ga4_avg_engagement_time_seconds: "12",
      ga4_conversions: "0",
      gsc_clicks: "1",
      gsc_impressions: "10",
      gsc_ctr: "0.1",
      gsc_avg_position: "20",
      ai_citations: "0",
      distribution_clicks: "0",
      notes: "Weak content-health fixture row.",
    },
  ];

  const fixturePageRows = fixtures.flatMap((fixture) =>
    ["2026-06-10", "2026-06-11"].map((date, index) => ({
      ...base,
      date,
      page_url: fixture.page_url,
      slug: fixture.slug,
      source_export_id: `fixture:gsc:${date}:${fixture.slug}`,
      ga4_sessions: String(Number(fixture.ga4_sessions) + index),
      ga4_engaged_sessions: String(Number(fixture.ga4_engaged_sessions) + index),
      ga4_avg_engagement_time_seconds: fixture.ga4_avg_engagement_time_seconds,
      ga4_conversions: fixture.ga4_conversions,
      gsc_clicks: String(Number(fixture.gsc_clicks) + index),
      gsc_impressions: String(Number(fixture.gsc_impressions) + index * 10),
      gsc_ctr: fixture.gsc_ctr,
      gsc_avg_position: fixture.gsc_avg_position,
      ai_citations: fixture.ai_citations,
      distribution_clicks: fixture.distribution_clicks,
      notes: index ? `Second reviewed evidence date for ${fixture.slug}.` : fixture.notes,
    }))
  );

  const utmRows = [
    "https://sellinpublic.co/blog/example-utm/?utm_source=newsletter&utm_medium=email",
    "/blog/example-utm/?utm_campaign=launch&utm_source=linkedin",
  ].map((pageUrl, index) => ({
    ...base,
    date: index ? "2026-06-13" : "2026-06-12",
    page_url: pageUrl,
    slug: "",
    source_export_id: `fixture:gsc:2026-06-${index ? "13" : "12"}:example-utm`,
    ga4_sessions: String(80 + index),
    ga4_engaged_sessions: String(50 + index),
    ga4_avg_engagement_time_seconds: "90",
    ga4_conversions: "3",
    gsc_clicks: String(30 + index),
    gsc_impressions: String(40 + index * 10),
    gsc_ctr: "0.75",
    gsc_avg_position: "2",
    ai_citations: "3",
    distribution_clicks: "0",
    notes: index ? "Second reviewed UTM evidence row without slug." : "Reviewed UTM evidence row without slug.",
  }));

  const provisionalRows = ["2026-06-14", "2026-06-15"].map((date, index) => ({
    ...base,
    date,
    page_url: "https://sellinpublic.co/blog/example-provisional/",
    slug: "example-provisional",
    source_export_id: `fixture:gsc:${date}:example-provisional`,
    reviewed_by: index ? "" : "fixture-reviewer",
    ga4_sessions: String(40 + index),
    ga4_engaged_sessions: String(20 + index),
    ga4_avg_engagement_time_seconds: "60",
    ga4_conversions: "1",
    gsc_clicks: String(12 + index),
    gsc_impressions: String(400 + index * 10),
    gsc_ctr: "0.03",
    gsc_avg_position: "7",
    ai_citations: "1",
    distribution_clicks: "10",
    notes: index ? "Unreviewed second raw row should not count as decision evidence." : "Only reviewed evidence date for provisional fixture.",
  }));

  return [...fixturePageRows, ...utmRows, ...provisionalRows];
}

function run() {
  const root = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-analytics-feedback-"));
  try {
    const analyticsDir = path.join(tempRoot, "analytics");
    fs.mkdirSync(analyticsDir, { recursive: true });
    fs.writeFileSync(path.join(analyticsDir, "page_daily.csv"), toCsv(PAGE_DAILY_HEADERS, fixtureRows()));

    const scoreOutput = runScript(root, tempRoot, "score-analytics.mjs");
    const scoredRows = readCsvRows(path.join(analyticsDir, "page_daily.csv"));
    assert(scoredRows.length === 10, "Expected ten scored fixture rows.");
    assert(scoredRows.every((row) => row.content_health_score), "Expected content_health_score on every fixture row.");
    assert(scoredRows.every((row) => row.refresh_priority_score), "Expected refresh_priority_score on every fixture row.");
    const decisionGradeRows = scoredRows.filter((row) => row.slug !== "example-provisional");
    const provisionalRows = scoredRows.filter((row) => row.slug === "example-provisional");
    assert(decisionGradeRows.every((row) => row.decision_evidence_status === "decision_grade"), "Expected decision-grade evidence on every two-date fixture row.");
    assert(provisionalRows.length === 2, `Expected two provisional fixture rows, got ${provisionalRows.length}.`);
    assert(
      provisionalRows.every((row) => row.decision_evidence_status === "provisional"),
      "Expected one-date reviewed evidence to remain provisional."
    );
    assert(
      provisionalRows.every((row) => row.decision_evidence_date_count === "1"),
      "Expected provisional fixture to have one reviewed evidence date."
    );
    assert(
      provisionalRows.every((row) => /2 distinct evidence dates/.test(row.decision_evidence_reason || "")),
      "Expected provisional fixture reason to name the two-date evidence requirement."
    );

    const decisionOutput = runScript(root, tempRoot, "generate-content-decisions.mjs");
    const decisions = readCsvRows(path.join(analyticsDir, "content_decisions.csv"));
    const decisionsBySlug = Object.fromEntries(decisions.map((row) => [row.slug, row]));
    const expected = {
      "example-keep": "keep",
      "example-refresh": "refresh",
      "example-expand": "expand",
    };
    for (const [slug, decision] of Object.entries(expected)) {
      assert(decisionsBySlug[slug]?.decision === decision, `Expected ${slug} decision ${decision}, got ${decisionsBySlug[slug]?.decision || "(missing)"}.`);
      assert(decisionsBySlug[slug]?.status === "proposed", `Expected ${slug} decision to require human approval.`);
      assert(/Human approval required/.test(decisionsBySlug[slug]?.notes || ""), `Expected human-approval note for ${slug}.`);
    }
    const utmDecision = decisions.find((row) => row.page_url === "/blog/example-utm/");
    assert(utmDecision?.decision === "keep", `Expected canonicalized UTM page decision keep, got ${utmDecision?.decision || "(missing)"}.`);
    assert(!/[?&]utm_/.test(utmDecision.page_url), "Expected UTM params to be stripped from decision page_url.");
    assert(/decision-grade reviewed evidence/.test(utmDecision.notes || ""), "Expected UTM decision to name decision-grade evidence.");
    assert(!decisionsBySlug["example-provisional"], "Expected provisional page to be skipped by content decisions.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "analytics_feedback_decision_branches",
          score_rows: scoreOutput.rows,
          proposed_decisions: decisionOutput.proposed,
          expected_decisions: expected,
          actual_decisions: Object.fromEntries(decisions.map((row) => [row.slug, row.decision])),
          provisional_rows_skipped: provisionalRows.length,
          canonicalized_utm_decision: {
            page_url: utmDecision.page_url,
            decision: utmDecision.decision,
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
