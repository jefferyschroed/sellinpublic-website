#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

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

function slugify(value, fallback = "reviewed-demand") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || fallback;
}

function commandSequenceFor(runDate, request) {
  if (Array.isArray(request.command_sequence) && request.command_sequence.length) return request.command_sequence;
  if (Array.isArray(request.commandSequence) && request.commandSequence.length) return request.commandSequence;
  const dryRun =
    request.normalization_command ||
    `node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date ${runDate} --candidate ${request.candidate_id || "<candidate-id>"} --type ${request.recommended_import_type || "<import-type>"} --source-file <raw-export.csv> --reviewed-by <name> --dry-run`;
  const apply = dryRun.includes("--dry-run") ? dryRun.replace("--dry-run", "--apply") : `${dryRun} --apply`;
  return [
    dryRun,
    apply,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run`,
    `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --approval-marker DEMAND-PROMOTION-APPROVED:${runDate}`,
  ];
}

function scaffoldCommandFor(runDate) {
  return `node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --apply --scaffold-limit 1`;
}

function rawExportPath(runDate, request) {
  const candidate = slugify(request.candidate_id, "candidate");
  const type = slugify(request.recommended_import_type, "import");
  return `imports/reviewed-demand/raw/${runDate}-${candidate}-${type}.csv`;
}

function replaceSourceFile(commands, sourceFile) {
  return commands.map((command) => command.replace("<raw-export.csv>", sourceFile));
}

function formatCommandLine(command, index) {
  return `${index + 1}. \`${command}\``;
}

function firstEligibleRequest(sourceRequest, ownerActions) {
  const ownerFirst = ownerActions.source_handoff?.first_eligible_request;
  if (ownerFirst?.candidate_id) return ownerFirst;
  return (sourceRequest.requested_exports || [])[0] || null;
}

function writeMarkdown(filePath, packet) {
  const commandLines = packet.commands.map(formatCommandLine).join("\n");
  const requestedRows = packet.requested_exports
    .slice(0, 12)
    .map((item) => `| \`${item.candidate_id}\` | ${item.recommended_import_type} | ${item.validation_status || "n/a"} | \`${item.staging_csv_path}\` |`)
    .join("\n");
  const markdown = `# Reviewed Demand Source Acquisition Packet

Run date: ${packet.run_date}
Generated at: ${packet.generated_at}
Status: ${packet.status}
Active source-request lock: ${packet.active_lock ? "yes" : "no"}

## Purpose

This packet exists only to unblock validated demand. It does not approve article claims, draft copy, generate pages, publish posts, or make discovery-only rows factual evidence.

## Current Owner Action

${packet.owner_prompt || "No owner prompt available."}

## First Eligible Request

- Candidate: ${packet.first_request?.candidate_id || "n/a"}
- Topic: ${packet.first_request?.topic || "n/a"}
- Query/topic: ${packet.first_request?.query_or_topic_to_validate || "n/a"}
- Import type: ${packet.first_request?.recommended_import_type || "n/a"}
- Required fields: ${packet.first_request?.required_review_fields || "n/a"}
- Suggested raw export path: \`${packet.suggested_raw_export_path || "n/a"}\`
- Staging CSV: \`${packet.first_request?.staging_csv_path || "n/a"}\`
- Final destination: \`${packet.first_request?.final_destination_path || "n/a"}\`

## Normalization Guidance

${packet.normalization_guidance || "Use the command sequence for the listed import type exactly as written."}

${packet.source_specific_alternate_route ? `Source-specific alternate route: ${packet.source_specific_alternate_route}` : ""}

## Commands After The Raw Export Exists

${commandLines || "- No command sequence is available."}

Optional after plain promotion report review and packet approval:

\`${packet.optional_scaffold_command_after_packet_approval || "n/a"}\`

## Requested Export Status

| Candidate | Type | Validation | Staging |
|---|---|---|---|
${requestedRows || "| None |  |  |  |"}

## Rules

- Put the raw reviewed export under \`imports/\` or \`research/\` before staging.
- Do not manually move staging files into \`imports/\`.
- Run staging dry-run before staging apply.
- Run promotion dry-run before promotion apply.
- Run packet scaffolding only after the promotion report shows a ready handoff and human approval exists.
- Do not use Reddit, public feeds, Google Trends RSS, autocomplete, People Also Ask, or AI answers as validated demand.
- For AnswerThePublic or AlsoAsked-style rows, include a separate demand-bearing validation source.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const sourceRequestPath = path.join(outputDir, "demand-acquisition-tasks", "source-request.json");
  const ownerActionsPath = path.join(outputDir, "owner-actions.json");
  const validationPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json");
  const sourceRequest = readJson(sourceRequestPath, {});
  const ownerActions = readJson(ownerActionsPath, {});
  const validation = readJson(validationPath, {});
  const firstRequest = firstEligibleRequest(sourceRequest, ownerActions);
  const activeLock = String(sourceRequest.status || ownerActions.source_handoff?.status || "").startsWith("escalation_required");
  const promotionReady = Number(validation.valid_for_promotion || 0) > 0;
  const suggestedRawPath = firstRequest ? rawExportPath(runDate, firstRequest) : "";
  if (suggestedRawPath) ensureDir(path.join(root, path.dirname(suggestedRawPath)));
  const commands = firstRequest ? replaceSourceFile(commandSequenceFor(runDate, firstRequest), suggestedRawPath || "<raw-export.csv>") : [];
  const requestedExports = (ownerActions.source_handoff?.requested_exports || sourceRequest.requested_exports || []).map((item) => ({
    candidate_id: item.candidate_id || "",
    recommended_import_type: item.recommended_import_type || "",
    validation_status: item.validation_status || "",
    row_count: item.row_count ?? "",
    staging_csv_path: item.staging_csv_path || "",
  }));
  const packet = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: promotionReady ? "promotion_ready" : activeLock ? "source_request_lock_active" : "not_required",
    active_lock: activeLock,
    source_request_json: fs.existsSync(sourceRequestPath) ? relative(root, sourceRequestPath) : "",
    owner_actions_json: fs.existsSync(ownerActionsPath) ? relative(root, ownerActionsPath) : "",
    validation_report_json: fs.existsSync(validationPath) ? relative(root, validationPath) : "",
    owner_prompt: ownerActions.owner_prompt || "",
    normalization_guidance: sourceRequest.normalization_guidance || ownerActions.source_handoff?.normalization_guidance || "",
    source_specific_alternate_route: sourceRequest.source_specific_alternate_route || ownerActions.source_handoff?.source_specific_alternate_route || "",
    first_request: firstRequest || null,
    suggested_raw_export_path: suggestedRawPath,
    commands,
    optional_scaffold_command_after_packet_approval: scaffoldCommandFor(runDate),
    scaffold_command_requires_approval: true,
    scaffold_command_gate:
      "The scaffolded apply command is optional. Run it only after plain promotion has completed, the promotion report shows a ready handoff, and packet scaffolding has been approved.",
    requested_export_count: sourceRequest.requested_export_count ?? requestedExports.length,
    validation_summary: {
      valid_for_promotion: validation.valid_for_promotion ?? "",
      promoted: validation.promoted ?? "",
      blocked: validation.blocked ?? "",
      empty_staging: validation.empty_staging ?? "",
    },
    requested_exports: requestedExports,
    rule:
      "This packet is validated-demand source acquisition only. It does not approve article claims, drafting, generation, publishing, distribution, or skill promotion.",
  };
  const jsonPath = path.join(outputDir, "source-acquisition-packet.json");
  const markdownPath = path.join(outputDir, "source-acquisition-packet.md");
  writeJsonAtomic(jsonPath, packet);
  writeMarkdown(markdownPath, packet);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        status: packet.status,
        first_candidate: packet.first_request?.candidate_id || "",
        suggested_raw_export_path: packet.suggested_raw_export_path,
        source_acquisition_packet_json: relative(root, jsonPath),
        source_acquisition_packet_md: relative(root, markdownPath),
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
