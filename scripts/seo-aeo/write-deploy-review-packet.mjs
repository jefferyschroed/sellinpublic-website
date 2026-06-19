#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { artifactSnapshot } from "./lib/artifact-identity.mjs";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";

const STATIC_SITE_PATHS = [
  "index.html",
  "styles.css",
  "script.js",
  "blog",
  "public",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
];

const NETLIFY_BUILD_SUPPORT_PATHS = [
  "netlify.toml",
  "scripts/seo-aeo/build-netlify-publish-dir.mjs",
  "scripts/seo-aeo/lib/netlify-publish-config.mjs",
];

const PROCESS_REVIEW_PREFIXES = [
  ".codex/",
  ".env.example",
  ".gitignore",
  "README.md",
  "config/",
  "content-packets/",
  "docs/seo-aeo/",
  "scripts/",
  "scripts/blog",
  "scripts/seo-aeo",
];

const LOCAL_ONLY_PREFIXES = [
  ".DS_Store",
  ".env",
  ".netlify/",
  "analytics/",
  "automation-runs/",
  "config/seo-aeo.config.json",
  "imports/",
  "outputs/",
  "research/",
  "secrets/",
  "worker-notes/",
];

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

function parseJsonOutput(output) {
  try {
    return JSON.parse(output || "{}");
  } catch {
    return null;
  }
}

function dailyStepParsed(root, runDate, name) {
  const report = readJson(path.join(root, "automation-runs", runDate, "daily-report.json"), {});
  const step = (report.steps || []).find((item) => item.name === name) || {};
  return {
    step_status: step.status || "missing",
    parsed: parseJsonOutput(step.output),
  };
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || "",
  };
}

function gitValue(args) {
  const result = runGit(args);
  return result.ok ? result.stdout.trim() : "";
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return "";
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function gitStatusRows() {
  const result = runGit(["status", "--short", "--ignored"]);
  if (!result.ok && !result.stdout) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const filePath = normalizePath(line.slice(3).trim());
      return { status, path: filePath };
    });
}

function matchesPath(filePath, target) {
  const left = String(filePath || "").replace(/\/+$/, "");
  const right = String(target || "").replace(/\/+$/, "");
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/")) return filePath.startsWith(pattern);
    return filePath === pattern || filePath.startsWith(`${pattern}/`);
  });
}

function pathState(root, relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return { path: relativePath, exists: false, type: "missing", size: 0 };
  const stat = fs.statSync(absolute);
  return {
    path: relativePath,
    exists: true,
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    size: stat.isFile() ? stat.size : 0,
  };
}

