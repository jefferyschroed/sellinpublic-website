#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED: "" },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  assert(result.status === 0, `${args.join(" ")} failed: ${output}`);
  return output;
}

function run() {
  const root = process.cwd();
  const runnerSource = fs.readFileSync(path.join(root, "scripts", "seo-aeo", "daily-runner.mjs"), "utf8");
  const redditIndex = runnerSource.indexOf('"Pull Reddit discovery trends"');
  const rssIndex = runnerSource.indexOf('"Pull Google Trends RSS discovery trends"');
  const publicIndex = runnerSource.indexOf('"Pull public source discovery trends"');
  assert(redditIndex >= 0, "daily runner should include the Reddit discovery step so disabled/skipped state is explicit.");
  assert(rssIndex > redditIndex, "daily runner should pull/skip Google Trends RSS after the Reddit lane.");
  assert(publicIndex > rssIndex, "daily runner should run public source discovery after Google Trends RSS.");

  const output = runNode(root, ["scripts/seo-aeo/pull-google-trends-rss.mjs", "--date", "2099-01-12", "--dry-run"]);
  const result = JSON.parse(output);
  assert(result.ok === true, "Google Trends RSS dry-run should exit cleanly.");
  assert(result.skipped === true, "Google Trends RSS should be disabled by default.");
  assert(result.rows_after_filter === 0, "disabled Google Trends RSS run should not collect rows.");
  assert(
    result.reason.includes("googleTrendsRss.enabled is false"),
    "disabled Google Trends RSS run should explain the explicit enable gate."
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixture: "google_trends_rss_lane",
        default_skipped: true,
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
