#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `${args.join(" ")} failed: ${output}`);
  return output;
}

function readJson(root, filePath) {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), "utf8"));
}

function requirement(audit, id) {
  return audit.requirements.find((item) => item.id === id) || {};
}

function run() {
  const root = process.cwd();
  const runDate = "2026-06-18";
  runNode(root, ["scripts/seo-aeo/audit-system-completion.mjs", "--date", runDate, "--summary"]);
  const audit = readJson(root, `automation-runs/${runDate}/system-completion-audit.json`);
  assert(audit.audit_scope === "infrastructure_readiness", `audit scope should be infrastructure_readiness, got ${audit.audit_scope}`);
  assert(
    audit.infrastructure_readiness_status === audit.overall_status,
    "infrastructure readiness should mirror the existing overall_status enum for backward compatibility."
  );
  assert(
    ["operational", "operational_with_run_blockers"].includes(audit.overall_status),
    `system completion should be operational or operational_with_run_blockers, got ${audit.overall_status}`
  );
  assert(requirement(audit, "measurement_signal").status === "complete", "healthy-empty measurement pipeline should not be marked missing.");
  assert(requirement(audit, "publish_governance").status === "complete", "blocked publish decisions should count as governance accounting.");
  assert(audit.production_readiness?.status === "blocked", `current run production readiness should be blocked, got ${audit.production_readiness?.status}`);
  assert(
    audit.production_readiness?.blockers?.some((blocker) => blocker.code === "source_request_lock_clear"),
    "production readiness should expose active source-request lock."
  );
  assert(
    audit.production_readiness?.blockers?.some((blocker) => blocker.code === "publish_plan_selected_packets"),
    "production readiness should expose no selected publish packets."
  );
  assert(
    audit.production_readiness?.blockers?.some((blocker) => blocker.code === "live_deployment_ready"),
    "production readiness should expose blocked live deployment."
  );
  assert(
    audit.production_readiness?.authoritative_gate_artifact === `automation-runs/${runDate}/run-gates-daily.json`,
    "production readiness should point to the authoritative run-gates artifact without deriving stale gate state."
  );

  runNode(root, ["scripts/seo-aeo/enforce-run-gates.mjs", "--date", runDate, "--mode", "daily", "--no-fail"]);
  const gates = readJson(root, `automation-runs/${runDate}/run-gates-daily.json`);
  const blockerCodes = new Set((gates.blockers || []).map((item) => item.code));
  assert(!blockerCodes.has("system_completion_operational"), "healthy operational audit should not create a system_completion_operational blocker.");
  assert(!blockerCodes.has("query_handoff_ready"), "ready query handoff should not remain a gate blocker.");
  assert(!blockerCodes.has("validated_demand_ready"), "validated demand prerequisites should not remain a gate blocker after promoted reviewed rows.");
  assert(blockerCodes.has("publish_governor_selected_packets"), "publish governor should still block when no packet is selected.");
  assert(blockerCodes.has("publish_governor_not_blocked"), "publish governor should still block while publish-plan status is blocked.");
  assert(blockerCodes.has("live_deployment_ready"), "daily gates should block while live deployment is not ready.");

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixture: "system_completion_operational_with_run_blockers",
        audit_scope: audit.audit_scope,
        overall_status: audit.overall_status,
        infrastructure_readiness_status: audit.infrastructure_readiness_status,
        production_readiness: audit.production_readiness.status,
        measurement_signal_status: requirement(audit, "measurement_signal").status,
        publish_governance_status: requirement(audit, "publish_governance").status,
        gate_blockers: [...blockerCodes],
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
