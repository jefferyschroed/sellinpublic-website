#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

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

function encodeQuery(value) {
  return encodeURIComponent(String(value || "").trim());
}

function sourceInstructions(action) {
  if (action.action && action.action !== "fill_one_reviewed_demand_export" && !action.recommended_import_type) {
    return {
      allowed_sources: [
        "No single export is selected by this brief. Use the generated source request if more demand rows are needed.",
      ],
      disallowed_sources: [
        "Placeholder/example/sample rows",
        "Re-running apply when dry-run shows zero valid_for_promotion rows",
      ],
      review_rule:
        "Do not run apply from this brief unless demand-promotion dry-run shows at least one valid_for_promotion row and the approval marker is provided.",
    };
  }

  if (action.recommended_import_type === "reviewed_generic_query_tool_export") {
    return {
      allowed_sources: [
        "Reviewed AnswerThePublic-style export paired with an explicit validation source",
        "Reviewed AlsoAsked-style export paired with an explicit validation source",
        "Reviewed Ahrefs/Semrush-style keyword or question export paired with an explicit validation source",
        "First-party GSC/Bing/Google Trends evidence manually normalized into the reviewed-query template",
      ],
      disallowed_sources: [
        "ChatGPT answer text",
        "Autocomplete, PAA, or AnswerThePublic rows without separate demand validation",
        "A hand-written row with no review source",
        "Placeholder/example/sample rows",
      ],
      review_rule:
        "Set validated_demand to yes/validated only when validation_source names the demand-bearing source and reviewed_by names the human or responsible agent that reviewed it.",
    };
  }

  if (action.recommended_import_type === "google_trends_csv_export") {
    return {
      allowed_sources: [
        "Manual Google Trends CSV export",
        "Reviewed Google Trends API output normalized to the template",
      ],
      disallowed_sources: [
        "Google Trends RSS headline rows",
        "Public news/RSS feed captures",
        "Estimated trend values",
        "Placeholder/example/sample rows",
      ],
      review_rule: "Use relative trend values only for prioritization. Do not cite them as factual demand volume.",
    };
  }

  if (action.recommended_import_type === "bing_webmaster_query_export") {
    return {
      allowed_sources: ["Verified Sell In Public Bing Webmaster Search Performance export"],
      disallowed_sources: ["Third-party keyword tool rows", "Unverified-property exports", "Placeholder/example/sample rows"],
      review_rule: "Preserve exported Bing query metrics. Use internal search performance for prioritization only.",
    };
  }

  return {
    allowed_sources: ["Approved reviewed source matching the template"],
    disallowed_sources: ["Placeholder/example/sample rows"],
    review_rule: "Use real reviewed export rows only.",
  };
}

function relatedUrls(action) {
  const query = action.query_or_topic_to_validate || action.topic || "";
  return {
    google_trends_explore: query
      ? `https://trends.google.com/trends/explore?geo=US&q=${encodeQuery(query)}`
      : "",
    google_search_console: "https://search.google.com/search-console",
    bing_webmaster_tools: "https://www.bing.com/webmasters",
  };
}

function stagingHeaders(root, action) {
  if (!action.staging_csv_path) return [];
  return readCsv(path.resolve(root, action.staging_csv_path)).headers;
}

function buildBrief(root, runDate) {
  const planDir = path.join(root, "research", "daily-content-plan", runDate);
  const preflightPath = path.join(planDir, "demand-readiness-preflight.json");
  const preflight = readJson(preflightPath, {});
  const action = preflight.next_unambiguous_action || {};
  const instructions = sourceInstructions(action);
  const urls = relatedUrls(action);
  const headers = stagingHeaders(root, action);
  const strictCommands = [
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}`,
    `Optional after reviewing the promotion report and receiving packet approval: node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --scaffold-limit 1`,
  ];
  const debugCommands = [
    `node scripts/seo-aeo/validate-demand-import-pack.mjs --date ${runDate} --fail-on-blocked --fail-on-empty-staging --fail-on-none-valid`,
    `node scripts/seo-aeo/build-discovery-run.mjs --date ${runDate}`,
    `node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/${runDate}-daily-discovery --json --require-handoff-ready`,
  ];

  return {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    source_preflight_path: fs.existsSync(preflightPath) ? relative(root, preflightPath) : "",
    acquisition_status: action.action === "fill_one_reviewed_demand_export" ? "needs_real_export_rows" : action.action || "no_action",
    hard_gate_status: preflight.projected?.hard_gate_status || "missing",
    missing_prerequisites: preflight.projected?.missing_prerequisites || [],
    next_unambiguous_action: action,
    staging_headers: headers,
    source_instructions: instructions,
    related_urls: urls,
    strict_validation_commands: strictCommands,
    debug_commands: debugCommands,
    rules: [
      "This brief does not create demand data.",
      "Fill the staging CSV only with real reviewed export rows.",
      "Use the demand-promotion runner for the approved path after real rows exist.",
      "The promotion runner dry-runs validation before applying or rebuilding discovery.",
      "Discovery/query rows must not be used as factual article evidence.",
      "Do not generate, scaffold, or publish while run gates are blocked.",
    ],
  };
}

function writeMarkdown(filePath, brief) {
  const action = brief.next_unambiguous_action || {};
  const hasSelectedExport = Boolean(action.candidate_id || action.staging_csv_path || action.recommended_import_type);
  const allowed = brief.source_instructions.allowed_sources.map((item) => `- ${item}`).join("\n");
  const disallowed = brief.source_instructions.disallowed_sources.map((item) => `- ${item}`).join("\n");
  const commands = brief.strict_validation_commands.map((command) => `- \`${command}\``).join("\n");
  const debugCommands = (brief.debug_commands || []).map((command) => `- \`${command}\``).join("\n");
  const rules = brief.rules.map((rule) => `- ${rule}`).join("\n");
  const urls = Object.entries(brief.related_urls)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const markdown = `# Demand Acquisition Brief

Run date: ${brief.run_date}
Status: ${brief.acquisition_status}
Hard gate: ${brief.hard_gate_status}

## Next Action

- Action: ${action.action || "none"}
- Reason: ${action.reason || "n/a"}
${hasSelectedExport ? `- Candidate: ${action.candidate_id || "n/a"}
- Topic: ${action.topic || "n/a"}
- Validate: ${action.query_or_topic_to_validate || "n/a"}
- Import type: ${action.recommended_import_type || "n/a"}
- Staging CSV: ${action.staging_csv_path || "n/a"}
- Final destination: ${action.final_destination_path || "n/a"}
- Required fields: ${action.required_review_fields || brief.staging_headers.join(", ") || "n/a"}` : "- Selected export: none. Use the source request or demand import pack; do not infer candidate rows from this brief."}

## Allowed Sources

${allowed || "- None recorded."}

## Disallowed Sources

${disallowed || "- None recorded."}

## Review Rule

${brief.source_instructions.review_rule}

## Helpful URLs

${urls || "- None."}

## Commands After Real Rows Exist

${commands}

## Debug Commands

${debugCommands || "- None."}

## Rules

${rules}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const brief = buildBrief(root, runDate);
  const jsonPath = path.join(outputDir, "demand-acquisition-brief.json");
  const mdPath = path.join(outputDir, "demand-acquisition-brief.md");
  writeJsonAtomic(jsonPath, brief);
  writeMarkdown(mdPath, brief);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        acquisition_status: brief.acquisition_status,
        hard_gate_status: brief.hard_gate_status,
        demand_acquisition_brief_json: relative(root, jsonPath),
        demand_acquisition_brief_md: relative(root, mdPath),
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
