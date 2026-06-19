#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-03-04";
const APPROVAL_MARKER = `DEMAND-PROMOTION-APPROVED:${RUN_DATE}`;
const DEFER_MARKER = `LIVE-DEPLOY-BLOCKER-DEFERRED:${RUN_DATE}`;

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runPromotion(repo, root, extraArgs) {
  return spawnSync(
    process.execPath,
    [
      path.join(repo, "scripts/seo-aeo/run-demand-promotion.mjs"),
      "--date",
      RUN_DATE,
      "--apply",
      "--approval-marker",
      APPROVAL_MARKER,
      ...extraArgs,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    }
  );
}

function reportPath(root) {
  return path.join(root, "automation-runs", RUN_DATE, "demand-promotion-report.json");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeBlockedLiveDeployment(root) {
  writeJson(path.join(root, "automation-runs", RUN_DATE, "run-status.json"), {
    run_date: RUN_DATE,
    overall_status: "needs_live_deployment",
    live_deployment: {
      status: "blocked",
      blocked_count: 6,
    },
  });
  writeJson(path.join(root, "automation-runs", RUN_DATE, "live-deployment-check.json"), {
    generated_at: "2099-03-04T00:00:00.000Z",
    status: "blocked",
    blocked_count: 6,
    route_count: 6,
  });
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-demand-live-guard-"));
  try {
    writeBlockedLiveDeployment(tempRoot);

    const blocked = runPromotion(repo, tempRoot, []);
    const blockedOutput = `${blocked.stdout || ""}${blocked.stderr || ""}`.trim();
    const blockedReport = readJson(reportPath(tempRoot));
    assert(blocked.status === 1, `expected live-deploy blocked apply to exit 1, got ${blocked.status}. Output: ${blockedOutput}`);
    assert(
      blockedReport.status === "blocked_live_deployment_not_ready",
      `expected blocked_live_deployment_not_ready, got ${blockedReport.status}`
    );
    assert(blockedReport.live_deployment_guard?.blocked === true, "expected report live_deployment_guard.blocked=true.");
    assert(
      blockedOutput.includes(`--live-deploy-defer-marker ${DEFER_MARKER}`),
      "expected output to include the explicit defer marker."
    );

    const deferred = runPromotion(repo, tempRoot, ["--live-deploy-defer-marker", DEFER_MARKER]);
    const deferredOutput = `${deferred.stdout || ""}${deferred.stderr || ""}`.trim();
    const deferredReport = readJson(reportPath(tempRoot));
    assert(
      deferredReport.status !== "blocked_live_deployment_not_ready",
      `defer marker should pass live-deploy guard before later validation. Output: ${deferredOutput}`
    );
    assert(deferredReport.live_deployment_guard?.blocked === true, "deferred report should still disclose blocked live deployment.");
    assert(deferredReport.live_deploy_defer_marker_provided === "yes", "deferred report should record defer marker presence.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand-promotion-live-deploy-guard",
          blocked_status: blockedReport.status,
          deferred_status: deferredReport.status,
          expected_defer_marker: DEFER_MARKER,
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