function expandChangedUnder(statusRows, target) {
  return statusRows.filter((row) => matchesPath(row.path, target)).map((row) => row.path);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function privacyCookieCopyStatus(root) {
  const checklistPath = path.join(root, "docs", "seo-aeo", "setup-checklist.md");
  if (!fs.existsSync(checklistPath)) return "missing";
  const source = fs.readFileSync(checklistPath, "utf8");
  const match = source.match(/- \[([ xX])\] Approve any privacy\/cookie copy changes required by the business\./);
  if (!match) return "missing";
  return match[1].toLowerCase() === "x" ? "approved" : "not_approved";
}

function routeContentHashes(root, routes = []) {
  return uniqueRoutes(routes).map((route) => ({
    url: route.url,
    local_path: route.local_path,
    sha256: route.local_path ? sha256File(path.join(root, route.local_path)) : "",
  }));
}

function uniqueRoutes(routes = []) {
  const seen = new Set();
  const unique = [];
  for (const route of routes) {
    const key = `${route.url || ""}|${route.local_path || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
  }
  return unique;
}

function matchingTargets(filePath, targets) {
  return targets.filter((target) => matchesPath(filePath, target));
}

function classifyStatusRows(statusRows) {
  const deployStatic = [];
  const netlifyBuildSupport = [];
  const processReview = [];
  const localOnly = [];
  const ignored = [];
  const uncategorized = [];

  for (const row of statusRows) {
    if (row.status === "!!") ignored.push(row.path);
    if (matchesAny(row.path, LOCAL_ONLY_PREFIXES) || row.status === "!!") {
      localOnly.push(row.path);
      continue;
    }
    if (STATIC_SITE_PATHS.some((target) => matchesPath(row.path, target))) {
      deployStatic.push(row.path);
      continue;
    }
    const matchedBuildSupport = matchingTargets(row.path, NETLIFY_BUILD_SUPPORT_PATHS);
    if (matchedBuildSupport.length) {
      netlifyBuildSupport.push(...matchedBuildSupport);
      if (!matchedBuildSupport.includes(row.path) && matchesAny(row.path, PROCESS_REVIEW_PREFIXES)) {
        processReview.push(row.path);
      }
      continue;
    }
    if (matchesAny(row.path, PROCESS_REVIEW_PREFIXES)) {
      processReview.push(row.path);
      continue;
    }
    uncategorized.push(row.path);
  }

  return {
    deploy_static_changed_paths: uniqueSorted(deployStatic),
    netlify_build_support_changed_paths: uniqueSorted(netlifyBuildSupport),
    process_review_changed_paths: uniqueSorted(processReview),
    local_only_or_ignored_paths: uniqueSorted(localOnly),
    ignored_paths: uniqueSorted(ignored),
    uncategorized_changed_paths: uniqueSorted(uncategorized),
  };
}

function writeMarkdown(filePath, report) {
  const list = (items) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- None.");
  const deployFiles = report.deploy_static_required
    .map((item) => `- ${item.exists ? "ready" : "missing"}: ${item.path}${item.type === "file" ? ` (${item.size} bytes)` : ""}`)
    .join("\n");
  const buildFiles = report.netlify_build_support_required
    .map((item) => `- ${item.exists ? "ready" : "missing"}: ${item.path}${item.type === "file" ? ` (${item.size} bytes)` : ""}`)
    .join("\n");
  const markdown = `# Deploy Review Packet

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}
Approval required: ${report.approval_required}
Approval decision: ${report.approval_decision}
Approval scope: ${report.approval_scope}
Deploy path: ${report.deploy_path}

## Summary

- Clean publish check: ${report.netlify_publish_check.status}; blocked routes ${report.netlify_publish_check.blocked_count}; report ${report.netlify_publish_check.markdown_path || report.netlify_publish_check.path || "missing"}
- Live deployment: ${report.live_deployment.status}; blocked routes ${report.live_deployment.blocked_count}; report ${report.live_deployment.markdown_path || report.live_deployment.path || "missing"}
- Deployment readiness: ${report.deployment_readiness.status}; report ${report.deployment_readiness.markdown_path || report.deployment_readiness.path || "missing"}
- Builder step: ${report.builder_summary.step_status}; build ran ${report.builder_summary.build_ran}; output ${report.builder_summary.output_dir || "n/a"}
- Output manifest hash: ${report.clean_netlify_deploy.output_manifest_hash || "n/a"}
- Branch: ${report.git_connected_deploy.branch || "n/a"}; HEAD ${report.git_connected_deploy.head_sha || "n/a"}
- Privacy/cookie copy: ${report.scope_legal.privacy_cookie_copy_status}
- Uncategorized changed paths: ${report.uncategorized_changed_paths.length}

## Approval Fields

- Approval owner: ${report.approval_owner || "pending"}
- Approval timestamp: ${report.approval_timestamp || "pending"}
- Commit to push: ${report.git_connected_deploy.commit_to_push || "pending"}
- Netlify production branch: ${report.git_connected_deploy.netlify_production_branch || report.netlify_target.production_branch || "unknown"}
- Netlify site ID/name/team: ${report.netlify_target.site_id || "unknown"} / ${report.netlify_target.site_name || "unknown"} / ${report.netlify_target.team || "unknown"}
- Last prod deploy ID: ${report.netlify_target.last_prod_deploy_id || "unknown"}
- Post-deploy check required: ${report.rollout.post_deploy_check_required}
- Rollback SHA: ${report.rollout.rollback_sha || "unknown"}

## Static Site Paths Required For Deploy Output

${deployFiles}

## Netlify Build Support Required

${buildFiles}

## Changed Paths To Review For Static Deploy

${list(report.deploy_static_changed_paths)}

## Changed Netlify Build Support Paths

${list(report.netlify_build_support_changed_paths)}

## Changed SEO/AEO Process Paths

${list(report.process_review_changed_paths)}

## Local-Only Or Ignored Paths

${list(report.local_only_or_ignored_paths.slice(0, 80))}

## Uncategorized Changed Paths

${list(report.uncategorized_changed_paths)}

## Approval Checklist

- Review static site and Netlify build support paths before Git-connected deploy.
- Do not deploy, stage, commit, or upload local-only paths listed above.
- Do not treat this packet as publish approval for new blog generation.
- Content generation included: ${report.scope_legal.content_generation_included}
- Publish governor status: ${report.scope_legal.publish_governor_status || "missing"}
- After an approved deploy, run \`node scripts/seo-aeo/check-live-deployment.mjs --date ${report.run_date}\`.
- Builder rule: ${report.builder_summary.rule}

## Next Action

${report.next_action}
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const runDir = ensureDir(path.join(root, "automation-runs", runDate));
  const deploymentPath = path.join(runDir, "deployment-readiness.json");
  const publishCheckPath = path.join(runDir, "netlify-publish-check.json");
  const livePath = path.join(runDir, "live-deployment-check.json");
  const publishPlanPath = path.join(runDir, "publish-plan.json");
  const deployment = readJson(deploymentPath, {});
  const publishCheck = readJson(publishCheckPath, {});
  const live = readJson(livePath, {});
  const publishPlan = readJson(publishPlanPath, {});
  const publishRoutes = uniqueRoutes(publishCheck.routes || []);
  const buildSummary = dailyStepParsed(root, runDate, "Build clean Netlify publish directory");
  const statusRows = gitStatusRows();
  const classified = classifyStatusRows(statusRows);
  const branch = gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
  const headSha = gitValue(["rev-parse", "HEAD"]);
  const baseSha = gitValue(["rev-parse", "origin/main"]);
  const approvedChangedPaths = uniqueSorted([
    ...classified.deploy_static_changed_paths,
    ...classified.netlify_build_support_changed_paths,
  ]);
  const missingRequired = [
    ...STATIC_SITE_PATHS.map((item) => pathState(root, item)),
    ...NETLIFY_BUILD_SUPPORT_PATHS.map((item) => pathState(root, item)),
  ].filter((item) => !item.exists);
  const blockers = [];
  if (missingRequired.length) blockers.push("missing_required_deploy_files");
  if (publishCheck.status !== "ready") blockers.push("clean_publish_check_not_ready");
  if (classified.uncategorized_changed_paths.length) blockers.push("uncategorized_changed_paths_need_review");

  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: blockers.length ? "needs_review" : "ready_for_deploy_approval",
    approval_required: true,
    approval_decision: "pending",
    approval_owner: "",
    approval_timestamp: "",
    approval_scope: "static_site_and_netlify_build_support_only",
    deploy_path: "git_connected_or_clean_netlify_after_explicit_approval",
    blockers,
    source_files: {
      deployment_readiness: fs.existsSync(deploymentPath) ? relative(root, deploymentPath) : "",
      netlify_publish_check: fs.existsSync(publishCheckPath) ? relative(root, publishCheckPath) : "",
      live_deployment_check: fs.existsSync(livePath) ? relative(root, livePath) : "",
      publish_plan: fs.existsSync(publishPlanPath) ? relative(root, publishPlanPath) : "",
    },
    source_snapshot: {
      deployment_readiness: artifactSnapshot(root, relative(root, deploymentPath)),
      netlify_publish_check: artifactSnapshot(root, relative(root, publishCheckPath)),
      live_deployment_check: artifactSnapshot(root, relative(root, livePath)),
      publish_plan: artifactSnapshot(root, relative(root, publishPlanPath)),
    },
    deployment_readiness: {
      path: fs.existsSync(deploymentPath) ? relative(root, deploymentPath) : "",
      markdown_path: fs.existsSync(path.join(runDir, "deployment-readiness.md")) ? relative(root, path.join(runDir, "deployment-readiness.md")) : "",
      status: deployment.status || "missing",
      next_action: deployment.next_action || "",
    },
    git_connected_deploy: {
      branch,
      head_sha: headSha,
      base_sha: baseSha,
      commit_to_push: "",
      requires_commit: true,
      approved_changed_paths: approvedChangedPaths,
      excluded_local_only_paths: classified.local_only_or_ignored_paths,
      netlify_production_branch: "",
    },
    netlify_publish_check: {
      path: fs.existsSync(publishCheckPath) ? relative(root, publishCheckPath) : "",
      markdown_path: fs.existsSync(path.join(runDir, "netlify-publish-check.md")) ? relative(root, path.join(runDir, "netlify-publish-check.md")) : "",
      status: publishCheck.status || "missing",
      blocked_count: publishCheck.blocked_count ?? 0,
      route_count: publishCheck.route_count ?? 0,
      output_dir: publishCheck.output_dir || "outputs/netlify-publish",
    },
    builder_summary: {
      step_status: publishCheck.build?.ran ? "completed_via_publish_check" : buildSummary.step_status,
      build_ran: publishCheck.build?.ran ?? false,
      build_completed_at: publishCheck.generated_at || "",
      build_command: "node scripts/seo-aeo/build-netlify-publish-dir.mjs",
      build_exit_code: publishCheck.build?.status ?? null,
      source_sha: headSha,
      output_dir: buildSummary.parsed?.output_dir || publishCheck.output_dir || "",
      copied: buildSummary.parsed?.copied || [],
      top_level: buildSummary.parsed?.top_level || publishCheck.top_level || [],
      manual_netlify_command_if_approved: buildSummary.parsed?.manual_netlify_command_if_approved || "",
      rule: buildSummary.parsed?.rule || "This packet does not deploy, commit, push, approve, or publish.",
    },
    clean_netlify_deploy: {
      build_ran: publishCheck.build?.ran ?? false,
      build_completed_at: publishCheck.generated_at || "",
      build_command: "node scripts/seo-aeo/build-netlify-publish-dir.mjs",
      build_exit_code: publishCheck.build?.status ?? null,
      source_sha: headSha,
      output_manifest_hash: stableHash({
        top_level: publishCheck.top_level || [],
        routes: publishRoutes.map((route) => ({
          url: route.url,
          local_path: route.local_path,
          size: route.size,
          status: route.status,
        })),
      }),
      route_content_hashes: routeContentHashes(root, publishRoutes),
      manual_netlify_command_if_approved:
        buildSummary.parsed?.manual_netlify_command_if_approved ||
        "npx --yes netlify-cli deploy --prod --dir outputs/netlify-publish",
    },
    netlify_target: {
      site_id: "",
      site_name: "",
      team: "",
      connected_repo: "https://github.com/jefferyschroed/sellinpublic-website",
      production_branch: "",
      cli_auth_identity: "",
      last_prod_deploy_id: "",
    },
    rollout: {
      pre_deploy_blocked_routes: live.blocked_count ?? 0,
      post_deploy_check_required: true,
      post_deploy_check_result: "",
      deploy_id: "",
      deploy_url: "",
      rollback_deploy_id: "",
      rollback_sha: baseSha,
    },
    scope_legal: {
      content_generation_included: false,
      publish_governor_status: publishPlan.status || "",
      selected_packets: publishPlan.selected_packets || [],
      changed_live_urls: uniqueSorted(publishRoutes.map((route) => route.url)),
      ga4_measurement_id: publishCheck.ga4_measurement_id || "",
      privacy_cookie_copy_status: privacyCookieCopyStatus(root),
    },
    live_deployment: {
      path: fs.existsSync(livePath) ? relative(root, livePath) : "",
      markdown_path: fs.existsSync(path.join(runDir, "live-deployment-check.md")) ? relative(root, path.join(runDir, "live-deployment-check.md")) : "",
      status: live.status || "missing",
      blocked_count: live.blocked_count ?? 0,
      route_count: live.route_count ?? 0,
    },
    deploy_static_required: STATIC_SITE_PATHS.map((item) => pathState(root, item)),
    netlify_build_support_required: NETLIFY_BUILD_SUPPORT_PATHS.map((item) => pathState(root, item)),
    ...classified,
    next_action: blockers.length
      ? "Resolve uncategorized or missing deploy paths before asking for deploy approval."
      : "Review this packet, approve the deploy slice explicitly, then use the Git-connected deploy path or clean Netlify publish directory. Rerun live checks after deploy.",
  };

  const jsonPath = path.join(runDir, "deploy-review-packet.json");
  const mdPath = path.join(runDir, "deploy-review-packet.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: report.status,
        blockers: report.blockers,
        deploy_review_packet_json: relative(root, jsonPath),
        deploy_review_packet_md: relative(root, mdPath),
      },
      null,
      2
    )
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
