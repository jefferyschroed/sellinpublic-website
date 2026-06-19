#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseYaml } from "../blog/packet.mjs";
import { parseCsv, readCsv, writeCsvAtomic } from "./lib/csv.mjs";

const HEADERS = ["date", "url", "channel", "impressions", "clicks", "ctr", "avg_position", "sessions", "conversions", "notes", "action"];

function listPackets(root) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot)) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetRoot, entry.name));
}

function noteValue(notes, key) {
  const pattern = new RegExp(`${key}=([^;]+)`);
  return String(notes || "").match(pattern)?.[1]?.trim() || "";
}

function rowIdentity(row) {
  const sourceIdentity =
    row.source_export_id ||
    row.source_file ||
    noteValue(row.notes, "source_export_id") ||
    noteValue(row.notes, "query") ||
    row.notes ||
    "";
  return [row.date, row.url, row.channel, row.action || "monitor", sourceIdentity].join("\u0001");
}

function stableDedupe(rows) {
  const byIdentity = new Map();
  for (const row of rows.filter(Boolean)) {
    byIdentity.set(rowIdentity(row), row);
  }
  return Array.from(byIdentity.values()).sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare) return dateCompare;
    const urlCompare = String(a.url || "").localeCompare(String(b.url || ""));
    if (urlCompare) return urlCompare;
    return String(a.channel || "").localeCompare(String(b.channel || ""));
  });
}

function run() {
  const root = process.cwd();
  const pageRows = readCsv(path.join(root, "analytics", "page_daily.csv")).rows;
  const queryRows = readCsv(path.join(root, "analytics", "search_query_daily.csv")).rows;
  const outputs = [];

  for (const packetDir of listPackets(root)) {
    const metaPath = path.join(packetDir, "publish-meta.yaml");
    if (!fs.existsSync(metaPath)) continue;
    const meta = parseYaml(fs.readFileSync(metaPath, "utf8"));
    if (!meta.slug || !meta.canonical_url) continue;
    const pageMatches = pageRows.filter((row) => row.slug === meta.slug || row.page_url === meta.canonical_url);
    const queryMatches = queryRows.filter((row) => row.slug === meta.slug || row.page_url === meta.canonical_url);
    const current = readCsv(path.join(packetDir, "performance-log.csv"), HEADERS);
    const existing = current.rows;

    const nextRows = [
      ...existing,
      ...pageMatches.map((row) => ({
        date: row.date,
        url: row.page_url || meta.canonical_url,
        channel: "organic_search_and_site",
        impressions: row.gsc_impressions || row.bing_impressions || "",
        clicks: row.gsc_clicks || row.bing_clicks || "",
        ctr: row.gsc_ctr || row.bing_ctr || "",
        avg_position: row.gsc_avg_position || row.bing_avg_position || "",
        sessions: row.ga4_sessions || "",
        conversions: row.ga4_conversions || "",
        notes: `source_export_id=${row.source_export_id || ""}; health=${row.content_health_score || ""}; refresh=${row.refresh_priority_score || ""}; decision_evidence=${row.decision_evidence_status || ""}; evidence_dates=${row.decision_evidence_date_count || ""}/${row.decision_evidence_required_date_count || ""}`,
        action: "monitor",
      })),
      ...queryMatches.map((row) => ({
        date: row.date,
        url: row.page_url || meta.canonical_url,
        channel: row.source || "search_query",
        impressions: row.impressions || "",
        clicks: row.clicks || "",
        ctr: row.ctr || "",
        avg_position: row.avg_position || "",
        sessions: "",
        conversions: "",
        notes: `query=${row.query}; intent=${row.search_intent}; action=${row.content_action}`,
        action: row.content_action || "monitor",
      })),
    ];

    const deduped = stableDedupe(nextRows);
    writeCsvAtomic(path.join(packetDir, "performance-log.csv"), HEADERS, deduped);
    outputs.push({ packet: path.basename(packetDir), rows: deduped.length, added: deduped.length - existing.length });
  }

  console.log(JSON.stringify({ ok: true, outputs }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
