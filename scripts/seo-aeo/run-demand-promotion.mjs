#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const ALLOWED_FLAGS = new Set([
  "--date",
  "--dry-run",
  "--apply",
  "--approval-marker",
  "--live-deploy-defer-marker",
  "--scaffold-limit",
  "--require-ready",
]);

function usage() {
  console.log(`Usage:
  node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --dry-run
  node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --apply --approval-marker DEMAND-PROMOTION-APPROVED:<yyyy-mm-dd>
  # Only when live deployment is blocked and the deploy blocker is explicitly deferred:
  node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --apply --approval-marker DEMAND-PROMOTION-APPROVED:<yyyy-mm-dd> --live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:<yyyy-mm-dd>
  # Optional only after plain apply report review and packet approval:
  node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --apply --scaffold-limit 1

Promotes reviewed demand-import staging rows through the existing validators, rebuilds daily
query discovery, and optionally scaffolds packets only after a current ready handoff validates.
Run plain --apply first; use --scaffold-limit only after reviewing the promotion report and receiving packet approval.
If live deployment is blocked, apply is stopped unless the owner explicitly defers that blocker with the live-deploy defer marker.`);
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function parseArgs(argv) {
  const args = {
    runDate: today(),
    dryRun: false,
    apply: false,
    scaffoldLimit: 0,
    scaffoldLimitProvided: false,
    requireReady: false,
    approvalMarker: "",
    liveDeployDeferMarker: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      args.help = true;
      continue;
    }
    if (!ALLOWED_FLAGS.has(item)) throw new Error(`Unknown flag: ${item}`);
    if (item === "--date") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--date requires a yyyy-mm-dd value.");
      args.runDate = validateIsoDate(value, "--date");
      index += 1;
      continue;
    }
    if (item === "--scaffold-limit") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--scaffold-limit requires a number.");
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0) throw new Error("--scaffold-limit must be a non-negative integer.");
      args.scaffoldLimit = number;
      args.scaffoldLimitProvided = true;
      index += 1;
      continue;
    }
    if (item === "--approval-marker") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--approval-marker requires a value.");
      args.approvalMarker = value;
      index += 1;
      continue;
    }
    if (item === "--live-deploy-defer-marker") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--live-deploy-defer-marker requires a value.");
      args.liveDeployDeferMarker = value;
      index += 1;
      continue;
    }
    if (item === "--dry-run") args.dryRun = true;
    if (item === "--apply") args.apply = true;
    if (item === "--require-ready") args.requireReady = true;
  }

  if (args.dryRun && args.apply) throw new Error("Use either --dry-run or --apply, not both.");
  if (!args.dryRun && !args.apply) args.dryRun = true;
  if (args.scaffoldLimitProvided && !args.apply) throw new Error("--scaffold-limit requires --apply.");
  if (args.requireReady && !args.apply) throw new Error("--require-ready requires --apply.");
  return args;
}

function approvalMarkerFor(runDate) {
  return `DEMAND-PROMOTION-APPROVED:${runDate}`;
}

function liveDeployDeferMarkerFor(runDate) {
  return `LIVE-DEPLOY-BLOCKER-DEFERRED:${runDate}`;
}

