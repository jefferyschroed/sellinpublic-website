#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { dateRangeLabel, metricsDateRangeFromArgs, today } from "./lib/dates.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function runStep(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
 const missingSetup =
    result.status !== 0 &&
    /(Set (GA4_PROPERTY_ID|GSC_SITE_URL|BING_WEBMASTER_API_KEY|BING_WEBMASTER_SITE_URL|GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_OAUTH_CREDENTIALS|GOOGLE_OAUTH_CREDENTIALS_JSON|REDDIT_CLIENT_ID|REDDIT_CLIENT_SECRET|REDDIT_USER_AGENT)|Google service account file not found|Configured service-account path was not found|Configured OAuth path was not found)/i.test(
      output
    );
  const parsed = parseJsonOutput(output);
  const skipped = result.status === 0 && parsed?.skipped === true;
  return {
    name,
    command: [command, ...args].join(" "),
    status: skipped ? "skipped" : result.status === 0 ? "completed" : missingSetup ? "skipped_missing_setup" : "failed",
    exit_code: result.status,
    output,
  };
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function gscDiagnosticWindow(diagnostics, id) {
  return (diagnostics.gsc?.windows || []).find((window) => window.id === id) || null;
}

function gscFallbackStep(root, runDate) {
  const diagnosticsPath = path.join(root, "automation-runs", runDate, "measurement-diagnostics.json");
  const diagnostics = readJson(diagnosticsPath, {});
  const target = gscDiagnosticWindow(diagnostics, "target_range");
  const fallback =
    [gscDiagnosticWindow(diagnostics, "last_28_finalized"), gscDiagnosticWindow(diagnostics, "last_90_finalized")].find(
      (window) => window && Number(window.row_count || 0) > 0
    ) || null;

  if (!target || Number(target.row_count || 0) > 0 || !fallback) {
    return {
      name: "Pull GSC fallback query metrics",
      command: "(skipped)",
      status: "skipped_no_fallback_rows",
      exit_code: 0,
      output: JSON.stringify(
        {
          ok: true,
          skipped: true,
          run_date: runDate,
          target_row_count: target?.row_count ?? null,
          fallback_window: fallback?.id || "",
          reason: target && Number(target.row_count || 0) > 0
            ? "Target finalized Search Console window already has rows."
            : "Diagnostics did not find rows in wider finalized Search Console windows.",
        },
        null,
        2
      ),
    };
  }

  return runStep("Pull GSC fallback query metrics", process.execPath, [
    "scripts/seo-aeo/pull-gsc.mjs",
    "--start",
    fallback.start_date,
    "--end",
    fallback.end_date,
  ]);
}

function missingRunFolderValidation(step) {
  const parsed = parseJsonOutput(step.output);
  if (parsed?.items?.some((item) => item.check === "run folder" && /does not exist/i.test(item.detail || ""))) {
    return true;
  }
  return /Missing run folder path|Run folder does not exist/i.test(step.output || "");
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function validateCurrentQueryIntelligence(root, runDate) {
  const runName = `${runDate}-daily-discovery`;
  const runDir = path.join(root, "research", "query-intelligence", runName);
  if (!fs.existsSync(runDir)) {
    const trendHandoffPath = path.join(root, "research", "trend-intelligence", runName, "brief-handoff-candidates.yaml");
    const handoffStatus = readYamlScalar(trendHandoffPath, "handoff_status") || "missing";
    return {
      name: "Validate current query intelligence",
      command: "(skipped)",
      status: "skipped_no_current_query_run",
      exit_code: 0,
      output: JSON.stringify(
        {
          ok: true,
          skipped: true,
          run_date: runDate,
          query_run_dir: path.relative(root, runDir).split(path.sep).join("/"),
          trend_handoff_path: fs.existsSync(trendHandoffPath)
            ? path.relative(root, trendHandoffPath).split(path.sep).join("/")
            : "",
          handoff_status: handoffStatus,
          reason: "No current query-intelligence run was created for this date. Historical query-intelligence runs are intentionally ignored for current packet intake.",
        },
        null,
        2
      ),
    };
  }

  const runPath = path.relative(root, runDir).split(path.sep).join("/");
  const step = runStep("Validate current query intelligence", process.execPath, [
    "scripts/seo-aeo/validate-query-intelligence.mjs",
    runPath,
    "--json",
  ]);

  if (step.status === "failed" && missingRunFolderValidation(step)) {
    return {
      ...step,
      status: "skipped_no_current_query_run",
    };
  }

  return step;
}

function readNestedActions(root, parsed) {
  const actions = [];
  for (const action of parsed?.next_manual_actions || []) actions.push(action);

  if (parsed?.publish_plan_json) {
    const planPath = path.resolve(root, parsed.publish_plan_json);
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
      for (const action of plan.next_manual_actions || []) actions.push(action);
    } catch {
      actions.push(`Review publish governor output at ${parsed.publish_plan_json}.`);
    }
  }

  if (parsed?.counts?.blocker) {
    actions.push(`Resolve query-intelligence blockers in ${parsed.run_dir} (${parsed.counts.blocker} blocker(s)).`);
  }

  return actions;
}

