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

const VERIFY_START = "<!-- SEO_AEO_GSC_VERIFY_START -->";
const VERIFY_END = "<!-- SEO_AEO_GSC_VERIFY_END -->";

function verificationTag(token) {
  if (!token) return "";
  return `${VERIFY_START}
    <meta name="google-site-verification" content="${token}" />
    ${VERIFY_END}`;
}

function replaceBlock(html, start, end, replacement) {
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace(/<\/head>/i, `${replacement}\n  </head>`);
}

function htmlFiles(root) {
  const files = ["index.html", "blog/index.html"];
  const blogRoot = path.join(root, "blog");
  if (fs.existsSync(blogRoot)) {
    for (const entry of fs.readdirSync(blogRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join("blog", entry.name, "index.html");
      if (fs.existsSync(path.join(root, filePath))) files.push(filePath);
    }
  }
  return Array.from(new Set(files));
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
