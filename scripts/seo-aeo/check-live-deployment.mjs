#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, envOrConfig, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";
import { configuredMeasurementId } from "../blog/google-tag.mjs";

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

function localPathForUrl(root, url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  if (pathname === "/" || pathname === "") return path.join(root, "index.html");
  if (pathname.endsWith("/")) return path.join(root, pathname, "index.html");
  return path.join(root, pathname);
}

function sitemapUrls(root, origin) {
  const sitemapPath = path.join(root, "sitemap.xml");
  const required = [origin, `${origin}/sitemap.xml`, `${origin}/feed.xml`, `${origin}/robots.txt`];
  if (!fs.existsSync(sitemapPath)) return required;
  const xml = fs.readFileSync(sitemapPath, "utf8");
  const urls = Array.from(xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)).map((match) => match[1].trim());
  return [...required, ...urls].filter(Boolean);
}

async function fetchText(url) {
  const timeoutMs = Number(arg("--timeout-ms", "15000"));
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "SellInPublic-SEO-AEO-live-deployment-check/1.0",
      connection: "close",
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    http_status: response.status,
    content_type: response.headers.get("content-type") || "",
    final_url: response.url || url,
    body: text,
  };
}

function statusFor({ routeOk, tagRequired, tagPresent }) {
  if (!routeOk) return "blocked_route_not_live";
  if (tagRequired && !tagPresent) return "blocked_missing_ga4_tag";
  return "ok";
}

function writeMarkdown(filePath, report) {
  const lines = report.routes
    .map(
      (route) =>
        `- ${route.status}: ${route.url} (${route.http_status || "n/a"}; local ${route.local_exists ? "exists" : "missing"}; GA4 ${route.ga4_required ? (route.ga4_present ? "present" : "missing") : "not_required"})`
    )
    .join("\n");
  const markdown = `# Live Deployment Check

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Origin: ${report.origin}
Status: ${report.status}
GA4 Measurement ID: ${report.ga4_measurement_id || "missing"}

## Routes

${lines || "- None."}

## Next Action

${report.next_action}
`;
  fs.writeFileSync(filePath, markdown);
}

async function run() {
  const root = process.cwd();
  const config = loadConfig(root);
  const runDate = arg("--date", today());
  const origin = String(arg("--origin", envOrConfig("SITE_ORIGIN", config.site?.origin, "https://sellinpublic.co"))).replace(/\/+$/, "");
  const failOnBlocked = process.argv.includes("--fail-on-blocked");
  const measurementId = configuredMeasurementId(root);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const urls = Array.from(new Set(sitemapUrls(root, origin).map((url) => {
    const parsed = new URL(url);
    parsed.protocol = new URL(origin).protocol;
    parsed.host = new URL(origin).host;
    return parsed.toString();
  })));
  const routes = [];

  for (const url of urls) {
    const parsed = new URL(url);
    const localPath = localPathForUrl(root, url);
    const localExists = fs.existsSync(localPath);
    const ga4Required = parsed.pathname === "/" || parsed.pathname.endsWith("/");
    try {
      const fetched = await fetchText(url);
      const ga4Present = measurementId ? fetched.body.includes(measurementId) : false;
      routes.push({
        url,
        path: parsed.pathname,
        local_path: localExists ? relative(root, localPath) : relative(root, localPath),
        local_exists: localExists,
        http_status: fetched.http_status,
        content_type: fetched.content_type,
        final_url: fetched.final_url,
        ga4_required: ga4Required,
        ga4_present: ga4Present,
        status: statusFor({ routeOk: fetched.ok, tagRequired: ga4Required, tagPresent: ga4Present }),
      });
    } catch (error) {
      routes.push({
        url,
        path: parsed.pathname,
        local_path: relative(root, localPath),
        local_exists: localExists,
        http_status: "",
        content_type: "",
        final_url: "",
        ga4_required: ga4Required,
        ga4_present: false,
        status: "blocked_fetch_error",
        error: error.message,
      });
    }
  }

  const blocked = routes.filter((route) => route.status !== "ok");
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    origin,
    status: blocked.length ? "blocked" : "ready",
    ga4_measurement_id: measurementId,
    route_count: routes.length,
    blocked_count: blocked.length,
    routes,
    next_action: blocked.length
      ? "Deploy approved static output through the Git-connected deploy or the clean outputs/netlify-publish directory, then rerun this check until the homepage, blog index, blog posts, sitemap, and GA4 tag are live."
      : "Live deployment matches the local SEO/AEO route and measurement expectations.",
  };
  const jsonPath = path.join(outputDir, "live-deployment-check.json");
  const mdPath = path.join(outputDir, "live-deployment-check.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        status: report.status,
        route_count: report.route_count,
        blocked_count: report.blocked_count,
        live_deployment_check_json: relative(root, jsonPath),
        live_deployment_check_md: relative(root, mdPath),
      },
      null,
      2
    )
  );
  if (failOnBlocked && blocked.length) process.exit(1);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
