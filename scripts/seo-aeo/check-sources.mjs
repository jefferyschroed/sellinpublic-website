#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const HEADERS = [
  "checked_at",
  "packet_id",
  "source_id",
  "url",
  "title",
  "publisher",
  "reliability",
  "status",
  "http_status",
  "content_type",
  "final_url",
  "error",
  "recommended_action",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function listPacketDirs(root) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot)) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetRoot, entry.name))
    .sort();
}

async function checkUrl(url) {
  if (url.startsWith("https://sellinpublic.co/")) {
    return { status: "internal_reference", http_status: "", content_type: "", final_url: url, error: "" };
  }
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return {
      status: response.ok ? "ok" : "review",
      http_status: response.status,
      content_type: response.headers.get("content-type") || "",
      final_url: response.url || url,
      error: "",
    };
  } catch (error) {
    return {
      status: "error",
      http_status: "",
      content_type: "",
      final_url: "",
      error: error.message,
    };
  }
}

function actionFor(result) {
  if (result.status === "ok" || result.status === "internal_reference") return "none";
  if (result.status === "review") return "review_source_or_replace";
  return "find_replacement_source";
}

async function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "research", "source-checks", runDate));
  const rows = [];

  for (const packetDir of listPacketDirs(root)) {
    const citationsPath = path.join(packetDir, "citations.json");
    if (!fs.existsSync(citationsPath)) continue;
    const packetId = path.basename(packetDir);
    const citations = JSON.parse(fs.readFileSync(citationsPath, "utf8"));
    if (!Array.isArray(citations)) continue;
    for (const source of citations) {
      if (!source.url) continue;
      const result = await checkUrl(source.url);
      rows.push({
        checked_at: new Date().toISOString(),
        packet_id: packetId,
        source_id: source.id,
        url: source.url,
        title: source.title || "",
        publisher: source.publisher || "",
        reliability: source.reliability || "",
        ...result,
        recommended_action: actionFor(result),
      });
    }
  }

  writeCsvAtomic(path.join(outputDir, "source-checks.csv"), HEADERS, rows);
  console.log(JSON.stringify({ ok: true, runDate, checked: rows.length, outputDir }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
