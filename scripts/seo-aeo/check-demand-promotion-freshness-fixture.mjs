#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-05-06";

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

function readReport(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "automation-runs", RUN_DATE, "demand-promotion-freshness.json"), "utf8"));
}

function writeFixture(root, fixture) {
  const validationPath = path.join(root, "research", "daily-content-plan", RUN_DATE, "demand-import-pack", "validation-report.json");
  const promotionPath = path.join(root, "automation-runs", RUN_DATE, "demand-promotion-report.json");
  writeJson(validationPath, {
    generated_at: fixture.validationGeneratedAt,
    valid_for_promotion: fixture.validationValidForPromotion,
    already_promoted: fixture.validationAlreadyPromoted || 0,
    promoted: 0,
    blocked: 0,
    empty_staging: 23,
  });
  if (fixture.writePromotion !== false) {
    writeJson(promotionPath, {
      generated_at: fixture.promotionGeneratedAt,
      status: "dry_run_complete",
      validation: {
        valid_for_promotion: fixture.promotionValidForPromotion,
        already_promoted: fixture.promotionAlreadyPromoted || 0,
        promoted: 0,
        blocked: 0,
        empty_staging: 23,
        report_json: `research/daily-content-plan/${RUN_DATE}/demand-import-pack/validation-report.json`,
      },
      artifacts: {
        validation_report_json: `research/daily-content-plan/${RUN_DATE}/demand-import-pack/validation-report.json`,
      },
    });
  }
}

function runCheck(repo, root) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/check-demand-promotion-freshness.mjs"), "--date", RUN_DATE],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`freshness command failed: ${output}`);
  return readReport(root);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const fixtures = [
    {
      name: "fresh",
      validationGeneratedAt: "2099-05-06T10:00:00.000Z",
      promotionGeneratedAt: "2099-05-06T10:01:00.000Z",
      validationValidForPromotion: 0,
      promotionValidForPromotion: 0,
      expectedStatus: "fresh",
      expectedOk: true,
    },
    {
      name: "stale newer validation",
      validationGeneratedAt: "2099-05-06T10:02:00.000Z",
      promotionGeneratedAt: "2099-05-06T10:01:00.000Z",
      validationValidForPromotion: 1,
      promotionValidForPromotion: 0,
      expectedStatus: "stale_validation_newer_than_promotion",
      expectedOk: false,
    },
    {
      name: "stale count mismatch",
      validationGeneratedAt: "2099-05-06T10:00:00.000Z",
      promotionGeneratedAt: "2099-05-06T10:01:00.000Z",
      validationValidForPromotion: 1,
      promotionValidForPromotion: 0,
      expectedStatus: "stale_count_mismatch",
      expectedOk: false,
    },
    {
      name: "missing promotion with no rows",
      writePromotion: false,
      validationGeneratedAt: "2099-05-06T10:00:00.000Z",
      validationValidForPromotion: 0,
      expectedStatus: "no_promotion_report_no_rows",
      expectedOk: true,
    },
    {
      name: "missing promotion with pending row",
      writePromotion: false,
      validationGeneratedAt: "2099-05-06T10:00:00.000Z",
      validationValidForPromotion: 1,
      expectedStatus: "missing_promotion_report",
      expectedOk: false,
    },
  ];
  const results = [];

  for (const fixture of fixtures) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-demand-freshness-"));
    try {
      writeFixture(root, fixture);
      const report = runCheck(repo, root);
      assert(report.status === fixture.expectedStatus, `${fixture.name}: expected ${fixture.expectedStatus}, got ${report.status}`);
      assert(report.ok === fixture.expectedOk, `${fixture.name}: expected ok=${fixture.expectedOk}, got ${report.ok}`);
      results.push({ fixture: fixture.name, status: "passed", report_status: report.status });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
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
