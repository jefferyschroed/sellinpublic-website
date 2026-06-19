#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today, validateIsoDate } from "./lib/dates.mjs";

const HEADERS = [
  "date",
  "candidate_id",
  "topic",
  "topic_id",
  "target_slug",
  "target_resolution_status",
  "packet_path",
  "brief_path",
  "publish_meta_path",
  "refresh_notes_path",
  "current_status",
  "recommended_next_action",
  "blockers",
];

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

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function coverageByTopicId(root) {
  const coveragePath = path.join(root, "docs", "seo-aeo", "topic-coverage.csv");
  const { rows } = readCsv(coveragePath);
  return new Map(rows.filter((row) => row.topic_id).map((row) => [row.topic_id, row]));
}

function isRefreshCandidate(row) {
  return [row.asset_decision, row.strategic_asset_decision, row.recommended_asset]
    .map(normalizeToken)
    .includes("refresh");
}

function isPublishedCoverage(row, coverage) {
  return [row.coverage_status, coverage?.status]
    .map(normalizeToken)
    .some((status) => ["published", "published_draft", "published_draft_ready"].includes(status));
}

function packetDirs(root) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot)) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetRoot, entry.name))
    .sort();
}

function packetSlug(packetDir) {
  const publishMetaPath = path.join(packetDir, "publish-meta.yaml");
  const briefPath = path.join(packetDir, "brief.yaml");
  return readYamlScalar(publishMetaPath, "slug") || readYamlScalar(briefPath, "slug") || path.basename(packetDir).replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function packetStatus(packetDir, coverage) {
  const publishMetaPath = path.join(packetDir, "publish-meta.yaml");
  const briefPath = path.join(packetDir, "brief.yaml");
  return readYamlScalar(publishMetaPath, "status") || readYamlScalar(briefPath, "status") || coverage?.status || "";
}

function matchingPackets(root, targetSlug) {
  if (!targetSlug) return [];
  return packetDirs(root).filter((packetDir) => packetSlug(packetDir) === targetSlug);
}

function targetSlugFor(row, coverage) {
  return slugify(coverage?.slug || row.slug || row.topic);
}

function resolveRow(root, runDate, row, coverageRows) {
  const coverage = coverageRows.get(row.topic_id || "");
  const targetSlug = targetSlugFor(row, coverage);
  const blockers = [];

  if (!coverage) blockers.push("topic_coverage_missing");
  if (!isPublishedCoverage(row, coverage)) blockers.push("coverage_not_published");
  if (!targetSlug) blockers.push("target_slug_missing");

  const matches = targetSlug ? matchingPackets(root, targetSlug) : [];
  if (matches.length === 0) blockers.push("matching_packet_missing");
  if (matches.length > 1) blockers.push("multiple_matching_packets");

  const packetDir = matches.length === 1 ? matches[0] : "";
  const briefPath = packetDir ? path.join(packetDir, "brief.yaml") : "";
  const publishMetaPath = packetDir ? path.join(packetDir, "publish-meta.yaml") : "";
  const refreshNotesPath = packetDir ? path.join(packetDir, "refresh-notes.md") : "";

  if (packetDir && !fs.existsSync(briefPath)) blockers.push("brief_missing");
  if (packetDir && !fs.existsSync(publishMetaPath)) blockers.push("publish_meta_missing");
  if (packetDir && !fs.existsSync(refreshNotesPath)) blockers.push("refresh_notes_missing");

  const resolved = blockers.length === 0;
  return {
    date: runDate,
    candidate_id: row.candidate_id || "",
    topic: row.topic || "",
    topic_id: row.topic_id || "",
    target_slug: targetSlug,
    target_resolution_status: resolved ? "resolved" : "blocked",
    packet_path: packetDir ? relative(root, packetDir) : "",
    brief_path: briefPath ? relative(root, briefPath) : "",
    publish_meta_path: publishMetaPath ? relative(root, publishMetaPath) : "",
    refresh_notes_path: refreshNotesPath ? relative(root, refreshNotesPath) : "",
    current_status: packetDir ? packetStatus(packetDir, coverage) : coverage?.status || "",
    recommended_next_action: resolved
      ? "do_not_scaffold; reopen only after Analytics Feedback, route QA, and Orchestrator scope approval"
      : "resolve blockers before refresh; do not scaffold a duplicate packet",
    blockers: blockers.join("|"),
  };
}

function writeMarkdown(filePath, report) {
  const lines = report.rows
    .map((row) => {
      const target = row.packet_path ? `\`${row.packet_path}\`` : "no target";
      const blockers = row.blockers ? ` Blockers: ${row.blockers}.` : "";
      return `- ${row.candidate_id}: ${row.target_resolution_status} -> ${target}. ${row.recommended_next_action}.${blockers}`;
    })
    .join("\n");
  const markdown = `# Refresh Targets

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Refresh candidates: ${report.row_count}
Resolved: ${report.resolved_count}
Blocked: ${report.blocked_count}

## Rule

Refresh candidates update or reopen existing packets only. This artifact does not authorize drafting, generation, publishing, or distribution. If a refresh target is blocked or ambiguous, do not create a new packet as a substitute.

## Targets

${lines || "- No refresh candidates found."}
`;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = validateIsoDate(arg("--date", today()), "--date");
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const { rows } = fs.existsSync(planPath) ? parseCsv(fs.readFileSync(planPath, "utf8")) : { rows: [] };
  const coverageRows = coverageByTopicId(root);
  const refreshRows = rows.filter(isRefreshCandidate);
  const resolvedRows = refreshRows.map((row) => resolveRow(root, runDate, row, coverageRows));
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    source_path: fs.existsSync(planPath) ? relative(root, planPath) : "",
    row_count: resolvedRows.length,
    resolved_count: resolvedRows.filter((row) => row.target_resolution_status === "resolved").length,
    blocked_count: resolvedRows.filter((row) => row.target_resolution_status !== "resolved").length,
    rows: resolvedRows,
  };

  const jsonPath = path.join(outputDir, "refresh-targets.json");
  const csvPath = path.join(outputDir, "refresh-targets.csv");
  const mdPath = path.join(outputDir, "refresh-targets.md");
  writeJsonAtomic(jsonPath, report);
  writeCsvAtomic(csvPath, HEADERS, resolvedRows);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        row_count: report.row_count,
        resolved_count: report.resolved_count,
        blocked_count: report.blocked_count,
        json_path: relative(root, jsonPath),
        csv_path: relative(root, csvPath),
        markdown_path: relative(root, mdPath),
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
