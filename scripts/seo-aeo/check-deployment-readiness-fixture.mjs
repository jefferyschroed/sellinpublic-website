#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_DATE = "2099-01-20";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFiles(root, netlifyToml) {
  fs.writeFileSync(path.join(root, "netlify.toml"), netlifyToml);
  for (const filePath of ["index.html", "feed.xml", "sitemap.xml", "robots.txt"]) {
    fs.writeFileSync(path.join(root, filePath), `${filePath}\n`);
  }
  ensureDir(path.join(root, "blog/employee-generated-content-infrastructure"));
  fs.writeFileSync(path.join(root, "blog/index.html"), "blog index\n");
  fs.writeFileSync(path.join(root, "blog/employee-generated-content-infrastructure/index.html"), "blog post\n");
  ensureDir(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config/seo-aeo.config.json"), JSON.stringify({ site: { origin: "https://sellinpublic.co" } }, null, 2));
  ensureDir(path.join(root, "automation-runs", RUN_DATE));
  fs.writeFileSync(
    path.join(root, "automation-runs", RUN_DATE, "live-deployment-check.json"),
    JSON.stringify({ status: "blocked", route_count: 1, blocked_count: 1 }, null, 2)
  );
}

function runReadiness(repo, root) {
  return spawnSync(process.execPath, [path.join(repo, "scripts/seo-aeo/write-deployment-readiness.mjs"), "--date", RUN_DATE], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function readReport(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "automation-runs", RUN_DATE, "deployment-readiness.json"), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-deployment-readiness-"));
  try {
    writeFiles(
      tempRoot,
      `[build]
  publish = "."
`
    );
    let result = runReadiness(repo, tempRoot);
    let output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `readiness writer should emit a blocked report, not crash. Output: ${output}`);
    let report = readReport(tempRoot);
    assert(report.status === "blocked_unsafe_netlify_config", `expected blocked unsafe Netlify status, got ${report.status}`);
    assert(report.netlify.config.blocker.includes("netlify_publish_repo_root"), "expected root publish blocker.");

    fs.writeFileSync(
      path.join(tempRoot, "netlify.toml"),
      `[build]
  command = "node scripts/seo-aeo/build-netlify-publish-dir.mjs"
  publish = "outputs/netlify-publish"
`
    );
    result = runReadiness(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `readiness writer failed with clean config. Output: ${output}`);
    report = readReport(tempRoot);
    assert(report.netlify.config.status === "ready", `expected clean Netlify config ready, got ${report.netlify.config.status}`);

    console.log(JSON.stringify({ ok: true, fixture: "deployment-readiness-netlify-config" }, null, 2));
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