function parseJsonOutput(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function runNodeStep(name, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
  return {
    name,
    command: [process.execPath, ...args].join(" "),
    status: result.status === 0 ? "completed" : "failed",
    exit_code: result.status,
    output,
    parsed: parseJsonOutput(stdout) || parseJsonOutput(output),
  };
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function reportPaths(root, runDate) {
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  return {
    outputDir,
    jsonPath: path.join(outputDir, "demand-promotion-report.json"),
    mdPath: path.join(outputDir, "demand-promotion-report.md"),
  };
}

function writeMarkdown(filePath, report) {
  const stepLines = report.steps
    .map((step) => `- ${step.status}: \`${step.command}\``)
    .join("\n");
  const markdown = `# Demand Promotion Report

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Mode: ${report.mode}
Status: ${report.status}

## Summary

- Valid for promotion: ${report.validation?.valid_for_promotion ?? "n/a"}
- Promoted: ${report.apply_result?.promoted ?? "n/a"}
- Blocked: ${report.validation?.blocked ?? "n/a"}
- Empty staging: ${report.validation?.empty_staging ?? "n/a"}
- Query intelligence: ${report.query_intelligence_dir || "not created"}
- Handoff status: ${report.query_handoff_status || "n/a"}
- Scaffold limit: ${report.scaffold_limit}
- Scaffolded packets: ${report.scaffold_result?.selected ?? "n/a"}

## Next Action

${report.next_action}

## Steps

${stepLines || "- None."}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function finalize(root, report, status, exitCode, nextAction) {
  const paths = reportPaths(root, report.run_date);
  const finalReport = {
    ...report,
    generated_at: new Date().toISOString(),
    status,
    exit_code: exitCode,
    next_action: nextAction,
    artifacts: {
      demand_promotion_report_json: relative(root, paths.jsonPath),
      demand_promotion_report_md: relative(root, paths.mdPath),
      validation_report_json: `research/daily-content-plan/${report.run_date}/demand-import-pack/validation-report.json`,
      validation_report_md: `research/daily-content-plan/${report.run_date}/demand-import-pack/validation-report.md`,
    },
  };
  writeJsonAtomic(paths.jsonPath, finalReport);
  writeMarkdown(paths.mdPath, finalReport);
  console.log(JSON.stringify(finalReport, null, 2));
  process.exit(exitCode);
}

function currentQueryRun(root, runDate, buildResult) {
  const fromBuild = buildResult?.query_intelligence_dir || "";
  if (fromBuild) return fromBuild;
  const runDir = path.join(root, "research", "query-intelligence", `${runDate}-daily-discovery`);
  return fs.existsSync(runDir) ? relative(root, runDir) : "";
}

function hasPlainPromotionProof(report, runDate) {
  if (!report || typeof report !== "object") return false;
  return (
    report.run_date === runDate &&
    report.mode === "apply" &&
    Number(report.scaffold_limit || 0) === 0 &&
    Number(report.exit_code || 0) === 0 &&
    report.status === "applied_discovery_rebuilt_handoff_ready" &&
    Number(report.apply_result?.promoted || 0) + Number(report.apply_result?.already_promoted || 0) >= 1 &&
    String(report.query_handoff_status || "").toLowerCase() === "ready"
  );
}

function liveDeploymentGuard(root, runDate) {
  const runStatusPath = path.join(root, "automation-runs", runDate, "run-status.json");
  const liveCheckPath = path.join(root, "automation-runs", runDate, "live-deployment-check.json");
  const runStatus = readJson(runStatusPath, {});
  const liveCheck = readJson(liveCheckPath, {});
  const status = runStatus.live_deployment?.status || liveCheck.status || "";
  const blockedCount = Number(runStatus.live_deployment?.blocked_count ?? liveCheck.blocked_count ?? 0);
  const blocked =
    status === "blocked" ||
    blockedCount > 0 ||
    runStatus.overall_status === "needs_live_deployment";
  return {
    status: status || "missing",
    blocked,
    blocked_count: Number.isFinite(blockedCount) ? blockedCount : 0,
    expected_defer_marker: liveDeployDeferMarkerFor(runDate),
    evidence: fs.existsSync(runStatusPath)
      ? relative(root, runStatusPath)
      : fs.existsSync(liveCheckPath)
        ? relative(root, liveCheckPath)
        : "",
    rule:
      "Demand promotion apply is blocked while live deployment is blocked unless the deploy blocker is explicitly deferred by marker.",
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const root = process.cwd();
  const report = {
    schema_version: "1.0",
    run_date: args.runDate,
    generated_at: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry_run",
    scaffold_limit: args.scaffoldLimit,
    require_ready: args.requireReady,
    status: "running",
    approval_marker_provided: args.approvalMarker ? "yes" : "no",
    live_deploy_defer_marker_provided: args.liveDeployDeferMarker ? "yes" : "no",
    steps: [],
    validation: null,
    apply_result: null,
    discovery_result: null,
    query_validation: null,
    scaffold_result: null,
    query_intelligence_dir: "",
    query_handoff_status: "",
    rule: "This runner never creates demand data. It only promotes non-empty, reviewed staging CSVs that pass source-specific validation.",
  };
  report.live_deployment_guard = liveDeploymentGuard(root, args.runDate);

  if (args.apply && args.scaffoldLimit === 0 && args.approvalMarker !== approvalMarkerFor(args.runDate)) {
    finalize(
      root,
      report,
      "blocked_missing_apply_approval",
      1,
      `Plain apply requires \`--approval-marker ${approvalMarkerFor(args.runDate)}\` after dry-run review.`
    );
  }

  if (
    args.apply &&
    report.live_deployment_guard.blocked &&
    args.liveDeployDeferMarker !== liveDeployDeferMarkerFor(args.runDate)
  ) {
    finalize(
      root,
      report,
      "blocked_live_deployment_not_ready",
      1,
      `Live deployment is blocked (${report.live_deployment_guard.blocked_count} route(s)). Resolve deployment first, or explicitly defer it with \`--live-deploy-defer-marker ${liveDeployDeferMarkerFor(args.runDate)}\` after owner approval.`
    );
  }

  if (args.scaffoldLimit > 0) {
    const existingReportPath = reportPaths(root, args.runDate).jsonPath;
    const existingReport = readJson(existingReportPath, null);
    if (!hasPlainPromotionProof(existingReport, args.runDate)) {
      finalize(
        root,
        report,
        "blocked_scaffold_requires_plain_apply",
        1,
        `Run plain \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${args.runDate} --apply\` first and review the resulting ready handoff report before using --scaffold-limit.`
      );
    }
    report.plain_promotion_proof = {
      path: relative(root, existingReportPath),
      status: existingReport.status,
      promoted: existingReport.apply_result?.promoted ?? null,
      already_promoted: existingReport.apply_result?.already_promoted ?? null,
      query_handoff_status: existingReport.query_handoff_status || "",
    };
  }

  const validationArgs = [
    "scripts/seo-aeo/validate-demand-import-pack.mjs",
    "--date",
    args.runDate,
    "--fail-on-blocked",
    "--fail-on-none-valid",
  ];
  const validation = runNodeStep("Validate demand import pack", validationArgs);
  report.steps.push(validation);
  report.validation = validation.parsed;

  if (validation.exit_code !== 0) {
    finalize(
      root,
      report,
      "blocked_validation",
      1,
      "Fix the demand-import staging CSVs with real reviewed rows, then rerun this command. No imports were promoted."
    );
  }

  if (args.dryRun) {
    const validForPromotion = Number(report.validation?.valid_for_promotion || 0);
    if (validForPromotion < 1) {
      const alreadyPromoted = Number(report.validation?.already_promoted || 0);
      finalize(
        root,
        report,
        alreadyPromoted > 0 ? "no_new_rows_to_apply_existing_promotions_present" : "blocked_no_valid_rows_to_apply",
        0,
        alreadyPromoted > 0
          ? "No new staged rows are valid for promotion. Existing promoted rows can support discovery after the daily controller rebuilds, but do not run the apply command until a dry-run shows at least one valid_for_promotion row."
          : "No staged rows are valid for promotion. Fill the demand-import staging CSVs with real reviewed rows before running apply."
      );
    }
    finalize(
      root,
      report,
      "ready_to_apply",
      0,
      report.live_deployment_guard.blocked
        ? `Dry-run passed, but apply is blocked while live deployment is blocked (${report.live_deployment_guard.blocked_count} route(s)). Resolve deployment first, or explicitly defer with \`--live-deploy-defer-marker ${liveDeployDeferMarkerFor(args.runDate)}\` after owner approval.`
        : `Dry-run passed. If the rows are approved, run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${args.runDate} --apply --approval-marker ${approvalMarkerFor(args.runDate)}\` first. Review the promotion report before any scaffolded apply.`
    );
  }

  if (args.scaffoldLimit > 0) {
    report.steps.push({
      name: "Apply valid demand imports",
      command: "(skipped; using prior plain apply proof)",
      status: "skipped_prior_plain_apply_proof",
      exit_code: 0,
      output: JSON.stringify(report.plain_promotion_proof || {}, null, 2),
    });
    report.apply_result = {
      promoted: Number(report.plain_promotion_proof?.promoted || 0),
      already_promoted: Number(report.plain_promotion_proof?.already_promoted || 0),
    };
  } else {
    const applyStep = runNodeStep("Apply valid demand imports", [
      "scripts/seo-aeo/validate-demand-import-pack.mjs",
      "--date",
      args.runDate,
      "--apply",
      "--approval-marker",
      approvalMarkerFor(args.runDate),
      "--fail-on-blocked",
      "--fail-on-none-valid",
    ]);
    report.steps.push(applyStep);
    report.apply_result = applyStep.parsed;
    const appliedCount = Number(applyStep.parsed?.promoted || 0) + Number(applyStep.parsed?.already_promoted || 0);
    if (applyStep.exit_code !== 0 || appliedCount < 1) {
      finalize(
        root,
        report,
        "blocked_apply",
        1,
        "Promotion did not copy or confirm any reviewed rows in imports/. Inspect the validation report before rebuilding discovery."
      );
    }
  }

  const discovery = runNodeStep("Rebuild daily discovery", [
    "scripts/seo-aeo/build-discovery-run.mjs",
    "--date",
    args.runDate,
  ]);
  report.steps.push(discovery);
  report.discovery_result = discovery.parsed;
  if (discovery.exit_code !== 0) {
    finalize(root, report, "blocked_discovery_rebuild", 1, "Discovery rebuild failed after promotion. Inspect the step output before scaffolding packets.");
  }

  const queryDir = currentQueryRun(root, args.runDate, discovery.parsed);
  report.query_intelligence_dir = queryDir;
  if (!queryDir) {
    const status = args.scaffoldLimit > 0 || args.requireReady ? "blocked_no_query_handoff" : "applied_discovery_rebuilt_no_handoff";
    const exitCode = args.scaffoldLimit > 0 || args.requireReady ? 1 : 0;
    finalize(
      root,
      report,
      status,
      exitCode,
      "Discovery rebuilt, but no query-intelligence handoff directory was created. Add stronger validated/source-diverse demand before scaffolding packets."
    );
  }

  const handoffPath = path.join(root, queryDir, "brief-handoff.yaml");
  report.query_handoff_status = readYamlScalar(handoffPath, "handoff_status");
  const queryValidationArgs = [
    "scripts/seo-aeo/validate-query-intelligence.mjs",
    queryDir,
    "--json",
  ];
  if (args.requireReady || args.scaffoldLimit > 0) queryValidationArgs.push("--require-handoff-ready");
  const queryValidation = runNodeStep("Validate query intelligence handoff", queryValidationArgs);
  report.steps.push(queryValidation);
  report.query_validation = queryValidation.parsed;
  if (queryValidation.exit_code !== 0) {
    const status = args.requireReady || args.scaffoldLimit > 0 ? "blocked_handoff_not_ready" : "blocked_handoff_validation";
    finalize(
      root,
      report,
      status,
      1,
      "Query intelligence did not validate for the requested promotion mode. Do not scaffold packets until the handoff validates."
    );
  }

  if (args.scaffoldLimit > 0) {
    const candidatesPath = `research/daily-content-plan/${args.runDate}/topic-candidates.csv`;
    const scaffold = runNodeStep("Scaffold current ready packets", [
      "scripts/seo-aeo/scaffold-packets.mjs",
      "--from",
      candidatesPath,
      "--limit",
      String(args.scaffoldLimit),
      "--date",
      args.runDate,
    ]);
    report.steps.push(scaffold);
    report.scaffold_result = scaffold.parsed;
    if (scaffold.exit_code !== 0) {
      finalize(root, report, "blocked_scaffold", 1, "Packet scaffolding refused the current handoff. Inspect the scaffold step output.");
    }
    const scaffoldedCount = Number(scaffold.parsed?.selected ?? 0);
    if (scaffoldedCount < 1) {
      const skipped = (scaffold.parsed?.skipped_intake_ready || [])
        .slice(0, 3)
        .map((row) => `${row.candidate_id || "candidate"}:${row.reason || "not_scaffoldable"}`)
        .join(" | ");
      finalize(
        root,
        report,
        "completed_no_packets_scaffolded",
        0,
        `Promotion, discovery rebuild, and handoff validation completed, but no packet was scaffolded under the current gates.${skipped ? ` Skips: ${skipped}.` : ""}`
      );
    }
    finalize(root, report, "completed_with_scaffold", 0, "Promotion, discovery rebuild, handoff validation, and packet scaffolding completed under the current gates.");
  }

  const ready = String(report.query_handoff_status || "").toLowerCase() === "ready";
  finalize(
    root,
    report,
    ready ? "applied_discovery_rebuilt_handoff_ready" : "applied_discovery_rebuilt_handoff_draft",
    0,
    ready
      ? `Ready handoff exists. Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${args.runDate} --apply --scaffold-limit 1\` only if packet scaffolding is approved.`
      : "Demand was promoted and discovery rebuilt, but the handoff is not ready. Keep resolving source diversity, topic authority, and validated demand gaps."
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
