#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function findCandidateFiles(root, runDate) {
  const dirs = [
    path.join(root, "research", "daily-content-plan", runDate),
    path.join(root, "automation-runs", runDate),
  ];
  const files = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(md|json|ya?ml)$/i.test(entry.name)) continue;
      if (/learning[-_ ]?candidate|skill[-_ ]?steward/i.test(entryPath)) files.push(entryPath);
    }
  };
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    scan(dir);
  }
  return files.sort();
}

function containsLearningCandidate(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return /\blearning_candidate\b|\bcandidate_id\b[\s\S]*\btarget_skill\b/i.test(text);
}

function validateCandidateFile(root, filePath) {
  const result = spawnSync(process.execPath, ["scripts/seo-aeo/check-skill-learning.mjs", "--root", root, "--file", filePath], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    file: path.relative(root, filePath).split(path.sep).join("/"),
    status: result.status === 0 ? "valid" : "invalid",
    exit_code: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function writeMarkdown(filePath, report) {
  const validationLines = report.validations
    .map((item) => `- ${item.file}: ${item.status}`)
    .join("\n");
  const markdown = `# Skill Steward Closeout

Run date: ${report.run_date}
Decision: ${report.decision}

## Summary

- Learning candidate files found: ${report.learning_candidate_files.length}
- Valid reusable candidates: ${report.valid_candidate_count}
- Invalid or one-off candidates: ${report.invalid_candidate_count}

## Validation

${validationLines || "- No learning candidates were present. No skill or SOP change proposed."}

## Rule

No repo-local skill, global skill, writing skill, or SOP is changed from a single weak QA finding. Promotion still requires evidence, validation, forward testing, and human approval.
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const candidateFiles = findCandidateFiles(root, runDate).filter(containsLearningCandidate);
  const validations = candidateFiles.map((filePath) => validateCandidateFile(root, filePath));
  const validCount = validations.filter((item) => item.status === "valid").length;
  const invalidCount = validations.filter((item) => item.status === "invalid").length;
  const report = {
    run_date: runDate,
    generated_at: new Date().toISOString(),
    decision: validCount ? "review_valid_learning_candidates" : "no_skill_change_proposed",
    learning_candidate_files: candidateFiles.map((filePath) => path.relative(root, filePath).split(path.sep).join("/")),
    valid_candidate_count: validCount,
    invalid_candidate_count: invalidCount,
    validations,
  };

  writeJsonAtomic(path.join(outputDir, "skill-steward-closeout.json"), report);
  writeMarkdown(path.join(outputDir, "skill-steward-closeout.md"), report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(invalidCount ? 1 : 0);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
