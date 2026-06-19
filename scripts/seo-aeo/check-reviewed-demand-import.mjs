#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readCsv } from "./lib/csv.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runNode(root, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === expectedStatus, `${args.join(" ")} exited ${result.status}, expected ${expectedStatus}: ${output}`);
  return output;
}

function cleanup(root, runDate) {
  fs.rmSync(path.join(root, "research", "daily-content-plan", runDate), { recursive: true, force: true });
  fs.rmSync(path.join(root, "imports", "query-exports", `${runDate}-raw-reviewed-fixture.csv`), { force: true });
  fs.rmSync(path.join(root, "imports", "query-exports", `${runDate}-raw-gsc-fixture.csv`), { force: true });
  fs.rmSync(path.join(root, "imports", "query-exports", `${runDate}-reviewed-query-tool-fixture.csv`), { force: true });
  fs.rmSync(path.join(root, "imports", "query-exports", `${runDate}-gsc-search-query-fixture.csv`), { force: true });
}

function writeFixture(root, runDate) {
  const packDir = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack");
  const sourcePath = path.join(root, "imports", "query-exports", `${runDate}-raw-reviewed-fixture.csv`);
  const gscSourcePath = path.join(root, "imports", "query-exports", `${runDate}-raw-gsc-fixture.csv`);
  const stagingPath = path.join(packDir, `${runDate}-reviewed-query-tool-fixture.draft.csv`);
  const gscStagingPath = path.join(packDir, `${runDate}-gsc-search-query-fixture.draft.csv`);
  const finalPath = path.join(root, "imports", "query-exports", `${runDate}-reviewed-query-tool-fixture.csv`);
  const gscFinalPath = path.join(root, "imports", "query-exports", `${runDate}-gsc-search-query-fixture.csv`);
  ensureDir(packDir);
  ensureDir(path.dirname(sourcePath));
  fs.writeFileSync(sourcePath, "Keyword,Volume,KD,Country\nemployee generated content examples,120,18,US\n");
  fs.writeFileSync(
    gscSourcePath,
    "Date,Query,Page,Device,Country,Clicks,Impressions,CTR,Position\n" +
      `${runDate},employee advocacy metrics,/blog/employee-advocacy-metrics,DESKTOP,US,7,420,1.67%,8.2\n`
  );
  fs.writeFileSync(
    stagingPath,
    "date,source,query,country,language,volume,difficulty,impressions,clicks,trend_delta,trend_window,validated_demand,validation_source,reviewed_by,notes\n"
  );
  fs.writeFileSync(
    gscStagingPath,
    "date,source,source_export_id,source_file,property_id,timezone,captured_by,reviewed_by,query,page_url,slug,device,country,clicks,impressions,ctr,avg_position,search_intent,serp_features,content_action,notes\n"
  );
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        run_date: runDate,
        review_rows: [
          {
            date: runDate,
            candidate_id: "query-fixture",
            priority: "P0",
            import_rank: 1,
            primary_recommended_import: "yes",
            priority_reason: "fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            query_or_topic_to_validate: "What are good examples of employee-generated content in B2B?",
            template_path: "docs/seo-aeo/templates/imports/generic-query-tool-export.csv",
            staging_csv_path: path.relative(root, stagingPath).split(path.sep).join("/"),
            final_destination_path: path.relative(root, finalPath).split(path.sep).join("/"),
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
          {
            date: runDate,
            candidate_id: "gsc-fixture",
            priority: "P0",
            import_rank: 1,
            primary_recommended_import: "yes",
            priority_reason: "fixture",
            recommended_import_type: "gsc_search_query_export",
            query_or_topic_to_validate: "employee advocacy metrics",
            template_path: "docs/seo-aeo/templates/imports/search-query-export.csv",
            staging_csv_path: path.relative(root, gscStagingPath).split(path.sep).join("/"),
            final_destination_path: path.relative(root, gscFinalPath).split(path.sep).join("/"),
            required_review_fields: "date,source,property_id,reviewed_by,query,page_url,device,country,clicks,impressions,ctr,avg_position",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return { sourcePath, gscSourcePath, stagingPath, gscStagingPath };
}

function run() {
  const root = process.cwd();
  const runDate = "2099-01-08";
  cleanup(root, runDate);
  try {
    const { sourcePath, gscSourcePath, stagingPath, gscStagingPath } = writeFixture(root, runDate);
    const commonArgs = [
      "scripts/seo-aeo/import-reviewed-demand-export.mjs",
      "--date",
      runDate,
      "--candidate",
      "query-fixture",
      "--type",
      "reviewed_generic_query_tool_export",
      "--source-file",
      path.relative(root, sourcePath),
      "--source-name",
      "Ahrefs",
      "--validation-source",
      "Ahrefs reviewed keyword export fixture",
      "--reviewed-by",
      "qa-reviewer",
    ];
    const gscArgs = [
      "scripts/seo-aeo/import-reviewed-demand-export.mjs",
      "--date",
      runDate,
      "--candidate",
      "gsc-fixture",
      "--type",
      "gsc_search_query_export",
      "--source-file",
      path.relative(root, gscSourcePath),
      "--property-id",
      "sc-domain:sellinpublic.co",
      "--reviewed-by",
      "qa-reviewer",
    ];

    const dryRunOutput = runNode(root, [...commonArgs, "--dry-run"]);
    const dryRunJson = JSON.parse(dryRunOutput);
    assert(readCsv(stagingPath).rows.length === 0, "dry-run should not write staging rows.");
    assert(dryRunJson.next_command.includes("stage-reviewed-demand-export.mjs"), "dry-run next command should stay on staging.");
    assert(dryRunJson.next_command.includes("--apply"), "dry-run next command should apply staging rows.");
    assert(dryRunJson.next_command.includes("--source-name Ahrefs"), "dry-run next command should preserve reviewed generic source flags.");
    assert(
      dryRunJson.next_command.includes("--validation-source 'Ahrefs reviewed keyword export fixture'"),
      "dry-run next command should preserve validation source flags."
    );

    const applyOutput = runNode(root, [...commonArgs, "--apply"]);
    const applyJson = JSON.parse(applyOutput);
    const staged = readCsv(stagingPath).rows;
    assert(staged.length === 1, `apply should write one staging row, got ${staged.length}`);
    assert(staged[0].validated_demand === "yes", "staged row should be marked validated_demand=yes.");
    assert(staged[0].reviewed_by === "qa-reviewer", "staged row should include reviewer.");
    assert(
      applyJson.next_command === `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
      "apply next command should dry-run promotion."
    );

    runNode(root, [...gscArgs, "--dry-run"]);
    assert(readCsv(gscStagingPath).rows.length === 0, "GSC dry-run should not write staging rows.");

    runNode(root, [...gscArgs, "--apply"]);
    const gscStaged = readCsv(gscStagingPath).rows;
    assert(gscStaged.length === 1, `GSC apply should write one staging row, got ${gscStaged.length}`);
    assert(gscStaged[0].source === "google_search_console", "GSC staged row should use google_search_console source.");
    assert(gscStaged[0].property_id === "sc-domain:sellinpublic.co", "GSC staged row should include Search Console property.");
    assert(gscStaged[0].reviewed_by === "qa-reviewer", "GSC staged row should include reviewer.");
    assert(!("validation_source" in gscStaged[0]), "GSC staged row should not require validation_source.");
    assert(gscStaged[0].query === "employee advocacy metrics", "GSC staged row should preserve query.");
    assert(gscStaged[0].page_url === "/blog/employee-advocacy-metrics", "GSC staged row should preserve page URL.");
    assert(gscStaged[0].device === "DESKTOP", "GSC staged row should preserve device.");
    assert(gscStaged[0].country === "US", "GSC staged row should preserve country.");
    assert(gscStaged[0].clicks === "7", "GSC staged row should preserve clicks.");
    assert(gscStaged[0].impressions === "420", "GSC staged row should preserve impressions.");
    assert(gscStaged[0].ctr === "0.0167", `GSC staged row should normalize CTR as a decimal, got ${gscStaged[0].ctr}.`);
    assert(gscStaged[0].avg_position === "8.2", "GSC staged row should preserve average position.");

    const validationOutput = runNode(root, ["scripts/seo-aeo/validate-demand-import-pack.mjs", "--date", runDate]);
    const validation = JSON.parse(validationOutput);
    const validationReport = JSON.parse(
      fs.readFileSync(path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json"), "utf8")
    );
    assert(
      validation.valid_for_promotion === 2,
      `expected two valid files for promotion, got ${validation.valid_for_promotion}: ${JSON.stringify(validationReport.rows)}`
    );
    assert(validation.blocked === 0, `expected no blocked files, got ${validation.blocked}`);

    fs.writeFileSync(
      stagingPath,
      "date,source,query,country,language,volume,difficulty,impressions,clicks,trend_delta,trend_window,validated_demand,validation_source,reviewed_by,notes\n" +
        `${runDate},AnswerThePublic,employee generated content examples,US,en,,,,,,,yes,AnswerThePublic,qa-reviewer,Self-validated discovery-only row\n`
    );
    const blockedOutput = runNode(root, ["scripts/seo-aeo/validate-demand-import-pack.mjs", "--date", runDate]);
    const blocked = JSON.parse(blockedOutput);
    assert(blocked.blocked === 1, "discovery-only self-validation should be blocked.");

    const missingReviewerArgs = commonArgs.filter((item, index) => item !== "--reviewed-by" && commonArgs[index - 1] !== "--reviewed-by");
    runNode(root, missingReviewerArgs, 1);

    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "reviewed_demand_import",
          dry_run_preserved_staging: true,
          staged_rows: staged.length,
          gsc_staged_rows: gscStaged.length,
          valid_for_promotion: validation.valid_for_promotion,
          discovery_only_self_validation_blocked: true,
        },
        null,
        2
      )
    );
  } finally {
    cleanup(root, runDate);
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
