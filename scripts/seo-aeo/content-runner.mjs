#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { dateRangeLabel, metricsDateRangeFromArgs, today } from "./lib/dates.mjs";
import { acquireRunLock } from "./lib/run-lock.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function dailyRunnerMetricsArgs(metricsRange) {
  if (metricsRange.startDate === metricsRange.endDate) return ["--metrics-date", metricsRange.startDate];
  return ["--metrics-start", metricsRange.startDate, "--metrics-end", metricsRange.endDate];
}

function runStep(name, command, args, { allowSetupSkips = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const missingSetup =
    allowSetupSkips &&
    result.status !== 0 &&
    /(Set (GA4_PROPERTY_ID|GA4_MEASUREMENT_ID|GSC_SITE_URL|GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_OAUTH_CREDENTIALS|GOOGLE_OAUTH_CREDENTIALS_JSON|REDDIT_CLIENT_ID|REDDIT_CLIENT_SECRET|REDDIT_USER_AGENT)|Google service account file not found|Configured service-account path was not found|Configured OAuth path was not found)/i.test(
      output
    );
  return {
    name,
    command: [command, ...args].join(" "),
    status: result.status === 0 ? "completed" : missingSetup ? "skipped_missing_setup" : "failed",
    exit_code: result.status,
    output,
  };
}

function readPlanCandidates(root, runDate) {
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  if (!fs.existsSync(planPath)) return { planPath, rows: [] };
  return { planPath, rows: parseCsv(fs.readFileSync(planPath, "utf8")).rows };
}

function listPackets(root) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot)) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("content-packets", entry.name))
    .sort();
}

