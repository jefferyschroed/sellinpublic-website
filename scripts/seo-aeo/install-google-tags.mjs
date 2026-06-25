#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { requireValue } from "./lib/config.mjs";
import {
  configuredMeasurementId,
  GOOGLE_TAG_END as TAG_END,
  GOOGLE_TAG_START as TAG_START,
  renderGoogleTag,
} from "../blog/google-tag.mjs";
import {
  REB2B_TRACKING_END,
  REB2B_TRACKING_START,
  renderReb2bTracking,
} from "../site-head.mjs";

const VERIFY_START = "<!-- SEO_AEO_GSC_VERIFY_START -->";
const VERIFY_END = "<!-- SEO_AEO_GSC_VERIFY_END -->";

function verificationTag(token) {
  if (!token) return "";
  return `${VERIFY_START}
    <meta name="google-site-verification" content="${token}" />
    ${VERIFY_END}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceBlock(html, start, end, replacement) {
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`, "m");
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace(/<\/head>/i, `${replacement}\n  </head>`);
}

function removeBlock(html, start, end) {
  const pattern = new RegExp(`^[\\t ]*${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}[\\t ]*\\n?`, "m");
  return html.replace(pattern, "");
}

function installReb2bTracking(html) {
  const withoutExisting = removeBlock(html, REB2B_TRACKING_START, REB2B_TRACKING_END);
  const tracking = renderReb2bTracking();
  if (withoutExisting.includes(TAG_END)) {
    return withoutExisting.replace(TAG_END, `${TAG_END}\n    ${tracking}`);
  }
  return withoutExisting.replace(/<\/head>/i, `${tracking}\n  </head>`);
}

function collectHtmlFiles(root, relativePath, files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const stats = fs.statSync(absolutePath);
  if (stats.isFile()) {
    if (relativePath.endsWith(".html")) files.push(relativePath);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    collectHtmlFiles(root, path.join(relativePath, entry.name), files);
  }
}

function htmlFiles(root) {
  const files = [];
  for (const relativePath of ["index.html", "privacy", "terms", "for", "blog"]) {
    collectHtmlFiles(root, relativePath, files);
  }
  return Array.from(new Set(files)).sort();
}

function writeAtomic(filePath, value) {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, value);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const measurementId = requireValue(configuredMeasurementId(root), "Set GA4_MEASUREMENT_ID or google.ga4MeasurementId before installing the Google tag.");
  const verificationToken = process.env.GSC_VERIFICATION_TOKEN || "";
  const dryRun = process.argv.includes("--dry-run");
  const changed = [];

  for (const relativePath of htmlFiles(root)) {
    const absolutePath = path.join(root, relativePath);
    let html = fs.readFileSync(absolutePath, "utf8");
    html = replaceBlock(html, TAG_START, TAG_END, renderGoogleTag(measurementId));
    html = installReb2bTracking(html);
    if (verificationToken) html = replaceBlock(html, VERIFY_START, VERIFY_END, verificationTag(verificationToken));
    changed.push(relativePath);
    if (!dryRun) writeAtomic(absolutePath, html);
  }

  console.log(JSON.stringify({ ok: true, dryRun, measurementId, verificationInstalled: Boolean(verificationToken), changed }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