function nestedManualActions(root, steps) {
  const actions = [];
  for (const step of steps) {
    if (step.status === "skipped_missing_setup") actions.push(`${step.name}: ${step.output.split("\n")[0]}`);
    if (step.status === "skipped_no_run_folder") actions.push(`${step.name}: ${step.output.split("\n")[0]}`);
    if (step.status === "skipped_no_current_query_run") {
      const parsed = parseJsonOutput(step.output);
      if (parsed?.handoff_status && parsed.handoff_status !== "no_inputs") {
        actions.push(`${step.name}: current daily discovery handoff is ${parsed.handoff_status}; review ${parsed.trend_handoff_path || "trend discovery output"}.`);
      }
    }
    const parsed = parseJsonOutput(step.output);
    if (parsed) actions.push(...readNestedActions(root, parsed));
  }
  return Array.from(new Set(actions)).filter(Boolean);
}

function metricsPullArgs(metricsRange) {
  if (metricsRange.startDate === metricsRange.endDate) return ["--date", metricsRange.startDate];
  return ["--start", metricsRange.startDate, "--end", metricsRange.endDate];
}

function buildReport(root, runDate, metricsRange, steps) {
  const metricsDate = dateRangeLabel(metricsRange);
  const report = {
    run_date: runDate,
    metrics_date: metricsDate,
    metrics_start_date: metricsRange.startDate,
    metrics_end_date: metricsRange.endDate,
    metrics_mode: metricsRange.mode || (metricsRange.startDate === metricsRange.endDate ? "date" : "range"),
    metrics_lookback_days: metricsRange.lookbackDays ?? null,
    metrics_lag_days: metricsRange.lagDays ?? null,
    generated_at: new Date().toISOString(),
    status: steps.some((step) => step.status === "failed") ? "failed" : "completed_with_possible_skips",
    steps,
    next_manual_actions: nestedManualActions(root, steps),
  };
  return report;
}

