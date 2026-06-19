#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";

const FIXTURES = [
  {
    date: "2099-01-02",
    name: "header-only refusal",
    row: "",
    expectExit: 1,
    expectStatus: "blocked_validation",
    args: ["--dry-run"],
  },
  {
    date: "2099-01-03",
    name: "single reviewed row apply without scaffold",
    row:
      "Ahrefs,what is employee-generated content,yes,Ahrefs Keywords Explorer reviewed export,Sell In Public QA\n",
    expectExit: 0,
    expectStatusPrefix: "applied_discovery_rebuilt",
    args: ["--apply", "--approval-marker", "DEMAND-PROMOTION-APPROVED:2099-01-03"],
  },
];

const CLI_GUARD_CASES = [
  {
    date: "2099-01-04",
    name: "explicit scaffold limit requires apply",
    args: ["--date", "2099-01-04", "--dry-run", "--scaffold-limit", "0"],
    expectExit: 1,
    expectOutput: "--scaffold-limit requires --apply",
  },
  {
    date: "2099-01-05",
    name: "scaffold requires prior plain promotion proof",
    args: ["--date", "2099-01-05", "--apply", "--scaffold-limit", "1"],
    expectExit: 1,
    expectOutput: "Run plain `node scripts/seo-aeo/run-demand-promotion.mjs --date 2099-01-05 --apply` first",
    expectReportStatus: "blocked_scaffold_requires_plain_apply",
  },
  {
    date: "2099-01-06",
    name: "plain apply requires approval marker",
    args: ["--date", "2099-01-06", "--apply"],
    expectExit: 1,
    expectOutput: "Plain apply requires `--approval-marker DEMAND-PROMOTION-APPROVED:2099-01-06`",
    expectReportStatus: "blocked_missing_apply_approval",
  },
];

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function fixturePaths(root, date) {
  const packDir = path.join(root, "research", "daily-content-plan", date, "demand-import-pack");
  const stagingPath = path.join(packDir, `${date}-reviewed-query-tool-fixture.draft.csv`);
  const destinationPath = path.join(root, "imports", "query-exports", `${date}-reviewed-query-tool-fixture.csv`);
  return {
    packDir,
    stagingPath,
    destinationPath,
    planDir: path.join(root, "research", "daily-content-plan", date),
    trendDir: path.join(root, "research", "trend-intelligence", `${date}-daily-discovery`),
    queryDir: path.join(root, "research", "query-intelligence", `${date}-daily-discovery`),
    runDir: path.join(root, "automation-runs", date),
  };
}

function cleanup(root, date) {
  const paths = fixturePaths(root, date);
  for (const target of [paths.planDir, paths.trendDir, paths.queryDir, paths.runDir, paths.destinationPath]) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function writeFixture(root, fixture) {
  const paths = fixturePaths(root, fixture.date);
  ensureDir(paths.packDir);
  ensureDir(path.dirname(paths.destinationPath));
  const stagingRelative = normalizePath(path.relative(root, paths.stagingPath));
  const destinationRelative = normalizePath(path.relative(root, paths.destinationPath));
  const headers = "source,query,validated_demand,validation_source,reviewed_by\n";
  fs.writeFileSync(paths.stagingPath, `${headers}${fixture.row}`);
  fs.writeFileSync(
    path.join(paths.packDir, "manifest.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        run_date: fixture.date,
        generated_at: new Date().toISOString(),
        review_rows: [
          {
            date: fixture.date,
            candidate_id: "fixture-query-001",
            import_rank: "1",
            primary_recommended_import: "yes",
            priority_reason: "fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            staging_csv_path: stagingRelative,
            final_destination_path: destinationRelative,
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return paths;
}

function runRunner(root, fixture) {
  return spawnSync(
    process.execPath,
    ["scripts/seo-aeo/run-demand-promotion.mjs", "--date", fixture.date, ...fixture.args],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    }
  );
}

function readReport(root, date) {
  const reportPath = path.join(root, "automation-runs", date, "demand-promotion-report.json");
  if (!fs.existsSync(reportPath)) return null;
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const root = process.cwd();
  const results = [];

  for (const guard of CLI_GUARD_CASES) {
    cleanup(root, guard.date);
    const result = spawnSync(process.execPath, ["scripts/seo-aeo/run-demand-promotion.mjs", ...guard.args], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    const report = readReport(root, guard.date);
    assert(result.status === guard.expectExit, `${guard.name}: expected exit ${guard.expectExit}, got ${result.status}. Output: ${output}`);
    assert(output.includes(guard.expectOutput), `${guard.name}: expected output to include ${guard.expectOutput}. Output: ${output}`);
    if (guard.expectReportStatus) {
      assert(report?.status === guard.expectReportStatus, `${guard.name}: expected report status ${guard.expectReportStatus}, got ${report?.status}.`);
    }
    cleanup(root, guard.date);
    results.push({ fixture: guard.name, status: "passed", report_status: guard.expectReportStatus || "cli_guard" });
  }

  for (const fixture of FIXTURES) {
    cleanup(root, fixture.date);
    const paths = writeFixture(root, fixture);
    const result = runRunner(root, fixture);
    const report = readReport(root, fixture.date);
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();

    try {
      assert(result.status === fixture.expectExit, `${fixture.name}: expected exit ${fixture.expectExit}, got ${result.status}. Output: ${output}`);
      assert(report, `${fixture.name}: expected demand-promotion-report.json to be written.`);
      if (fixture.expectStatus) assert(report.status === fixture.expectStatus, `${fixture.name}: expected status ${fixture.expectStatus}, got ${report.status}.`);
      if (fixture.expectStatusPrefix) {
        assert(String(report.status || "").startsWith(fixture.expectStatusPrefix), `${fixture.name}: expected status prefix ${fixture.expectStatusPrefix}, got ${report.status}.`);
      }
      if (fixture.expectExit !== 0) {
        assert(!fs.existsSync(paths.destinationPath), `${fixture.name}: destination import should not be created after a blocked run.`);
      } else {
        assert(fs.existsSync(paths.destinationPath), `${fixture.name}: destination import should be promoted.`);
        assert(!report.steps.some((step) => /scaffold-packets/.test(step.command)), `${fixture.name}: runner should not scaffold without --scaffold-limit.`);
      }
      results.push({ fixture: fixture.name, status: "passed", report_status: report.status });
    } finally {
      cleanup(root, fixture.date);
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
