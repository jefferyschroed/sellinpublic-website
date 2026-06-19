#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-02-02";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, source) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, source);
}

function candidateYaml(id, sourcePath = "docs/seo-aeo/daily-operating-system.md") {
  return `# Fixture Candidate

\`\`\`yaml
learning_candidate:
  candidate_id: "${id}"
  date: "${RUN_DATE}"
  source_type: qa
  source_path: "${sourcePath}"
  observed_problem: "A repeated process issue needs a scoped reusable guard."
  affected_workflow: "skill steward closeout scoping"
  target_skill: "docs/seo-aeo/daily-operating-system.md"
  root_cause: "Generated review artifacts were previously scanned as candidate sources."
  evidence:
    - "First fixture evidence item."
    - "Second fixture evidence item."
  repeat_count: 2
  reusability_classification: reusable_process_change
  proposed_change: "Scan only source learning candidates and the learning-candidates directory."
  risk: "Could miss incorrectly located candidate files."
  reviewer: "Codex"
\`\`\`
`;
}

function writeFixture(root) {
  writeFile(path.join(root, "docs/seo-aeo/daily-operating-system.md"), "# Fixture Daily Operating System\n");
  writeFile(
    path.join(root, "research/daily-content-plan", RUN_DATE, "skill-steward-source.md"),
    candidateYaml("fixture-source-candidate")
  );
  writeFile(
    path.join(root, "automation-runs", RUN_DATE, "learning-candidates", "fixture-runtime.yaml"),
    candidateYaml("fixture-runtime-candidate")
  );
  writeFile(
    path.join(root, "automation-runs", RUN_DATE, "skill-steward-review-tasks", "prompts", "review.prompt.md"),
    `Task ID: fixture
candidate_id: fixture-source-candidate
target_skill: docs/seo-aeo/daily-operating-system.md
`
  );
  writeFile(
    path.join(root, "automation-runs", RUN_DATE, "skill-steward-review-tasks", "reports", "review.md"),
    `# Skill Steward Review

status: approve_for_human_review
candidate_id: fixture-source-candidate
target_skill: docs/seo-aeo/daily-operating-system.md
`
  );
  writeFile(path.join(root, "automation-runs", RUN_DATE, "skill-steward-review-tasks", "tasks.json"), '{"candidate_id":"fixture"}\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCloseout(repo, root) {
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "scripts/seo-aeo/write-skill-steward-closeout.mjs"), "--date", RUN_DATE],
    { cwd: root, encoding: "utf8", env: process.env }
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0) throw new Error(`closeout failed: ${output}`);
  return JSON.parse(output);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-skill-closeout-scope-"));
  try {
    writeFixture(tempRoot);
    const report = runCloseout(repo, tempRoot);
    assert(report.valid_candidate_count === 2, `expected 2 valid candidates, got ${report.valid_candidate_count}`);
    assert(report.invalid_candidate_count === 0, `expected 0 invalid candidates, got ${report.invalid_candidate_count}`);
    assert(report.learning_candidate_files.length === 2, `expected 2 candidate files, got ${report.learning_candidate_files.length}`);
    assert(
      report.learning_candidate_files.every((file) => !file.includes("skill-steward-review-tasks")),
      "review task prompts/reports must not be scanned as learning candidates"
    );
    console.log(JSON.stringify({ ok: true, fixture: "skill-steward-closeout-scope" }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
