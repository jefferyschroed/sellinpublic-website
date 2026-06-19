#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const REVIEW_HEADERS = [
  "date",
  "candidate_id",
  "priority",
  "import_rank",
  "primary_recommended_import",
  "priority_reason",
  "recommended_import_type",
  "query_or_topic_to_validate",
  "template_path",
  "staging_csv_path",
  "final_destination_path",
  "required_review_fields",
  "owner",
  "status",
  "notes",
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

function stagingState(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, rows: 0, preserved: false };
  const parsed = readCsv(filePath);
  return { exists: true, rows: parsed.rows.length, preserved: parsed.rows.length > 0 };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function templateHeaders(root, templatePath) {
  const absolutePath = path.resolve(root, templatePath);
  const { headers } = readCsv(absolutePath);
  if (!headers.length) throw new Error(`Import template has no headers: ${templatePath}`);
  return headers;
}

function stagingFileName(row) {
  const destinationName = path.basename(row.destination_path || "");
  const baseName = destinationName.replace(/\.csv$/i, "");
  const safeBase = slugify(baseName || `${row.candidate_id}-${row.recommended_import_type}`);
  return `${safeBase}.draft.csv`;
}

function instructionFor(row) {
  if (row.recommended_import_type === "google_trends_csv_export") {
    return [
      "Use Google Trends CSV/API or manually normalized Google Trends data.",
      "Do not use Google Trends RSS rows for validated demand.",
      "Keep values blank if the export does not provide them; do not estimate numbers.",
    ];
  }
  if (row.recommended_import_type === "bing_webmaster_query_export") {
    return [
      "Use Bing Webmaster data only from the verified Sell In Public property.",
      "Preserve Bing column names where possible and avoid hand-entered metrics.",
      "Do not use third-party keyword tools in this file.",
    ];
  }
  if (row.recommended_import_type === "gsc_search_query_export" || row.recommended_import_type === "gsc_emerging_query_export") {
    return [
      "Use Google Search Console data only from the verified Sell In Public property.",
      "Keep source as google_search_console and preserve clicks, impressions, CTR, and position from the export/API.",
      "Include property_id, reviewed_by, source_export_id, and source_file provenance; do not estimate missing metrics.",
    ];
  }
  return [
    "Use only a reviewed query-tool export or first-party demand source.",
    "Set validated_demand only when validation_source and reviewed_by are populated.",
    "Do not put AnswerThePublic, autocomplete, PAA, or AI answers here unless separately validated.",
  ];
}

