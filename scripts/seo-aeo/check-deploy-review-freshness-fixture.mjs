#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-02-03";
const OLD_GENERATED_AT = "2020-01-01T00:00:00.000Z";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeStaticFixture(root) {
  for (const filePath of ["styles.css", "script.js", "feed.xml", "sitemap.xml", "robots.txt"]) {
    fs.writeFileSync(path.join(root, filePath), `${filePath}\n`);
  }
  fs.writeFileSync(path.join(root, "index.html"), "index G-QCYHK55RCG\n");
  ensureDir(path.join(root, "blog"));
  ensureDir(path.join(root, "public"));
  fs.writeFileSync(path.join(root, "netlify.toml"), "[build]\n  publish = \"outputs/netlify-publish\"\n");
  ensureDir(path.join(root, "scripts/seo-aeo/lib"));
  fs.writeFileSync(path.join(root, "scripts/seo-aeo/build-netlify-publish-dir.mjs"), "fixture\n");
  fs.writeFileSync(path.join(root, "scripts/seo-aeo/lib/netlify-publish-config.mjs"), "fixture\n");
}

function writeDeploySources(root) {
  const runDir = path.join(root, "automation-runs", RUN_DATE);
  writeJson(path.join(runDir, "deployment-readiness.json"), {
    generated_at: OLD_GENERATED_AT,
    status: "waiting_for_git_or_netlify_deploy",
    next_action: "fixture baseline",
  });
  writeJson(path.join(runDir, "netlify-publish-check.json"), {
    generated_at: OLD_GENERATED_AT,
    status: "ready",
    output_dir: "outputs/netlify-publish",
    blocked_count: 0,
    route_count: 1,
    build: { ran: true, status: 0, ok: true },
    top_level: ["index.html"],
    ga4_measurement_id: "G-QCYHK55RCG",
    routes: [
      {
        url: "https://sellinpublic.co/",
        local_path: "index.html",
        size: 1,
        status: "ok",
      },
    ],
  });
  writeJson(path.join(runDir, "live-deployment-check.json"), {
    generated_at: OLD_GENERATED_AT,
    status: "blocked",
    blocked_count: 1,
    route_count: 1,
    next_action: "fixture live blocked",
  });
  writeJson(path.join(runDir, "publish-plan.json"), {
    generated_at: OLD_GENERATED_AT,
    status: "blocked",
    selected_packets: [],
    blocked_packets: [],
  });
}

function runScript(repo, root, scriptPath, args = []) {
  const result = spawnSync(process.execPath, [path.join(repo, scriptPath), ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${scriptPath} failed with ${result.status}:\n${output}`);
  }
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-deploy-freshness-"));
  try {
    writeStaticFixture(tempRoot);
    writeDeploySources(tempRoot);

    runScript(repo, tempRoot, "scripts/seo-aeo/write-deploy-review-packet.mjs", ["--date", RUN_DATE]);

    const readinessPath = path.join(tempRoot, "automation-runs", RUN_DATE, "deployment-readiness.json");
    writeJson(readinessPath, {
      generated_at: OLD_GENERATED_AT,
      status: "waiting_for_git_or_netlify_deploy",
      next_action: "fixture mutated without newer timestamp",
      changed_after_review: true,
    });

    runScript(repo, tempRoot, "scripts/seo-aeo/write-run-status.mjs", ["--date", RUN_DATE, "--metrics-date", "2099-01-31"]);
    runScript(repo, tempRoot, "scripts/seo-aeo/enforce-run-gates.mjs", ["--date", RUN_DATE, "--mode", "daily", "--no-fail"]);

    const runStatus = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "run-status.json"), "utf8"));
    const gates = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs", RUN_DATE, "run-gates-daily.json"), "utf8"));
    const stalePath = `automation-runs/${RUN_DATE}/deployment-readiness.json`;
    const freshnessEntry = runStatus.deploy_review.source_freshness.find((entry) => entry.path === stalePath);
    const regenerateAction = (runStatus.next_actions || []).find((action) => action.action === "regenerate_deploy_review_packet");
    const deployFreshCheck = (gates.checks || []).find((check) => check.code === "deploy_review_fresh");
    const deployFreshBlocker = (gates.blockers || []).find((blocker) => blocker.code === "deploy_review_fresh");

    assert(runStatus.deploy_review.status === "ready_for_deploy_approval", "deploy review should remain ready but stale.");
    assert(runStatus.deploy_review.freshness_status === "stale", `expected stale freshness, got ${runStatus.deploy_review.freshness_status}`);
    assert(
      JSON.stringify(runStatus.deploy_review.stale_source_files) === JSON.stringify([stalePath]),
      `expected exactly ${stalePath} stale, got ${JSON.stringify(runStatus.deploy_review.stale_source_files)}`
    );
    assert(freshnessEntry?.hash_changed_since_review === true, "expected hash_changed_since_review=true.");
    assert(freshnessEntry?.newer_than_report === false, "expected stale detection to work without newer generated_at.");
    assert(Boolean(regenerateAction), "expected regenerate_deploy_review_packet action.");
    assert(deployFreshCheck?.ok === false && deployFreshCheck?.severity === "blocker", "expected deploy_review_fresh blocker check.");
    assert(Boolean(deployFreshBlocker), "expected deploy_review_fresh in blocker list.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "deploy-review-freshness",
          freshness_status: runStatus.deploy_review.freshness_status,
          stale_source_files: runStatus.deploy_review.stale_source_files,
          first_action: runStatus.next_actions[0]?.action || "",
          deploy_review_fresh_ok: deployFreshCheck.ok,
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
