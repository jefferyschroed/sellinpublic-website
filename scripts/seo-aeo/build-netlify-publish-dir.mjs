#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { assertNetlifyPublishConfigReady } from "./lib/netlify-publish-config.mjs";

const DEFAULT_OUTPUT = "outputs/netlify-publish";
const COPY_PATHS = [
  "index.html",
  "styles.css",
  "script.js",
  "privacy",
  "terms",
  "blog",
  "public",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
];
const FORBIDDEN_TOP_LEVEL = new Set([
  ".codex",
  ".git",
  ".netlify",
  "analytics",
  "automation-runs",
  "config",
  "content-packets",
  "docs",
  "imports",
  "outputs",
  "research",
  "scripts",
  "secrets",
  "worker-notes",
]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function copyPath(root, outDir, relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(outDir, relativePath);
  if (!fs.existsSync(source)) return { path: relativePath, copied: false, reason: "missing" };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    filter: (filePath) => !path.basename(filePath).startsWith(".DS_Store"),
  });
  return { path: relativePath, copied: true, reason: "" };
}

function listTopLevel(outDir) {
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir).sort();
}

function run() {
  const root = process.cwd();
  const outDir = path.resolve(root, arg("--out", DEFAULT_OUTPUT));
  if (outDir === root || !normalizePath(path.relative(root, outDir)).startsWith("outputs/")) {
    throw new Error("Publish output must be inside outputs/.");
  }
  assertNetlifyPublishConfigReady(root);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const copied = COPY_PATHS.map((relativePath) => copyPath(root, outDir, relativePath));
  const topLevel = listTopLevel(outDir);
  const forbidden = topLevel.filter((name) => FORBIDDEN_TOP_LEVEL.has(name));
  if (forbidden.length) {
    throw new Error(`Clean publish directory contains forbidden local-only paths: ${forbidden.join(", ")}`);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        output_dir: normalizePath(path.relative(root, outDir)),
        copied,
        top_level: topLevel,
        manual_netlify_command_if_approved: `npx --yes netlify-cli deploy --prod --dir ${normalizePath(path.relative(root, outDir))}`,
        rule: "This creates a clean static publish directory only. It does not deploy, commit, push, approve, or publish.",
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