function writeReport(outputDir, report) {
  writeJsonAtomic(path.join(outputDir, "daily-report.json"), report);
  const markdown = `# SEO/AEO Daily Run\n\nRun date: ${report.run_date}\nMetrics date: ${report.metrics_date}\nStatus: ${report.status}\n\n${report.steps
    .map((step) => `## ${step.name}\n\nStatus: ${step.status}\n\n\`\`\`text\n${step.output || "(no output)"}\n\`\`\``)
    .join("\n\n")}\n`;
  const markdownPath = path.join(outputDir, "daily-report.md");
  awaitWrite(markdownPath, markdown);
}

function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const runDate = arg("--date", today());
  const metricsRange = metricsDateRangeFromArgs(args);
  const metricsDate = dateRangeLabel(metricsRange);
  const googleMetricsArgs = metricsPullArgs(metricsRange);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const steps = [];

  steps.push(runStep("Pull GA4 page metrics", process.execPath, ["scripts/seo-aeo/pull-ga4.mjs", ...googleMetricsArgs]));
  steps.push(runStep("Pull GSC query metrics", process.execPath, ["scripts/seo-aeo/pull-gsc.mjs", ...googleMetricsArgs]));
  steps.push(runStep("Write measurement diagnostics", process.execPath, [
    "scripts/seo-aeo/diagnose-measurement-signals.mjs",
    "--run-date",
    runDate,
    ...googleMetricsArgs,
  ]));
  steps.push(gscFallbackStep(root, runDate));
  steps.push(runStep("Pull Bing Webmaster query metrics", process.execPath, [
    "scripts/seo-aeo/pull-bing-webmaster.mjs",
    ...googleMetricsArgs,
  ]));
  steps.push(runStep("Pull Reddit discovery trends", process.execPath, ["scripts/seo-aeo/pull-reddit-trends.mjs", "--date", runDate]));
  steps.push(runStep("Pull Google Trends RSS discovery trends", process.execPath, [
    "scripts/seo-aeo/pull-google-trends-rss.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Pull public source discovery trends", process.execPath, ["scripts/seo-aeo/pull-public-trends.mjs", "--date", runDate]));
  steps.push(runStep("Check AI citation import preflight fixture", process.execPath, ["scripts/seo-aeo/check-ai-citation-import-fixture.mjs"]));
  steps.push(runStep("Stage completed AI citation capture rows", process.execPath, [
    "scripts/seo-aeo/stage-ai-citation-capture-rows.mjs",
    "--date",
    runDate,
    "--apply",
  ]));
  steps.push(runStep("Check AI citation import preflight", process.execPath, [
    "scripts/seo-aeo/check-ai-citation-import.mjs",
    "--date",
    runDate,
    "--strict",
  ]));
  steps.push(runStep("Import manual analytics exports", process.execPath, ["scripts/seo-aeo/import-analytics-exports.mjs", "--date", runDate, "--strict"]));
  steps.push(runStep("Check AI citation query set", process.execPath, ["scripts/seo-aeo/check-ai-citation-query-set.mjs", "--date", runDate]));
  steps.push(runStep("Write AI citation capture pack", process.execPath, ["scripts/seo-aeo/write-ai-citation-capture-pack.mjs", "--date", runDate]));
  steps.push(runStep("Build AI citation capture task batch", process.execPath, ["scripts/seo-aeo/build-ai-citation-capture-tasks.mjs", "--date", runDate]));
  steps.push(runStep("Roll up feedback signals", process.execPath, ["scripts/seo-aeo/rollup-feedback-signals.mjs", "--date", runDate]));
  steps.push(runStep("Build initial trend/query discovery", process.execPath, ["scripts/seo-aeo/build-discovery-run.mjs", "--date", runDate]));
  steps.push(runStep("Check packet source URLs", process.execPath, ["scripts/seo-aeo/check-sources.mjs", "--date", runDate]));
  steps.push(runStep("Score analytics rows", process.execPath, ["scripts/seo-aeo/score-analytics.mjs"]));
  steps.push(runStep("Check feedback signal rollup fixture", process.execPath, ["scripts/seo-aeo/check-feedback-rollup.mjs"]));
  steps.push(runStep("Check analytics feedback fixture", process.execPath, ["scripts/seo-aeo/check-analytics-feedback.mjs"]));
  steps.push(runStep("Check content decision lifecycle fixture", process.execPath, ["scripts/seo-aeo/check-content-decision-lifecycle.mjs"]));
  steps.push(runStep("Check AI citation query set fixture", process.execPath, ["scripts/seo-aeo/check-ai-citation-query-set-fixture.mjs"]));
  steps.push(runStep("Check AI citation capture pack fixture", process.execPath, ["scripts/seo-aeo/check-ai-citation-capture-pack-fixture.mjs"]));
  steps.push(runStep("Check AI citation capture task fixture", process.execPath, ["scripts/seo-aeo/check-ai-citation-capture-tasks.mjs"]));
  steps.push(runStep("Check AI citation capture row staging fixture", process.execPath, ["scripts/seo-aeo/check-ai-citation-capture-row-staging.mjs"]));
  steps.push(runStep("Check subagent dispatch readiness fixture", process.execPath, ["scripts/seo-aeo/check-subagent-dispatch-readiness.mjs"]));
  steps.push(runStep("Check refresh target resolver fixture", process.execPath, ["scripts/seo-aeo/check-refresh-targets.mjs"]));
  steps.push(runStep("Check gap ledger lineage fixture", process.execPath, ["scripts/seo-aeo/check-gap-ledger-lineage.mjs"]));
  steps.push(runStep("Check demand acquisition rollup fixture", process.execPath, ["scripts/seo-aeo/check-demand-acquisition-rollup.mjs"]));
  steps.push(runStep("Check demand source request fixture", process.execPath, ["scripts/seo-aeo/check-demand-source-request.mjs"]));
  steps.push(runStep("Check demand promotion runner fixture", process.execPath, ["scripts/seo-aeo/check-demand-promotion-runner.mjs"]));
  steps.push(runStep("Check demand promotion freshness fixture", process.execPath, ["scripts/seo-aeo/check-demand-promotion-freshness-fixture.mjs"]));
  steps.push(runStep("Check demand promotion live-deploy guard fixture", process.execPath, ["scripts/seo-aeo/check-demand-promotion-live-deploy-guard.mjs"]));
  steps.push(runStep("Check live-deploy demand-promotion gate fixture", process.execPath, ["scripts/seo-aeo/check-live-deploy-demand-promotion-gates.mjs"]));
  steps.push(runStep("Check metrics date range args fixture", process.execPath, ["scripts/seo-aeo/check-metrics-date-range-args.mjs"]));
  steps.push(runStep("Check Google Trends RSS lane fixture", process.execPath, ["scripts/seo-aeo/check-google-trends-rss-lane.mjs"]));
  steps.push(runStep("Check manual Reddit capture lane fixture", process.execPath, ["scripts/seo-aeo/check-manual-reddit-capture-lane.mjs"]));
  steps.push(runStep("Check Netlify publish directory fixture", process.execPath, ["scripts/seo-aeo/check-netlify-publish-dir-fixture.mjs"]));
  steps.push(runStep("Check deploy review freshness fixture", process.execPath, ["scripts/seo-aeo/check-deploy-review-freshness-fixture.mjs"]));
  steps.push(runStep("Build clean Netlify publish directory", process.execPath, ["scripts/seo-aeo/build-netlify-publish-dir.mjs"]));
  steps.push(runStep("Check clean Netlify publish directory", process.execPath, [
    "scripts/seo-aeo/check-netlify-publish-dir.mjs",
    "--date",
    runDate,
    "--build",
  ]));
  steps.push(runStep("Check deployment readiness fixture", process.execPath, ["scripts/seo-aeo/check-deployment-readiness-fixture.mjs"]));
  steps.push(runStep("Check live deployment fixture", process.execPath, ["scripts/seo-aeo/check-live-deployment-fixture.mjs"]));
  steps.push(runStep("Check stale subagent completion fixture", process.execPath, ["scripts/seo-aeo/check-subagent-stale-completions.mjs"]));
  steps.push(runStep("Generate content decisions", process.execPath, ["scripts/seo-aeo/generate-content-decisions.mjs", "--date", runDate]));
  steps.push(runStep("Sync analytics into packet performance logs", process.execPath, ["scripts/seo-aeo/sync-packet-performance.mjs"]));
  steps.push(runStep("Plan daily content candidates", process.execPath, ["scripts/seo-aeo/plan-content.mjs", "--date", runDate]));
  steps.push(runStep("Export daily topic seeds", process.execPath, ["scripts/seo-aeo/export-topic-seeds.mjs", "--date", runDate]));
  steps.push(runStep("Build daily trend/query discovery", process.execPath, [
    "scripts/seo-aeo/build-discovery-run.mjs",
    "--date",
    runDate,
  ]));
  steps.push(validateCurrentQueryIntelligence(root, runDate));
  steps.push(runStep("Build demand import worklist", process.execPath, ["scripts/seo-aeo/build-demand-import-worklist.mjs", "--date", runDate]));
  steps.push(runStep("Prepare demand import pack", process.execPath, ["scripts/seo-aeo/prepare-demand-import-pack.mjs", "--date", runDate]));
  steps.push(runStep("Validate demand import pack", process.execPath, ["scripts/seo-aeo/validate-demand-import-pack.mjs", "--date", runDate]));
  steps.push(runStep("Check demand promotion freshness", process.execPath, [
    "scripts/seo-aeo/check-demand-promotion-freshness.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Summarize demand import reviews", process.execPath, ["scripts/seo-aeo/summarize-demand-import-reviews.mjs", "--date", runDate]));
  steps.push(runStep("Audit demand readiness preflight", process.execPath, ["scripts/seo-aeo/audit-demand-readiness.mjs", "--date", runDate]));
  steps.push(runStep("Build demand acquisition brief", process.execPath, [
    "scripts/seo-aeo/build-demand-acquisition-brief.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Build demand acquisition task batch", process.execPath, [
    "scripts/seo-aeo/build-demand-acquisition-tasks.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Summarize demand acquisition reports", process.execPath, [
    "scripts/seo-aeo/summarize-demand-acquisition-reports.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Validate source-request demand import pack", process.execPath, ["scripts/seo-aeo/validate-demand-import-pack.mjs", "--date", runDate]));
  steps.push(runStep("Resolve refresh targets", process.execPath, ["scripts/seo-aeo/resolve-refresh-targets.mjs", "--date", runDate]));
  steps.push(runStep("Build subagent task queue", process.execPath, ["scripts/seo-aeo/build-subagent-queue.mjs", "--date", runDate]));
  steps.push(runStep("Sync subagent completion ledger", process.execPath, ["scripts/seo-aeo/subagent-queue.mjs", "sync-completions", "--date", runDate]));
  steps.push(runStep("Build ready subagent dispatch batch", process.execPath, ["scripts/seo-aeo/build-subagent-dispatch.mjs", "--date", runDate]));
  steps.push(runStep("Check completed subagent artifacts", process.execPath, ["scripts/seo-aeo/check-subagent-artifacts.mjs", "--date", runDate]));
  steps.push(runStep("Build daily gap ledger", process.execPath, ["scripts/seo-aeo/build-gap-ledger.mjs", "--date", runDate]));
  steps.push(runStep("Write Skill Steward closeout", process.execPath, ["scripts/seo-aeo/write-skill-steward-closeout.mjs", "--date", runDate]));
  steps.push(runStep("Build Skill Steward review task batch", process.execPath, [
    "scripts/seo-aeo/build-skill-steward-review-tasks.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Check Skill Steward review task fixture", process.execPath, ["scripts/seo-aeo/check-skill-steward-review-tasks.mjs"]));
  steps.push(runStep("Validate current blog foundation", process.execPath, ["scripts/blog-orchestrator.mjs", "check-all"]));
  steps.push(runStep("Check live deployment routes", process.execPath, ["scripts/seo-aeo/check-live-deployment.mjs", "--date", runDate]));
  steps.push(runStep("Write deployment readiness", process.execPath, ["scripts/seo-aeo/write-deployment-readiness.mjs", "--date", runDate]));

  steps.push(runStep("Plan governed publishing", process.execPath, ["scripts/seo-aeo/publish-governor.mjs", "--date", runDate]));
  steps.push(runStep("Write deploy review packet", process.execPath, ["scripts/seo-aeo/write-deploy-review-packet.mjs", "--date", runDate]));
  steps.push(runStep("Audit Codex automations", process.execPath, [
    "scripts/seo-aeo/audit-codex-automations.mjs",
    "--date",
    runDate,
    "--fail-on-missing",
  ]));
  writeReport(outputDir, buildReport(root, runDate, metricsRange, steps));
  steps.push(runStep("Write machine-readable run status", process.execPath, [
    "scripts/seo-aeo/write-run-status.mjs",
    "--date",
    runDate,
    "--metrics-date",
    metricsDate,
  ]));
  steps.push(runStep("Audit SEO/AEO system completion", process.execPath, [
    "scripts/seo-aeo/audit-system-completion.mjs",
    "--date",
    runDate,
    "--summary",
  ]));
  steps.push(runStep("Enforce daily run gates", process.execPath, [
    "scripts/seo-aeo/enforce-run-gates.mjs",
    "--date",
    runDate,
    "--mode",
    "daily",
    "--no-fail",
  ]));
  steps.push(runStep("Write owner actions", process.execPath, [
    "scripts/seo-aeo/write-owner-actions.mjs",
    "--date",
    runDate,
  ]));
  steps.push(runStep("Write source acquisition packet", process.execPath, [
    "scripts/seo-aeo/write-source-acquisition-packet.mjs",
    "--date",
    runDate,
  ]));
  writeReport(outputDir, buildReport(root, runDate, metricsRange, steps));
  steps.push(runStep("Write final machine-readable run status", process.execPath, [
    "scripts/seo-aeo/write-run-status.mjs",
    "--date",
    runDate,
    "--metrics-date",
    metricsDate,
  ]));
  steps.push(runStep("Write final owner actions", process.execPath, [
    "scripts/seo-aeo/write-owner-actions.mjs",
    "--date",
    runDate,
  ]));

  const report = buildReport(root, runDate, metricsRange, steps);
  writeReport(outputDir, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(steps.some((step) => step.status === "failed") ? 1 : 0);
}

function awaitWrite(filePath, value) {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, value);
  fs.renameSync(tmpPath, filePath);
}

run();
