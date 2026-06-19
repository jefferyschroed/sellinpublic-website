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

const SEARCH_QUERY_HEADERS = [
  "date",
  "source",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "query",
  "page_url",
  "slug",
  "device",
  "country",
  "clicks",
  "impressions",
  "ctr",
  "avg_position",
  "search_intent",
  "serp_features",
  "content_action",
  "notes",
];

const AI_CITATION_HEADERS = [
  "capture_date",
  "query_set_id",
  "query_set_version",
  "query_id",
  "query",
  "surface",
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

const DISTRIBUTION_HEADERS = [
  "date",
  "channel",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "post_url",
  "campaign",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "content_url",
  "slug",
  "impressions",
  "engagements",
  "clicks",
  "ctr",
  "comments",
  "shares",
  "saves",
  "leads",
  "meetings_booked",
  "notes",
  "next_action",
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
  if (result.status !== 0) throw new Error(`${scriptName} failed with ${result.status}: ${output}`);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${scriptName} did not return JSON: ${output}`);
  }
}

function readRows(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFixture(analyticsDir) {
  fs.writeFileSync(path.join(analyticsDir, "page_daily.csv"), toCsv(PAGE_DAILY_HEADERS, []));
  fs.writeFileSync(
    path.join(analyticsDir, "search_query_daily.csv"),
    toCsv(SEARCH_QUERY_HEADERS, [
      {
        date: "2026-06-10",
        source: "google_search_console",
        source_export_id: "fixture:gsc:reviewed",
        source_file: "fixture-gsc.csv",
        property_id: "sc-domain:sellinpublic.co",
        timezone: "America/Los_Angeles",
        captured_by: "fixture",
        reviewed_by: "qa-reviewer",
        query: "employee generated content examples",
        page_url: "https://sellinpublic.co/blog/example-rollup/?utm_source=gsc",
        slug: "",
        device: "DESKTOP",
        country: "usa",
        clicks: "4",
        impressions: "100",
        ctr: "0.04",
        avg_position: "3",
        search_intent: "examples",
        content_action: "monitor",
      },
      {
        date: "2026-06-11",
        source: "google_search_console",
        source_export_id: "fixture:gsc:unreviewed",
        source_file: "fixture-gsc-api.csv",
        property_id: "sc-domain:sellinpublic.co",
        timezone: "America/Los_Angeles",
        captured_by: "fixture",
        reviewed_by: "",
        query: "what is employee generated content",
        page_url: "/blog/example-rollup/?utm_source=gsc_api",
        slug: "",
        device: "DESKTOP",
        country: "usa",
        clicks: "7",
        impressions: "200",
        ctr: "0.035",
        avg_position: "4",
        search_intent: "definition",
        content_action: "monitor",
      },
    ])
  );
  fs.writeFileSync(
    path.join(analyticsDir, "ai_citation_log.csv"),
    toCsv(AI_CITATION_HEADERS, [
      {
        capture_date: "2026-06-10",
        query: "best employee generated content examples",
        surface: "manual_ai_check",
        source_export_id: "fixture:ai:reviewed",
        source_file: "fixture-ai.csv",
        captured_by: "fixture",
        reviewer: "qa-reviewer",
        target_page_url: "https://sellinpublic.co/blog/example-rollup/",
        cited_url: "https://sellinpublic.co/blog/example-rollup/?utm_medium=ai",
        cited_domain: "sellinpublic.co",
        is_sell_in_public: "true",
        citation_position: "1",
      },
    ])
  );
  fs.writeFileSync(
    path.join(analyticsDir, "distribution_daily.csv"),
    toCsv(DISTRIBUTION_HEADERS, [
      {
        date: "2026-06-10",
        channel: "linkedin",
        source_export_id: "fixture:distribution:reviewed",
        source_file: "fixture-distribution.csv",
        property_id: "linkedin",
        timezone: "America/Los_Angeles",
        captured_by: "fixture",
        reviewed_by: "qa-reviewer",
        post_url: "https://www.linkedin.com/feed/update/example",
        campaign: "egc-launch",
        content_url: "/blog/example-rollup/?utm_campaign=egc_launch&utm_source=linkedin",
        slug: "",
        impressions: "1000",
        engagements: "50",
        clicks: "9",
        ctr: "0.009",
      },
    ])
  );
}

function run() {
  const root = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-feedback-rollup-"));
  try {
    const analyticsDir = path.join(tempRoot, "analytics");
    fs.mkdirSync(analyticsDir, { recursive: true });
    writeFixture(analyticsDir);

    const rollupOutput = runScript(root, tempRoot, "rollup-feedback-signals.mjs");
    const rows = readRows(path.join(analyticsDir, "page_daily.csv"));
    const reviewed = rows.find((row) => row.date === "2026-06-10");
    const unreviewed = rows.find((row) => row.date === "2026-06-11");

    assert(rollupOutput.derived_page_rows === 2, `Expected 2 derived page rows, got ${rollupOutput.derived_page_rows}.`);
    assert(reviewed, "Expected reviewed rollup row for 2026-06-10.");
    assert(unreviewed, "Expected unreviewed rollup row for 2026-06-11.");
    assert(reviewed.slug === "example-rollup", `Expected slug example-rollup, got ${reviewed.slug}.`);
    assert(reviewed.page_url === "https://sellinpublic.co/blog/example-rollup/", `Expected canonical absolute page URL, got ${reviewed.page_url}.`);
    assert(reviewed.gsc_clicks === "4", `Expected gsc_clicks=4, got ${reviewed.gsc_clicks}.`);
    assert(reviewed.gsc_impressions === "100", `Expected gsc_impressions=100, got ${reviewed.gsc_impressions}.`);
    assert(reviewed.ai_citations === "1", `Expected ai_citations=1, got ${reviewed.ai_citations}.`);
    assert(reviewed.distribution_clicks === "9", `Expected distribution_clicks=9, got ${reviewed.distribution_clicks}.`);
    assert(reviewed.reviewed_by === "qa-reviewer", `Expected reviewed_by qa-reviewer, got ${reviewed.reviewed_by}.`);
    assert(!/[?&]utm_/.test(reviewed.page_url), "Expected tracking params to be stripped from reviewed page_url.");
    assert(/Derived page_daily row from real source rows only/.test(reviewed.notes || ""), "Expected derived-row provenance note.");

    assert(unreviewed.gsc_clicks === "7", `Expected unreviewed gsc_clicks=7, got ${unreviewed.gsc_clicks}.`);
    assert(unreviewed.reviewed_by === "", "Expected unreviewed API/source row to keep reviewed_by blank.");
    assert(/reviewed_by left blank/.test(unreviewed.notes || ""), "Expected unreviewed row note to explain reviewed_by blank.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "feedback_signal_rollup",
          derived_page_rows: rollupOutput.derived_page_rows,
          rolled_up_source_rows: rollupOutput.rolled_up_source_rows,
          reviewed_row: {
            date: reviewed.date,
            page_url: reviewed.page_url,
            slug: reviewed.slug,
            gsc_clicks: reviewed.gsc_clicks,
            ai_citations: reviewed.ai_citations,
            distribution_clicks: reviewed.distribution_clicks,
            reviewed_by: reviewed.reviewed_by,
          },
          unreviewed_row: {
            date: unreviewed.date,
            gsc_clicks: unreviewed.gsc_clicks,
            reviewed_by: unreviewed.reviewed_by,
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
