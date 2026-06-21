#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, envOrConfig, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { configuredMeasurementId } from "../blog/google-tag.mjs";
import { hasSiteFavicon, SITE_FAVICON_PATH } from "../site-head.mjs";

const DEFAULT_OUT_DIR = "outputs/netlify-publish";
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

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function fileState(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const exists = fs.existsSync(absolutePath);
  return {
    path: normalizePath(relativePath),
    exists,
    size: exists && fs.statSync(absolutePath).isFile() ? fs.statSync(absolutePath).size : 0,
  };
}

function outPathForUrl(outDir, url) {
  const parsed = new URL(url);
  if (parsed.pathname === "/" || parsed.pathname === "") return path.join(outDir, "index.html");
  if (parsed.pathname.endsWith("/")) return path.join(outDir, parsed.pathname, "index.html");
  return path.join(outDir, parsed.pathname);
}

function sitemapUrls(outDir, origin) {
  const urls = [origin, `${origin}/sitemap.xml`, `${origin}/feed.xml`, `${origin}/robots.txt`];
  const sitemapPath = path.join(outDir, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return urls;
  const source = fs.readFileSync(sitemapPath, "utf8");
  for (const match of source.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
    urls.push(match[1].trim());
  }
  return Array.from(new Set(urls.filter(Boolean).map((url) => {
    const parsed = new URL(url);
    const canonicalOrigin = new URL(origin);
    parsed.protocol = canonicalOrigin.protocol;
    parsed.host = canonicalOrigin.host;
    return parsed.toString();
  })));
}

function topLevelEntries(outDir) {
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir).sort();
}

function runBuild(root) {
  const result = spawnSync(process.execPath, ["scripts/seo-aeo/build-netlify-publish-dir.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status,
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function routeStatus({ exists, size, ga4Required, ga4Present, faviconRequired, faviconPresent }) {
  if (!exists || size <= 0) return "blocked_missing_output_route";
  if (ga4Required && !ga4Present) return "blocked_missing_ga4_tag";
  if (faviconRequired && !faviconPresent) return "blocked_missing_favicon";
  return "ok";
}

function writeMarkdown(filePath, report) {
  const routeLines = report.routes
    .map(
      (route) =>
        `- ${route.status}: ${route.url} -> ${route.local_path} (${route.size} bytes; GA4 ${
          route.ga4_required ? (route.ga4_present ? "present" : "missing") : "not_required"
        }; favicon ${route.favicon_required ? (route.favicon_present ? "present" : "missing") : "not_required"})`
    )
    .join("\n");
  const forbiddenLines = report.forbidden_top_level.length
    ? report.forbidden_top_level.map((item) => `- ${item}`).join("\n")
    : "- None.";
  const markdown = `# Netlify Publish Directory Check

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Status: ${report.status}
Output directory: ${report.output_dir}
GA4 Measurement ID: ${report.ga4_measurement_id || "missing"}
Required favicon: ${report.required_favicon}

## Routes

${routeLines || "- None."}

## Forbidden Top-Level Entries

${forbiddenLines}

## Build

- Ran build: ${report.build.ran}
- Build status: ${report.build.status ?? "n/a"}

## Next Action

${report.next_action}
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const config = loadConfig(root);
  const runDate = arg("--date", today());
  const outDir = path.resolve(root, arg("--out", DEFAULT_OUT_DIR));
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const origin = String(arg("--origin", envOrConfig("SITE_ORIGIN", config.site?.origin, "https://sellinpublic.co"))).replace(/\/+$/, "");
  const measurementId = configuredMeasurementId(root);
  const shouldBuild = hasFlag("--build");
  const failOnBlocked = hasFlag("--fail-on-blocked");
  const build = shouldBuild ? runBuild(root) : { ran: false, status: null, ok: true, output: "" };
  build.ran = shouldBuild;

  const outRelative = relative(root, outDir);
  const outputDirSafe = outRelative.startsWith("outputs/") && outDir !== root;
  const topLevel = topLevelEntries(outDir);
  const forbiddenTopLevel = topLevel.filter((name) => FORBIDDEN_TOP_LEVEL.has(name));
  const urls = sitemapUrls(outDir, origin);
  const routes = urls.map((url) => {
    const parsed = new URL(url);
    const localPath = outPathForUrl(outDir, url);
    const localRelative = relative(root, localPath);
    const state = fileState(root, localRelative);
    const ga4Required = parsed.pathname === "/" || parsed.pathname.endsWith("/");
    const body = state.exists && state.size > 0 ? fs.readFileSync(localPath, "utf8") : "";
    const ga4Present = measurementId ? body.includes(measurementId) : false;
    const faviconRequired = ga4Required;
    const faviconPresent = hasSiteFavicon(body);
    return {
      url,
      path: parsed.pathname,
      local_path: state.path,
      exists: state.exists,
      size: state.size,
      ga4_required: ga4Required,
      ga4_present: ga4Present,
      favicon_required: faviconRequired,
      favicon_present: faviconPresent,
      status: routeStatus({ exists: state.exists, size: state.size, ga4Required, ga4Present, faviconRequired, faviconPresent }),
    };
  });
  const blockedRoutes = routes.filter((route) => route.status !== "ok");
  const blockers = [];
  if (!outputDirSafe) blockers.push("output_dir_not_under_outputs");
  if (shouldBuild && !build.ok) blockers.push("publish_build_failed");
  if (!fs.existsSync(outDir)) blockers.push("publish_dir_missing");
  if (forbiddenTopLevel.length) blockers.push("forbidden_top_level_entries");
  if (blockedRoutes.length) blockers.push("blocked_routes");

  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status: blockers.length ? "blocked" : "ready",
    output_dir: outRelative,
    output_dir_safe: outputDirSafe,
    origin,
    ga4_measurement_id: measurementId,
    required_favicon: SITE_FAVICON_PATH,
    build,
    top_level: topLevel,
    forbidden_top_level: forbiddenTopLevel,
    route_count: routes.length,
    blocked_count: blockedRoutes.length,
    blockers,
    routes,
    next_action: blockers.length
      ? "Build the clean Netlify publish directory and fix blocked routes, GA4 tags, or favicons before any approved deploy."
      : "Clean Netlify publish directory is ready for a human-approved deploy path.",
  };

  const jsonPath = path.join(outputDir, "netlify-publish-check.json");
  const mdPath = path.join(outputDir, "netlify-publish-check.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: report.status,
        route_count: report.route_count,
        blocked_count: report.blocked_count,
        blockers: report.blockers,
        netlify_publish_check_json: relative(root, jsonPath),
        netlify_publish_check_md: relative(root, mdPath),
      },
      null,
      2
    )
  );
  if (failOnBlocked && blockers.length) process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