function writeMarkdownReport(filePath, report) {
  const candidateLines = report.candidates
    .slice(0, 25)
    .map(
      (candidate) =>
        `- ${candidate.candidate_id}: ${candidate.topic} (${candidate.intent}) -> ${candidate.recommended_asset}; ${candidate.next_action}`
    )
    .join("\n");
  const packetLines = report.packet_validations
    .map((packet) => `- ${packet.packet}: ${packet.approved ? "approved" : "not approved"}`)
    .join("\n");
  const manualActionLines = report.next_manual_actions.map((action) => `- ${action}`).join("\n");
  const dispatchLines = report.subagent_dispatch?.selected_tasks?.length
    ? report.subagent_dispatch.selected_tasks
        .slice(0, 12)
        .map((task) => `- ${task.task_id}: ${task.role} -> ${task.artifact_path}`)
        .join("\n")
    : "- No ready dispatch tasks found.";
  const stepLines = report.steps
    .map((step) => `## ${step.name}\n\nStatus: ${step.status}\n\n\`\`\`text\n${step.output || "(no output)"}\n\`\`\``)
    .join("\n\n");
  const markdown = `# SEO/AEO Content Run

Run date: ${report.run_date}
Metrics date: ${report.metrics_date}
Status: ${report.status}

## Candidate Topics

${candidateLines || "- No candidates found. Run discovery first."}

## Packet Validations

${packetLines || "- No packets found."}

## Setup Or Manual Actions

${manualActionLines || "- None from this run."}

## Subagent Rule

No single agent owns a whole post. Use the candidate assignments and packet work orders to launch narrow subagents for topic, query, trend, source, research, outline, draft, claim, metadata, asset, generator, distribution, analytics, and QA work.

## Ready Subagent Dispatch

Dispatch file: ${report.subagent_dispatch?.path || "not found"}

${dispatchLines}

## Steps

${stepLines}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function nestedManualActions(steps) {
  const actions = [];
  for (const step of steps) {
    if (step.status === "skipped_missing_setup") actions.push(`${step.name}: ${step.output.split("\n")[0]}`);
    try {
      const parsed = JSON.parse(step.output);
      for (const action of parsed.next_manual_actions || []) actions.push(action);
    } catch {
      // Step output is often plain text.
    }
  }
  return Array.from(new Set(actions));
}

function readPublishPlan(root, runDate) {
  const planPath = path.join(root, "automation-runs", runDate, "publish-plan.json");
  if (!fs.existsSync(planPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(planPath, "utf8"));
  } catch {
    return null;
  }
}

function readSubagentDispatch(root, runDate) {
  const dispatchPath = path.join(root, "automation-runs", runDate, "subagent-dispatch", "ready-batch.json");
  if (!fs.existsSync(dispatchPath)) return null;
  try {
    const dispatch = JSON.parse(fs.readFileSync(dispatchPath, "utf8"));
    return {
      path: path.relative(root, dispatchPath).split(path.sep).join("/"),
      counts: dispatch.counts || {},
      selected_tasks: (dispatch.selected_tasks || []).map((task) => ({
        task_id: task.task_id,
        role: task.role,
        artifact_path: task.artifact_path,
        prompt_path: task.prompt_path,
      })),
    };
  } catch {
    return null;
  }
}

function packetValidationsFromPublishPlan(plan) {
  const selected = (plan?.selected_packets || []).map((packet) => ({
    packet: packet.packet,
    approved: true,
    selected: true,
    status: "selected",
    reasons: packet.selection_reasons || [],
  }));
  const blocked = (plan?.blocked_packets || []).map((packet) => ({
    packet: packet.packet,
    approved: false,
    selected: false,
    status: "blocked",
    reasons: (packet.reasons || []).map((reason) => reason.message || reason.code).filter(Boolean),
  }));
  return [...selected, ...blocked].sort((a, b) => a.packet.localeCompare(b.packet));
}

function publishPlanManualActions(plan) {
  return plan?.next_manual_actions || [];
}

function run() {
  const root = process.cwd();
  const lock = acquireRunLock(root, "content-runner");
  process.on("exit", () => lock.release());
  const args = process.argv.slice(2);
  const runDate = arg("--date", today());
  const metricsRange = metricsDateRangeFromArgs(args);
  const metricsDate = dateRangeLabel(metricsRange);
  const scaffoldLimit = Number(arg("--scaffold-limit", "0"));
  const generateApproved = hasFlag("--generate-approved");
  const allowMultiPost = hasFlag("--allow-multi-post");
  const dryRunGenerate = !generateApproved || hasFlag("--dry-run");
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const steps = [];

  steps.push(
    runStep(
      "Run daily data pipeline",
      process.execPath,
      ["scripts/seo-aeo/daily-runner.mjs", "--date", runDate, ...dailyRunnerMetricsArgs(metricsRange)],
      { allowSetupSkips: true }
    )
  );

  const { planPath, rows: candidates } = readPlanCandidates(root, runDate);
  if (scaffoldLimit > 0 && fs.existsSync(planPath)) {
    steps.push(
      runStep("Scaffold candidate packets", process.execPath, [
        "scripts/seo-aeo/scaffold-packets.mjs",
        "--from",
        planPath,
        "--limit",
        String(scaffoldLimit),
        "--date",
        runDate,
      ])
    );
  }

  const governorArgs = ["scripts/seo-aeo/publish-governor.mjs", "--date", runDate, "--generate-approved"];
  if (dryRunGenerate) governorArgs.push("--dry-run");
  if (allowMultiPost) governorArgs.push("--allow-multi-post");
  steps.push(runStep("Run publish governor", process.execPath, governorArgs));
  const publishPlan = readPublishPlan(root, runDate);
  const subagentDispatch = readSubagentDispatch(root, runDate);
  const packetValidations = publishPlan
    ? packetValidationsFromPublishPlan(publishPlan)
    : listPackets(root).map((packet) => ({
        packet,
        approved: false,
        selected: false,
        status: "not_inspected",
      }));

  let report = {
    run_date: runDate,
    metrics_date: metricsDate,
    metrics_start_date: metricsRange.startDate,
    metrics_end_date: metricsRange.endDate,
    metrics_mode: metricsRange.mode || (metricsRange.startDate === metricsRange.endDate ? "date" : "range"),
    metrics_lookback_days: metricsRange.lookbackDays ?? null,
    metrics_lag_days: metricsRange.lagDays ?? null,
    generated_at: new Date().toISOString(),
    status: steps.some((step) => step.status === "failed") ? "failed" : "completed_with_possible_skips",
    generate_mode: dryRunGenerate ? "dry_run" : "write",
    allow_multi_post: allowMultiPost,
    scaffold_limit: scaffoldLimit,
    candidates,
    subagent_dispatch: subagentDispatch,
    packet_validations: packetValidations,
    steps,
    next_manual_actions: Array.from(new Set([...nestedManualActions(steps), ...publishPlanManualActions(publishPlan)])),
  };

  writeJsonAtomic(path.join(outputDir, "content-run-report.json"), report);
  writeMarkdownReport(path.join(outputDir, "content-run-report.md"), report);
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
  steps.push(runStep("Write owner actions", process.execPath, [
    "scripts/seo-aeo/write-owner-actions.mjs",
    "--date",
    runDate,
  ]));
  report = {
    ...report,
    generated_at: new Date().toISOString(),
    status: steps.some((step) => step.status === "failed") ? "failed" : "completed_with_possible_skips",
    steps,
    next_manual_actions: Array.from(new Set([...nestedManualActions(steps), ...publishPlanManualActions(publishPlan)])),
  };
  writeJsonAtomic(path.join(outputDir, "content-run-report.json"), report);
  writeMarkdownReport(path.join(outputDir, "content-run-report.md"), report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "failed" ? 1 : 0);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
