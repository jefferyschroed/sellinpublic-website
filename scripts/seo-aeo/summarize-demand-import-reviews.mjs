#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const HEADERS = [
  "date",
  "candidate_id",
  "artifact_path",
  "import_status",
  "handoff_status",
  "recommended_next_command",
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

function field(source, name) {
  const pattern = new RegExp(`^\\s*-?\\s*${name}:\\s*(.+)$`, "im");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function reviewRows(root, runDate) {
  const dir = path.join(root, "research", "daily-content-plan", runDate);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((fileName) => /^demand-import-review-.+-rank\d+\.md$/.test(fileName))
    .sort()
    .map((fileName) => {
      const filePath = path.join(dir, fileName);
      const source = fs.readFileSync(filePath, "utf8");
      return {
        date: runDate,
        candidate_id: field(source, "candidate_id") || fileName.replace(/^demand-import-review-/, "").replace(/-rank\d+\.md$/, ""),
        artifact_path: relative(root, filePath),
        import_status: field(source, "import_status") || "missing",
        handoff_status: field(source, "handoff_status") || "missing",
        recommended_next_command: field(source, "recommended_next_command"),
      };
    });
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] || "missing";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function writeMarkdown(filePath, report) {
  const lines = report.rows.length
    ? report.rows.map((row) => `- ${row.import_status}/${row.handoff_status}: ${row.candidate_id} - \`${row.artifact_path}\``).join("\n")
    : "- No demand import review artifacts found.";

  const markdown = `# Demand Import Review Rollup

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Review artifacts: ${report.review_count}

## Status Counts

${Object.entries(report.by_import_status)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join("\n") || "- None"}

## Rule

This rollup summarizes Query Intelligence demand-import review artifacts. It does not promote staging files, create demand data, unlock packet intake, or authorize drafting/generation/publishing.

## Reviews

${lines}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const rows = reviewRows(root, runDate);
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    review_count: rows.length,
    by_import_status: countBy(rows, "import_status"),
    by_handoff_status: countBy(rows, "handoff_status"),
    rows,
  };

  const jsonPath = path.join(outputDir, "demand-import-review-rollup.json");
  const csvPath = path.join(outputDir, "demand-import-review-rollup.csv");
  const mdPath = path.join(outputDir, "demand-import-review-rollup.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, HEADERS, rows);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        review_count: rows.length,
        by_import_status: report.by_import_status,
        json_path: relative(root, jsonPath),
        markdown_path: relative(root, mdPath),
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
