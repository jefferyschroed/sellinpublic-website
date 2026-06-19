#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanupFixture(root, runDate) {
  for (const target of [
    path.join(root, "research", "daily-content-plan", runDate),
    path.join(root, "automation-runs", runDate),
    path.join(root, "imports", "query-exports", `${runDate}-reviewed-query-tool-fixture.csv`),
  ]) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFixture(root, runDate) {
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  const packDir = path.join(planDir, "demand-import-pack");
  const stagingPath = path.join(packDir, `${runDate}-reviewed-query-tool-fixture.draft.csv`);
  const destinationPath = path.join(root, "imports", "query-exports", `${runDate}-reviewed-query-tool-fixture.csv`);
  ensureDir(packDir);
  ensureDir(path.dirname(destinationPath));
  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic_id,pillar_id,parent_topic,topic,canonical_topic,intent,aeo_question,topic_score_guess,gate_reasons,source_readiness,packet_intake_status,topic_decision,coverage_status,coverage_role,authority_match\n" +
      `${runDate},query-fixture,topic-fixture,pillar-fixture,,fixture topic,Fixture Topic,definition,What is fixture topic?,90,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n`
  );
  fs.writeFileSync(
    path.join(planDir, "demand-readiness-preflight.json"),
    `${JSON.stringify(
      {
        next_unambiguous_action: {
          candidate_id: "query-fixture",
        },
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(planDir, "demand-import-worklist.json"),
    `${JSON.stringify(
      {
        source_availability: {
          bing_webmaster_available: false,
        },
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    stagingPath,
    "date,source,query,country,language,volume,difficulty,impressions,clicks,trend_delta,trend_window,validated_demand,validation_source,reviewed_by,notes\n" +
      `${runDate},Ahrefs,fixture topic,US,en,,,,,,,yes,Ahrefs reviewed export,qa,Fixture row\n`
  );
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify(
      {
        review_rows: [
          {
            date: runDate,
            candidate_id: "query-fixture",
            priority: "P0",
            import_rank: 1,
            primary_recommended_import: "yes",
            priority_reason: "fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            query_or_topic_to_validate: "What is fixture topic?",
            template_path: "docs/seo-aeo/templates/imports/generic-query-tool-export.csv",
            staging_csv_path: path.relative(root, stagingPath).split(path.sep).join("/"),
            final_destination_path: path.relative(root, destinationPath).split(path.sep).join("/"),
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  const reportDir = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "reports");
  ensureDir(reportDir);
  fs.writeFileSync(
    path.join(reportDir, "query-fixture-acquire-rank1-reviewed-generic-query-tool-export.md"),
    "# Demand Acquisition Report\n\n" +
      "task_id: query-fixture-acquire-rank1-reviewed-generic-query-tool-export\n" +
      "candidate_id: query-fixture\n" +
      "status: blocked_no_reviewed_rows\n" +
      "source_used: none\n" +
      "rows_added: 0\n" +
      "blocked_reason: stale fixture block\n" +
      "reviewer: qa\n"
  );
}

function writeSourceFirstFixture(root, runDate) {
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  const packDir = path.join(planDir, "demand-import-pack");
  const genericStaging = path.join(packDir, `${runDate}-generic-source-first.draft.csv`);
  const trendsStaging = path.join(packDir, `${runDate}-trends-source-first.draft.csv`);
  const bingStaging = path.join(packDir, `${runDate}-bing-source-first.draft.csv`);
  const gscStaging = path.join(packDir, `${runDate}-gsc-source-first.draft.csv`);
  const genericOnlyStaging = path.join(packDir, `${runDate}-generic-only-source-first.draft.csv`);
  const csvHeader = "date,source,query,country,language,volume,difficulty,impressions,clicks,trend_delta,trend_window,validated_demand,validation_source,reviewed_by,notes\n";
  ensureDir(packDir);
  ensureDir(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks"));
  fs.writeFileSync(
    path.join(planDir, "topic-candidates.csv"),
    "date,candidate_id,topic_id,pillar_id,parent_topic,topic,canonical_topic,intent,aeo_question,topic_score_guess,gate_reasons,source_readiness,packet_intake_status,topic_decision,coverage_status,coverage_role,authority_match\n" +
      `${runDate},query-source-first,topic-fixture,pillar-fixture,,source first topic,Source First Topic,commercial,How should source first work?,88,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n` +
      `${runDate},query-generic-only,topic-generic,pillar-fixture,,generic only topic,Generic Only Topic,commercial,How should generic only work?,82,query_handoff_draft,ready,blocked_before_packet,create_or_refresh_packet,planned,hub,fixture\n`
  );
  fs.writeFileSync(
    path.join(planDir, "demand-readiness-preflight.json"),
    `${JSON.stringify({ next_unambiguous_action: { candidate_id: "query-source-first" } }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(planDir, "demand-import-worklist.json"),
    `${JSON.stringify(
      {
        source_availability: {
          bing_webmaster_available: false,
          gsc_search_console_available: false,
          gsc_search_console_rows_present: false,
          manual_google_trends_csv_available: true,
        },
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(genericStaging, csvHeader);
  fs.writeFileSync(trendsStaging, csvHeader);
  fs.writeFileSync(bingStaging, csvHeader);
  fs.writeFileSync(gscStaging, csvHeader);
  fs.writeFileSync(genericOnlyStaging, csvHeader);
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    `${JSON.stringify(
      {
        review_rows: [
          {
            date: runDate,
            candidate_id: "query-source-first",
            priority: "P0",
            import_rank: 1,
            primary_recommended_import: "yes",
            priority_reason: "fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            query_or_topic_to_validate: "How should source first work?",
            template_path: "docs/seo-aeo/templates/imports/generic-query-tool-export.csv",
            staging_csv_path: path.relative(root, genericStaging).split(path.sep).join("/"),
            final_destination_path: `imports/query-exports/${runDate}-generic-source-first.csv`,
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
          {
            date: runDate,
            candidate_id: "query-source-first",
            priority: "P0",
            import_rank: 2,
            primary_recommended_import: "no",
            priority_reason: "fixture fallback",
            recommended_import_type: "google_trends_csv_export",
            query_or_topic_to_validate: "How should source first work?",
            template_path: "docs/seo-aeo/templates/imports/google-trends-export.csv",
            staging_csv_path: path.relative(root, trendsStaging).split(path.sep).join("/"),
            final_destination_path: `imports/trends/${runDate}-trends-source-first.csv`,
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
          {
            date: runDate,
            candidate_id: "query-source-first",
            priority: "P0",
            import_rank: 3,
            primary_recommended_import: "no",
            priority_reason: "fixture fallback",
            recommended_import_type: "bing_webmaster_query_export",
            query_or_topic_to_validate: "How should source first work?",
            template_path: "docs/seo-aeo/templates/imports/search-query-export.csv",
            staging_csv_path: path.relative(root, bingStaging).split(path.sep).join("/"),
            final_destination_path: `imports/query-exports/${runDate}-bing-source-first.csv`,
            required_review_fields: "date,source,property_id,reviewed_by,query,impressions",
          },
          {
            date: runDate,
            candidate_id: "query-source-first",
            priority: "P0",
            import_rank: 4,
            primary_recommended_import: "no",
            priority_reason: "fixture fallback",
            recommended_import_type: "gsc_search_query_export",
            query_or_topic_to_validate: "How should source first work?",
            template_path: "docs/seo-aeo/templates/imports/search-query-export.csv",
            staging_csv_path: path.relative(root, gscStaging).split(path.sep).join("/"),
            final_destination_path: `imports/query-exports/${runDate}-gsc-source-first.csv`,
            required_review_fields: "date,source,property_id,reviewed_by,query,impressions",
          },
          {
            date: runDate,
            candidate_id: "query-generic-only",
            priority: "P0",
            import_rank: 1,
            primary_recommended_import: "yes",
            priority_reason: "generic-only fixture",
            recommended_import_type: "reviewed_generic_query_tool_export",
            query_or_topic_to_validate: "How should generic only work?",
            template_path: "docs/seo-aeo/templates/imports/generic-query-tool-export.csv",
            staging_csv_path: path.relative(root, genericOnlyStaging).split(path.sep).join("/"),
            final_destination_path: `imports/query-exports/${runDate}-generic-only-source-first.csv`,
            required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "report-rollup.json"),
    `${JSON.stringify(
      {
        summary: {
          blocked_no_reviewed_rows: 3,
        },
        recommended_action: "acquire_reviewed_export_from_external_tool_before_more_exact_query_attempts",
      },
      null,
      2
    )}\n`
  );
}

function reportStatus(root, runDate, taskId) {
  const reportPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "reports", `${taskId}.md`);
  if (!fs.existsSync(reportPath)) return "";
  return fs.readFileSync(reportPath, "utf8").match(/^status:[ \t]*([^\r\n]*)/m)?.[1]?.trim() || "";
}

function runBuilder(root, runDate, extraArgs = []) {
  const result = spawnSync(process.execPath, ["scripts/seo-aeo/build-demand-acquisition-tasks.mjs", "--date", runDate, ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `builder failed: ${output}`);
  return JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "tasks.json"), "utf8"));
}

function checkLiveDefault(root) {
  const runDate = "2026-06-18";
  const report = runBuilder(root, runDate);
  assert(report.task_count === 1, `default wave should select exactly one task, got ${report.task_count}`);
  const [task] = report.tasks;
  const selectedReportStatus = reportStatus(root, runDate, task.task_id);
  assert(selectedReportStatus !== "blocked_no_reviewed_rows", `default wave should not select an already blocked task: ${task.task_id}`);
  assert(task.status !== "blocked_no_reviewed_rows", `default wave should not emit a blocked task status: ${task.task_id}`);
  assert(
    ["reviewed_generic_query_tool_export", "google_trends_csv_export", "gsc_search_query_export", "gsc_emerging_query_export"].includes(task.recommended_import_type),
    `default wave should select a reviewed demand source, got ${task.recommended_import_type}`
  );
  assert(
    task.recommended_import_type !== "bing_webmaster_query_export" || report.filters?.includeBingFallbacks === true,
    "default wave must not select Bing fallback tasks unless explicitly enabled"
  );
  assert(!task.final_destination_path.includes(".draft."), "final destination should not be the staging draft path.");
  assert(task.staging_csv_path.includes("demand-import-pack"), "staging path should stay inside demand-import-pack.");
  assert(task.report_path.includes("automation-runs/2026-06-18/demand-acquisition-tasks/reports/"), "task report path should be scoped to demand-acquisition-tasks reports.");

  const prompt = fs.readFileSync(path.join(root, task.prompt_path), "utf8");
  assert(prompt.includes("Do not edit any other files."), "prompt must include write-scope guard.");
  assert(prompt.includes("Do not promote data into `imports/`"), "prompt must forbid direct imports promotion.");
  assert(prompt.includes("run-demand-promotion.mjs"), "prompt must hand off to demand-promotion runner.");
  assert(prompt.includes("## Input Paths"), "prompt must include explicit input paths.");
  assert(prompt.includes("## CSV Headers"), "prompt must include explicit CSV headers.");
  if (task.recommended_import_type === "reviewed_generic_query_tool_export") {
    assert(prompt.includes("- validated_demand"), "prompt must list validated_demand CSV header.");
  } else if (task.recommended_import_type === "google_trends_csv_export") {
    assert(prompt.includes("- trend_delta"), "Google Trends prompt must list trend_delta CSV header.");
  } else {
    assert(prompt.includes("- impressions"), "first-party search prompt must list impressions CSV header.");
  }
  assert(!/^trend-/.test(task.candidate_id), "default wave must not select trend candidates.");

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixture: "demand_acquisition_tasks_live_default",
        task_count: report.task_count,
        selected_task: task.task_id,
        prompt_path: task.prompt_path,
      },
      null,
      2
    )
  );
}

function checkSourceFirstSuppressesGenericWithFallback(root) {
  const runDate = "2099-01-08";
  cleanupFixture(root, runDate);
  try {
    writeSourceFirstFixture(root, runDate);
    const report = runBuilder(root, runDate);
    assert(report.task_count === 1, `source-first fixture should select one task, got ${report.task_count}`);
    const [task] = report.tasks;
    assert(task.recommended_import_type === "google_trends_csv_export", `source-first default should select source-specific fallback, got ${task.recommended_import_type}`);
    assert(task.source_first_mode === "yes", "selected fallback should record source-first mode.");

    const fallbackReport = runBuilder(root, runDate, [
      "--candidate",
      "query-source-first",
      "--max",
      "4",
      "--include-bing-fallbacks",
      "--include-gsc-fallbacks",
    ]);
    const fallbackTypes = fallbackReport.tasks.map((item) => item.recommended_import_type);
    assert(
      fallbackTypes.join(",") === "google_trends_csv_export,bing_webmaster_query_export,gsc_search_query_export",
      `candidate fallback wave should keep only source-specific rows, got ${fallbackTypes.join(",")}`
    );

    const overrideReport = runBuilder(root, runDate, ["--allow-generic-after-source-blocks"]);
    assert(overrideReport.task_count === 1, `override fixture should select one task, got ${overrideReport.task_count}`);
    assert(
      overrideReport.tasks[0].recommended_import_type === "reviewed_generic_query_tool_export",
      `override should allow generic query-tool task, got ${overrideReport.tasks[0].recommended_import_type}`
    );
    const genericOnlyReport = runBuilder(root, runDate, ["--candidate", "query-generic-only"]);
    assert(genericOnlyReport.task_count === 1, `generic-only fixture should select one task, got ${genericOnlyReport.task_count}`);
    assert(
      genericOnlyReport.tasks[0].recommended_import_type === "reviewed_generic_query_tool_export",
      `generic-only candidate should still select generic import, got ${genericOnlyReport.tasks[0].recommended_import_type}`
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand_acquisition_source_first_suppresses_generic",
          default_selected_type: task.recommended_import_type,
          fallback_selected_types: fallbackTypes,
          override_selected_type: overrideReport.tasks[0].recommended_import_type,
          generic_only_selected_type: genericOnlyReport.tasks[0].recommended_import_type,
        },
        null,
        2
      )
    );
  } finally {
    cleanupFixture(root, runDate);
  }
}

function checkStaleBlockedReportWithStagedRows(root) {
  const runDate = "2099-01-06";
  cleanupFixture(root, runDate);
  try {
    writeFixture(root, runDate);
    const result = spawnSync(process.execPath, ["scripts/seo-aeo/build-demand-acquisition-tasks.mjs", "--date", runDate], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `fixture builder failed: ${output}`);
    const report = JSON.parse(fs.readFileSync(path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "tasks.json"), "utf8"));
    assert(report.task_count === 1, `fixture should select one task, got ${report.task_count}`);
    const [task] = report.tasks;
    assert(task.task_id === "query-fixture-acquire-rank1-reviewed-generic-query-tool-export", `fixture selected wrong task: ${task.task_id}`);
    assert(task.status === "staged_rows_need_promotion", `fixture should surface staged rows despite stale blocked report, got ${task.status}`);
    console.log(
      JSON.stringify(
        {
          ok: true,
          fixture: "demand_acquisition_stale_blocked_report_with_staged_rows",
          selected_task: task.task_id,
          status: task.status,
        },
        null,
        2
      )
    );
  } finally {
    cleanupFixture(root, runDate);
  }
}

function run() {
  const root = process.cwd();
  checkLiveDefault(root);
  checkSourceFirstSuppressesGenericWithFallback(root);
  checkStaleBlockedReportWithStagedRows(root);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
