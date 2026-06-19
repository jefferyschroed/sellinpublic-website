#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { netlifyPublishConfigSummary } from "./lib/netlify-publish-config.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function runCommand(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    available: !result.error,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error?.message || "",
  };
}

function fileState(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return {
    path: relativePath,
    exists: fs.existsSync(absolutePath),
    size: fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile() ? fs.statSync(absolutePath).size : 0,
  };
}

function gitSummary() {
  const remote = runCommand("git", ["remote", "-v"]);
  const status = runCommand("git", ["status", "--short"]);
  const branch = runCommand("git", ["branch", "--show-current"]);
  return {
    git_available: remote.available,
    branch: branch.stdout || "",
    remotes: remote.stdout.split("\n").filter(Boolean),
    dirty_count: status.stdout ? status.stdout.split("\n").filter(Boolean).length : 0,
    dirty_sample: status.stdout.split("\n").filter(Boolean).slice(0, 20),
  };
}

function netlifySummary() {
  const version = runCommand("netlify", ["--version"]);
  const config = netlifyPublishConfigSummary(process.cwd());
  return {
    cli_available: version.available && version.status === 0,
    version: version.stdout || "",
    error: version.available ? version.stderr : version.error,
    config,
    deploy_command_if_approved:
      "node scripts/seo-aeo/build-netlify-publish-dir.mjs && npx --yes netlify-cli deploy --prod --dir outputs/netlify-publish",
  };
}

function netlifyPublishCheckSummary(root, runDate) {
  const jsonPath = path.join(root, "automation-runs", runDate, "netlify-publish-check.json");
  const markdownPath = path.join(root, "automation-runs", runDate, "netlify-publish-check.md");
  const report = readJson(jsonPath, {});
  return {
    path: fs.existsSync(jsonPath) ? relative(root, jsonPath) : "",
    markdown_path: fs.existsSync(markdownPath) ? relative(root, markdownPath) : "",
    status: report.status || "missing",
    output_dir: report.output_dir || "outputs/netlify-publish",
    route_count: report.route_count || 0,
    blocked_count: report.blocked_count || 0,
    blockers: report.blockers || [],
    ga4_measurement_id: report.ga4_measurement_id || "",
    build_ran: report.build?.ran ?? false,
    build_status: report.build?.status ?? null,
  };
}

function writeMarkdown(filePath, report) {
  const fileLines = report.required_files
    .map((item) => `- ${item.exists && item.size > 0 ? "ready" : "missing"}: ${item.path} (${item.size} bytes)`)
    .join("\n");
  const remoteLines = report.git.remotes.map((item) => `- ${item}`).join("\n") || "- None found.";
  const dirtyLines = report.git.dirty_sample.map((item) => `- ${item}`).join("\n") || "- Working tree clean.";
  const markdown = `# Deployment Readiness

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}
Origin: ${report.origin}

## Live Check

- Status: ${report.live_deployment.status}
- Blocked routes: ${report.live_deployment.blocked_count}
- Report: ${report.live_deployment.markdown_path || report.live_deployment.path || "missing"}

## Required Local Files

${fileLines}

## Netlify

- CLI available: ${report.netlify.cli_available}
- Version: ${report.netlify.version || "n/a"}
- Config status: ${report.netlify.config.status}
- Config command: \`${report.netlify.config.command || "missing"}\`
- Config publish: \`${report.netlify.config.publish || "missing"}\`
- Clean publish check: ${report.netlify_publish_check.status}; routes ${report.netlify_publish_check.route_count}; blocked ${report.netlify_publish_check.blocked_count}; ${report.netlify_publish_check.markdown_path || report.netlify_publish_check.path || "missing"}
- Clean publish output: \`${report.netlify_publish_check.output_dir}\`
- Deploy command if approved: \`${report.netlify.deploy_command_if_approved}\`
- Rule: do not deploy the repo root with Netlify CLI; use Git-connected deploy or the clean publish directory.

## Git

- Branch: ${report.git.branch || "unknown"}
- Dirty paths: ${report.git.dirty_count}

Remotes:

${remoteLines}

Dirty sample:

${dirtyLines}

## Next Action

${report.next_action}
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const config = loadConfig(root);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const livePath = path.join(outputDir, "live-deployment-check.json");
  const live = readJson(livePath, {});
  const requiredFiles = [
    "index.html",
    "blog/index.html",
    "blog/employee-generated-content-infrastructure/index.html",
    "sitemap.xml",
    "feed.xml",
    "robots.txt",
    "netlify.toml",
  ].map((filePath) => fileState(root, filePath));
  const missingFiles = requiredFiles.filter((item) => !item.exists || item.size <= 0);
  const git = gitSummary();
  const netlify = netlifySummary();
  const netlifyPublishCheck = netlifyPublishCheckSummary(root, runDate);
  const origin = config.site?.origin || "https://sellinpublic.co";
  let status = "ready_for_approved_deploy";
  let nextAction = "After human approval, deploy through the Git-connected path or build and deploy the clean outputs/netlify-publish directory, then rerun the live deployment check.";
  if (missingFiles.length) {
    status = "blocked_missing_local_files";
    nextAction = `Restore missing local deploy files before deployment: ${missingFiles.map((item) => item.path).join(", ")}.`;
  } else if (netlify.config.status !== "ready") {
    status = "blocked_unsafe_netlify_config";
    nextAction =
      "Fix netlify.toml so the build command runs scripts/seo-aeo/build-netlify-publish-dir.mjs and publish is outputs/netlify-publish. Never publish the repo root.";
  } else if (netlifyPublishCheck.status !== "ready") {
    status = "blocked_local_publish_dir";
    nextAction =
      "Run `node scripts/seo-aeo/build-netlify-publish-dir.mjs` and `node scripts/seo-aeo/check-netlify-publish-dir.mjs --date <yyyy-mm-dd>` until the clean publish directory has all routes and GA4 tags before any approved deploy.";
  } else if (live.status === "ready") {
    status = "live_ready";
    nextAction = "Live deployment already matches local route and GA4 expectations. Continue with demand and publish gates.";
  } else if (!netlify.cli_available) {
    status = "waiting_for_git_or_netlify_deploy";
    nextAction =
      "Netlify CLI is not installed locally. Use the Git-connected Netlify deploy by committing/pushing approved changes, or install/authenticate Netlify CLI and deploy only the clean outputs/netlify-publish directory after approval.";
  }
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status,
    origin,
    required_files: requiredFiles,
    missing_files: missingFiles.map((item) => item.path),
    live_deployment: {
      path: fs.existsSync(livePath) ? relative(root, livePath) : "",
      markdown_path: fs.existsSync(path.join(outputDir, "live-deployment-check.md"))
        ? relative(root, path.join(outputDir, "live-deployment-check.md"))
        : "",
      status: live.status || "missing",
      route_count: live.route_count || 0,
      blocked_count: live.blocked_count || 0,
    },
    netlify,
    netlify_publish_check: netlifyPublishCheck,
    git,
    next_action: nextAction,
  };
  const jsonPath = path.join(outputDir, "deployment-readiness.json");
  const mdPath = path.join(outputDir, "deployment-readiness.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: report.status,
        live_status: report.live_deployment.status,
        netlify_cli_available: report.netlify.cli_available,
        dirty_count: report.git.dirty_count,
        deployment_readiness_json: relative(root, jsonPath),
        deployment_readiness_md: relative(root, mdPath),
      },
      null,
      2
    )
  );
}

run();
