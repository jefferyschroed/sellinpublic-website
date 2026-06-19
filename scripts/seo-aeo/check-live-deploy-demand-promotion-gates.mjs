#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-04-05";

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

function baseRunStatus({ liveStatus, blockedCount }) {
  return {
    run_date: RUN_DATE,
    overall_status: "ready_for_publish_approval",
    google: {
      credentials: {
        oauth_credentials: { exists: true },
        service_account_credentials: { exists: false },
      },
      ga4: {
        step_status: "completed",
        diagnostics: { zero_row_state: "verified_empty" },
      },
      search_console: {
        step_status: "completed",
        diagnostics: { zero_row_state: "verified_empty" },
      },
    },
    analytics: {
      feedback_input_state: "healthy_empty",
    },
    discovery: {
      query_handoff_status: "ready",
    },
    demand_readiness: {
      hard_gate_status: "prerequisites_present_needs_discovery_rebuild",
    },
    live_deployment: {
      status: liveStatus,
      blocked_count: blockedCount,
    },
    deploy_review: {
      status: "ready_for_deploy_approval",
      freshness_status: "fresh",
      approval_required: true,
      blockers: [],
      stale_source_files: [],
    },
    publishing: {
      selected_count: 1,
      blocked_count: 0,
      blocker_counts: {},
    },
  };
}

function writeFixture(root, fixture) {
  const runDir = path.join(root, "automation-runs", RUN_DATE);
  writeJson(path.join(runDir, "daily-report.json"), {
    run_date: RUN_DATE,
    status: "completed",
    steps: [],
  });
  writeJson(path.join(runDir, "run-status.json"), baseRunStatus(fixture));
  writeJson(path.join(runDir, "system-completion-audit.json"), {
    overall_status: "operational",
  });
  writeJson(path.join(runDir, "publish-plan.json"), {
    status: "ready",
    selected_packets: [{ slug: "fixture" }],
    blocked_packets: [],
  });
  writeJson(path.join(runDir, "subagent-artifact-check.json"), {
    status: "passed",
  });
  writeJson(path.join(runDir, "codex-automation-audit.json"), {
    status: "ready",
  });
  writeJson(path.join(root, "research", "daily-content-plan", RUN_DATE, "demand-import-pack", "validation-report.json"), {
    valid_for_promotion: fixture.validForPromotion,
    blocked: 0,
    empty_staging: 0,
  });
  writeJson(path.join(root, "research", "daily-content-plan", RUN_DATE, "demand-readiness-preflight.json"), {
    projected: {
      hard_gate_status: "prerequisites_present_needs_discovery_rebuild",
    },
  });
}

function runGates(repo, root) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/enforce-run-gates.mjs"), "--date", RUN_DATE, "--mode", "daily", "--no-fail"],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`enforce-run-gates fixture command failed: ${output}`);
  return readJson(path.join(root, "automation-runs", RUN_DATE, "run-gates-daily.json"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function codes(report) {
  return new Set((report.blockers || []).map((blocker) => blocker.code));
}

function run() {
  const repo = repoRoot();
  const fixtures = [
    {
      name: "pending_demand_live_ready",
      validForPromotion: 1,
      liveStatus: "ready",
      blockedCount: 0,
      expectedBlockers: ["demand_promotion_not_pending"],
      unexpectedBlockers: ["live_deployment_ready"],
    },
    {
      name: "pending_demand_live_blocked",
      validForPromotion: 1,
      liveStatus: "blocked",
      blockedCount: 6,
      expectedBlockers: ["demand_promotion_not_pending", "live_deployment_ready"],
      unexpectedBlockers: [],
    },
    {
      name: "promotion_cleared_live_ready",
      validForPromotion: 0,
      liveStatus: "ready",
      blockedCount: 0,
      expectedBlockers: [],
      unexpectedBlockers: ["demand_promotion_not_pending", "live_deployment_ready"],
    },
  ];
  const results = [];

  for (const fixture of fixtures) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-demand-gates-"));
    try {
      writeFixture(tempRoot, fixture);
      const report = runGates(repo, tempRoot);
      const blockerCodes = codes(report);
      for (const code of fixture.expectedBlockers) {
        assert(blockerCodes.has(code), `${fixture.name}: expected blocker ${code}. Actual: ${Array.from(blockerCodes).join(", ")}`);
      }
      for (const code of fixture.unexpectedBlockers) {
        assert(!blockerCodes.has(code), `${fixture.name}: did not expect blocker ${code}. Actual: ${Array.from(blockerCodes).join(", ")}`);
      }
      results.push({
        fixture: fixture.name,
        status: "passed",
        blockers: Array.from(blockerCodes),
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
