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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { _parse_error: error.message };
  }
}

function timeValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function validationCounts(report) {
  return {
    valid_for_promotion: numeric(report?.valid_for_promotion),
    already_promoted: numeric(report?.already_promoted),
    promoted: numeric(report?.promoted),
    blocked: numeric(report?.blocked),
    empty_staging: numeric(report?.empty_staging),
  };
}

function promotionCounts(report) {
  const validation = report?.validation || {};
  return {
    valid_for_promotion: numeric(validation.valid_for_promotion),
    already_promoted: numeric(validation.already_promoted),
    promoted: numeric(validation.promoted),
    blocked: numeric(validation.blocked),
    empty_staging: numeric(validation.empty_staging),
  };
}

function countMismatches(current, promoted) {
  const keys = ["valid_for_promotion", "already_promoted", "promoted", "blocked", "empty_staging"];
  return keys
    .filter((key) => current[key] !== promoted[key])
    .map((key) => ({
      field: key,
      validation_report: current[key],
      demand_promotion_report: promoted[key],
    }));
}

function classify({ validationReport, promotionReport, validationPath, promotionPath }) {
  if (!validationReport) {
    return {
      ok: false,
      status: "missing_validation_report",
      freshness_status: "missing",
      detail: "Demand validation report is missing; run validate-demand-import-pack before promotion review.",
      mismatches: [],
    };
  }

  if (validationReport._parse_error) {
    return {
      ok: false,
      status: "invalid_validation_report",
      freshness_status: "invalid",
      detail: `Demand validation report could not be parsed: ${validationReport._parse_error}`,
      mismatches: [],
    };
  }

  const currentCounts = validationCounts(validationReport);
  if (!promotionReport) {
    const pendingRows = currentCounts.valid_for_promotion + currentCounts.already_promoted + currentCounts.promoted;
    return {
      ok: pendingRows === 0,
      status: pendingRows === 0 ? "no_promotion_report_no_rows" : "missing_promotion_report",
      freshness_status: pendingRows === 0 ? "fresh_enough" : "missing",
      detail:
        pendingRows === 0
          ? "No demand-promotion report exists, and the current validation report has no promotable or promoted rows."
          : "Demand validation has promotable/promoted rows, but no demand-promotion report exists.",
      mismatches: [],
    };
  }

  if (promotionReport._parse_error) {
    return {
      ok: false,
      status: "invalid_promotion_report",
      freshness_status: "invalid",
      detail: `Demand promotion report could not be parsed: ${promotionReport._parse_error}`,
      mismatches: [],
    };
  }

  const promotionValidationPath = promotionReport.artifacts?.validation_report_json || promotionReport.validation?.report_json || "";
  const linkedToCurrentValidation =
    !promotionValidationPath || normalizePath(promotionValidationPath) === normalizePath(path.relative(process.cwd(), validationPath));
  const currentTime = timeValue(validationReport.generated_at);
  const promotionTime = timeValue(promotionReport.generated_at);
  const mismatches = countMismatches(currentCounts, promotionCounts(promotionReport));

  if (!linkedToCurrentValidation) {
    return {
      ok: false,
      status: "stale_validation_report_path",
      freshness_status: "stale",
      detail: `Demand promotion report references ${promotionValidationPath}, not ${path.relative(process.cwd(), validationPath)}.`,
      mismatches,
    };
  }

  if (currentTime && promotionTime && currentTime > promotionTime) {
    return {
      ok: false,
      status: "stale_validation_newer_than_promotion",
      freshness_status: "stale",
      detail: `Demand validation report is newer than the demand-promotion report. Rerun demand promotion dry-run before apply/scaffold.`,
      mismatches,
    };
  }

  if (mismatches.length) {
    return {
      ok: false,
      status: "stale_count_mismatch",
      freshness_status: "stale",
      detail: "Demand validation counts do not match the counts captured in the demand-promotion report.",
      mismatches,
    };
  }

  return {
    ok: true,
    status: "fresh",
    freshness_status: "fresh",
    detail: "Demand-promotion report matches the current demand validation report.",
    mismatches: [],
  };
}

function writeMarkdown(filePath, report) {
  const mismatchLines = report.mismatches.length
    ? report.mismatches
        .map(
          (item) =>
            `- ${item.field}: validation ${item.validation_report}; promotion report ${item.demand_promotion_report}`
        )
        .join("\n")
    : "- None.";
  const markdown = `# Demand Promotion Freshness

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}
Freshness: ${report.freshness_status}

## Summary

${report.detail}

## Counts

- Validation valid for promotion: ${report.validation_counts.valid_for_promotion}
- Promotion-report valid for promotion: ${report.promotion_counts.valid_for_promotion}
- Validation already promoted: ${report.validation_counts.already_promoted}
- Promotion-report already promoted: ${report.promotion_counts.already_promoted}
- Validation blocked: ${report.validation_counts.blocked}
- Promotion-report blocked: ${report.promotion_counts.blocked}

## Mismatches

${mismatchLines}

## Next Action

${report.next_action}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const runDir = ensureDir(path.join(root, "automation-runs", runDate));
  const validationPath = path.join(root, "research", "daily-content-plan", runDate, "demand-import-pack", "validation-report.json");
  const promotionPath = path.join(runDir, "demand-promotion-report.json");
  const validationReport = readJson(validationPath);
  const promotionReport = readJson(promotionPath);
  const classification = classify({ validationReport, promotionReport, validationPath, promotionPath });
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    ...classification,
    validation_counts: validationCounts(validationReport),
    promotion_counts: promotionCounts(promotionReport),
    source_files: {
      validation_report: fs.existsSync(validationPath) ? relative(root, validationPath) : "",
      demand_promotion_report: fs.existsSync(promotionPath) ? relative(root, promotionPath) : "",
    },
    next_action: classification.ok
      ? "No freshness action is needed before reviewing demand promotion."
      : `Run \`node scripts/seo-aeo/run-demand-promotion.mjs --date ${runDate} --dry-run\` before any demand promotion apply or packet scaffolding.`,
    rule:
      "This check is read-only. It does not promote demand rows, rebuild discovery, scaffold packets, approve publishing, or create demand data.",
  };

  const jsonPath = path.join(runDir, "demand-promotion-freshness.json");
  const mdPath = path.join(runDir, "demand-promotion-freshness.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(JSON.stringify(report, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
