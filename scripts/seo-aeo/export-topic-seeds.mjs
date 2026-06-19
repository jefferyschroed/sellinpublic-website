#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";
import { parseCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const HEADERS = [
  "observed_at",
  "topic",
  "query",
  "source_record_id",
  "pillar_id",
  "topic_id",
  "intent",
  "funnel_stage",
  "audience",
  "country",
  "language",
  "notes",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function hasText(value) {
  return String(value || "").trim() !== "";
}

function topicSeedRows(rows, runDate) {
  return rows
    .filter((row) => hasText(row.topic) || hasText(row.aeo_question))
    .map((row) => ({
      observed_at: row.date || runDate,
      topic: row.canonical_topic || row.topic || row.aeo_question,
      query: row.aeo_question || row.canonical_topic || row.topic,
      source_record_id: row.candidate_id || "",
      pillar_id: row.pillar_id || "",
      topic_id: row.topic_id || "",
      intent: row.intent || "",
      funnel_stage: "unknown",
      audience: "b2b_gtm_operator",
      country: "US",
      language: "en",
      notes: [
        "Generated from daily content plan topic candidates.",
        "Discovery-only topic seed.",
        "Does not validate demand or unlock packet intake.",
        row.next_action ? `Next action: ${row.next_action}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    }));
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const rows = topicSeedRows(readCsvRows(planPath), runDate);
  const outputDir = ensureDir(path.join(root, "imports", "topic-seeds"));
  const outputPath = path.join(outputDir, `${runDate}-daily-plan-topic-seeds.csv`);

  writeCsvAtomic(outputPath, HEADERS, rows);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        source_path: path.relative(root, planPath).split(path.sep).join("/"),
        output_path: path.relative(root, outputPath).split(path.sep).join("/"),
        rows: rows.length,
        evidence_use: "discovery_only",
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