function writeMarkdown(filePath, report) {
  const groups = new Map();
  for (const row of report.review_rows) {
    if (!groups.has(row.candidate_id)) groups.set(row.candidate_id, []);
    groups.get(row.candidate_id).push(row);
  }

  const sections = Array.from(groups.entries())
    .map(([candidateId, rows]) => {
      const lines = rows
        .sort((a, b) => Number(a.import_rank || 0) - Number(b.import_rank || 0))
        .map(
          (row) =>
            `- Rank ${row.import_rank} (${row.primary_recommended_import === "yes" ? "primary" : "fallback"}): ${row.recommended_import_type}: fill \`${row.staging_csv_path}\` with reviewed rows, then let \`run-demand-promotion.mjs --apply\` promote valid data to \`${row.final_destination_path}\`. Validate \`${row.query_or_topic_to_validate}\`. ${row.priority_reason}`
        )
        .join("\n");
      return `## ${candidateId}\n\n${lines}\n`;
    })
    .join("\n");

  const markdown = `# Demand Import Prep Pack

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Request count: ${report.request_count}

## Rule

This folder is staging only. The CSVs here are header-only drafts and are not imported by the SEO/AEO pipeline. Do not manually move a file into \`imports/\`; fill real reviewed export rows from an approved source, then use the demand-promotion runner. Do not create or infer demand data.

## Workflow

1. Open the relevant source system, such as Google Search Console, Google Trends, Bing Webmaster Tools, or a reviewed query tool.
2. Start with the row where \`primary_recommended_import\` is \`yes\` and \`import_rank\` is \`1\`; use lower-ranked rows only when the primary source is unavailable, empty, or needs corroboration.
3. Put the raw reviewed export under \`imports/\` or \`research/\` so it is auditable.
4. Normalize it into the matching header-only draft CSV with \`node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${report.run_date} --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run\`. For Google Search Console, Bing Webmaster, and Google Trends imports, omit third-party validation flags unless the source-specific instructions ask for them.
5. Rerun the same command with \`--apply\` only after confirming the normalized rows are real reviewed demand rows.
6. Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --dry-run\`.
7. If dry-run passes and promotion is approved, run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${report.run_date}\`.
8. Review the promotion report. Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${report.run_date} --apply --scaffold-limit 1 --scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:${report.run_date}\` only after packet scaffolding is separately approved.

## Blocked Exact-Query Policy

Do not launch another exact-query acquisition worker after repeated \`blocked_no_reviewed_rows\` reports unless a real accessible export source has already been identified. Choose source first, then candidate: verified Google Search Console export; owner-supplied Ahrefs/Semrush/AlsoAsked/AnswerThePublic export with separate demand validation; verified Bing Webmaster export; manual Google Trends CSV/API export; or another approved reviewed demand-bearing source. If no export source is accessible, stop and ask the owner for an export.

## Provenance Requirements

Every staged export needs source tool, source URL or export path, capture timestamp where available, geo, language, timeframe when applicable, source row count, reviewer, validation source, and a note explaining why rows are demand-bearing. Metrics must be copied from exports, not estimated.

${
    sections ||
    (report.source_request_fallback_active
      ? `No demand import requests were available from the worklist. Use the active source-request fallback instead: \`${report.source_request_markdown || report.source_request_json}\`.`
      : "No demand import requests found.")
  }
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const worklistPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-worklist.json");
  const worklist = readJson(worklistPath, {});
  const rows = worklist.rows || [];
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack"));
  const reviewRows = [];
  const sourceRequestPath = path.join(root, "automation-runs", runDate, "demand-acquisition-tasks", "source-request.json");
  const sourceRequest = readJson(sourceRequestPath, {});
  const sourceRequestFallbackActive = rows.length === 0 && String(sourceRequest.status || "").startsWith("escalation_required");

  for (const row of rows) {
    const headers = templateHeaders(root, row.template_path);
    const stagingPath = path.join(outputDir, stagingFileName(row));
    const state = stagingState(stagingPath);
    if (!state.preserved) writeCsvAtomic(stagingPath, headers, []);
    const instructionPath = path.join(outputDir, `${path.basename(stagingPath, ".csv")}.md`);
    const instructions = instructionFor(row)
      .map((item) => `- ${item}`)
      .join("\n");
    const instruction = `# Demand Import Instructions

Candidate: ${row.candidate_id}
Topic: ${row.topic}
Import type: ${row.recommended_import_type}
Import rank: ${row.import_rank || "unranked"}
Primary recommended import: ${row.primary_recommended_import || "no"}
Priority reason: ${row.priority_reason || "none recorded"}
Query or topic to validate: ${row.query_or_topic_to_validate}
Staging CSV: ${relative(root, stagingPath)}
Final destination: ${row.destination_path}

## Required Review Fields

${row.required_review_fields || "Use the staging CSV headers."}

## Rules

${instructions}

## Normalization

Prefer \`stage-reviewed-demand-export.mjs\` over manual CSV editing:

\`\`\`sh
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${row.candidate_id} --type ${row.recommended_import_type} --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${row.candidate_id} --type ${row.recommended_import_type} --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --apply
\`\`\`

Do not use AnswerThePublic, autocomplete, PAA, or AI answers as validated demand unless a separate demand-bearing validation source is recorded in \`validation_source\`. Google Trends RSS is discovery-only. For active demand-import packs, do not move files directly into \`imports/\`; let \`run-demand-promotion.mjs --apply\` promote validated staging rows.
`;
    fs.writeFileSync(instructionPath, instruction);
    reviewRows.push({
      date: runDate,
      candidate_id: row.candidate_id,
      priority: row.priority,
      import_rank: row.import_rank,
      primary_recommended_import: row.primary_recommended_import,
      priority_reason: row.priority_reason,
      recommended_import_type: row.recommended_import_type,
      query_or_topic_to_validate: row.query_or_topic_to_validate,
      template_path: row.template_path,
      staging_csv_path: relative(root, stagingPath),
      final_destination_path: row.destination_path,
      required_review_fields: row.required_review_fields,
      owner: row.owner,
      status: state.preserved ? "staging_preserved_non_empty" : "staging_header_only",
      notes: state.preserved
        ? "Existing non-empty staging file preserved. Validate before promotion."
        : "Header-only staging file. Not imported. Fill with reviewed rows before running the demand-promotion runner.",
    });
  }

  const checklistPath = path.join(outputDir, "review-checklist.csv");
  const manifestPath = path.join(outputDir, "manifest.json");
  const readmePath = path.join(outputDir, "README.md");
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    source_worklist_path: fs.existsSync(worklistPath) ? relative(root, worklistPath) : "",
    output_dir: relative(root, outputDir),
    request_count: rows.length,
    source_request_fallback_active: sourceRequestFallbackActive,
    source_request_json: fs.existsSync(sourceRequestPath) ? relative(root, sourceRequestPath) : "",
    source_request_markdown:
      sourceRequest.source_request_markdown ||
      sourceRequest.markdown_path ||
      (sourceRequestFallbackActive ? `automation-runs/${runDate}/demand-acquisition-tasks/source-request.md` : ""),
    source_request_fallback_note: sourceRequestFallbackActive
      ? "The demand-import worklist is empty, but source-request escalation is active. Use the source-request artifact as the canonical handoff for reviewed demand rows."
      : "",
    review_rows: reviewRows,
  };

  writeCsvAtomic(checklistPath, REVIEW_HEADERS, reviewRows);
  writeJsonAtomic(manifestPath, report);
  writeMarkdown(readmePath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        request_count: rows.length,
        output_dir: relative(root, outputDir),
        manifest_path: relative(root, manifestPath),
        checklist_path: relative(root, checklistPath),
        readme_path: relative(root, readmePath),
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
