#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOOGLE_TAG = "G-QCYHK55RCG";
const FAVICON_LINK = '<link rel="icon" href="/public/assets/brand/hashtagiconlight.webp" type="image/webp" sizes="any" />';
const INDEXNOW_KEY_FILE = "ef8b84f315281bb097c56c3418cc2887.txt";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeStaticSite(root, netlifyToml) {
  fs.writeFileSync(path.join(root, "netlify.toml"), netlifyToml);
  for (const filePath of ["index.html", "styles.css", "script.js", "feed.xml", "sitemap.xml", "robots.txt"]) {
    fs.writeFileSync(path.join(root, filePath), `${filePath}\n`);
  }
  fs.writeFileSync(path.join(root, INDEXNOW_KEY_FILE), "ef8b84f315281bb097c56c3418cc2887\n");
  ensureDir(path.join(root, "blog/example"));
  fs.writeFileSync(path.join(root, "blog/index.html"), "blog index\n");
  fs.writeFileSync(path.join(root, "blog/example/index.html"), "blog post\n");
  fs.writeFileSync(
    path.join(root, "sitemap.xml"),
    `<urlset>
  <url><loc>https://sellinpublic.co</loc></url>
  <url><loc>https://sellinpublic.co/</loc></url>
  <url><loc>https://sellinpublic.co/blog/</loc></url>
  <url><loc>https://sellinpublic.co/blog/example/</loc></url>
</urlset>
`
  );
  ensureDir(path.join(root, "public/assets/blog"));
  fs.writeFileSync(path.join(root, "public/assets/blog/example.txt"), "asset\n");
  ensureDir(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs/secret.md"), "must not publish\n");
}

function runBuilder(repo, root) {
  return spawnSync(process.execPath, [path.join(repo, "scripts/seo-aeo/build-netlify-publish-dir.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function runPublishCheck(repo, root) {
  return spawnSync(process.execPath, [path.join(repo, "scripts/seo-aeo/check-netlify-publish-dir.mjs"), "--date", "2099-01-20"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const repo = repoRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sellinpublic-netlify-publish-"));
  try {
    writeStaticSite(
      tempRoot,
      `[build]
  command = "node scripts/seo-aeo/build-netlify-publish-dir.mjs"
  publish = "outputs/netlify-publish"
`
    );
    let result = runBuilder(repo, tempRoot);
    let output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected clean publish build to pass. Output: ${output}`);
    const topLevel = fs.readdirSync(path.join(tempRoot, "outputs/netlify-publish")).sort();
    assert(topLevel.includes("index.html"), "expected index.html in clean publish output.");
    assert(topLevel.includes(INDEXNOW_KEY_FILE), "expected IndexNow key file in clean publish output.");
    assert(!topLevel.includes("docs"), "clean publish output must not include docs.");

    result = runPublishCheck(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected publish check to write a blocked report. Output: ${output}`);
    let report = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs/2099-01-20/netlify-publish-check.json"), "utf8"));
    assert(report.status === "blocked", `expected missing GA4 tags to block publish check, got ${report.status}`);
    assert(report.blockers.includes("blocked_routes"), "expected blocked routes from missing GA4 tags.");

    fs.writeFileSync(path.join(tempRoot, "index.html"), `index ${GOOGLE_TAG} ${FAVICON_LINK}\n`);
    fs.writeFileSync(path.join(tempRoot, "blog/index.html"), `blog index ${GOOGLE_TAG} ${FAVICON_LINK}\n`);
    fs.writeFileSync(path.join(tempRoot, "blog/example/index.html"), `blog post ${GOOGLE_TAG} ${FAVICON_LINK}\n`);
    result = runBuilder(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected tagged publish build to pass. Output: ${output}`);
    result = runPublishCheck(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 0, `expected tagged publish check to pass. Output: ${output}`);
    report = JSON.parse(fs.readFileSync(path.join(tempRoot, "automation-runs/2099-01-20/netlify-publish-check.json"), "utf8"));
    assert(report.status === "ready", `expected tagged publish check ready, got ${report.status}`);
    const routeUrls = report.routes.map((route) => route.url);
    assert(routeUrls.length === new Set(routeUrls).size, "publish check must not include duplicate route URLs.");
    assert(
      routeUrls.filter((url) => url === "https://sellinpublic.co/").length === 1,
      "publish check should canonicalize homepage URL once."
    );

    fs.rmSync(path.join(tempRoot, "outputs"), { recursive: true, force: true });
    fs.writeFileSync(
      path.join(tempRoot, "netlify.toml"),
      `[build]
  publish = "."
`
    );
    result = runBuilder(repo, tempRoot);
    output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    assert(result.status === 1, `expected root publish config to fail. Output: ${output}`);
    assert(output.includes("never the repo root"), `expected fail-closed root-publish message. Output: ${output}`);

    console.log(JSON.stringify({ ok: true, fixture: "netlify-publish-dir" }, null, 2));
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
