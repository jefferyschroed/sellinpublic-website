#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";
import { parseCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const OUTPUT_HEADERS = [
  "query_id",
  "source_id",
  "source_type",
  "query",
  "normalized_query",
  "intent",
  "funnel_stage",
  "pillar_id",
  "topic_id",
  "surface",
  "country",
  "language",
  "observed_at",
  "volume",
  "difficulty",
  "evidence_use",
  "notes",
];

function pick(row, names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase().trim() === name.toLowerCase());
    if (found && found[1]) return found[1];
  }
  return "";
}

function classify(query) {
  const text = String(query).toLowerCase();
  if (/vs|versus|alternative|compare/.test(text)) return "comparison";
  if (/what is|definition|meaning/.test(text)) return "definition";
  if (/how to|how do|steps|template/.test(text)) return "how_to";
  if (/example|case study/.test(text)) return "example";
  if (/measure|roi|metric/.test(text)) return "measurement";
  return "unknown";
}

function mapPillar(query) {
  const text = String(query).toLowerCase();
  if (/linkedin/.test(text)) return "pillar-linkedin-led-gtm";
  if (/measure|roi|metric|analytics|citation/.test(text)) return "pillar-measurement-learning";
  if (/example|case study|clay|lovable|gitlab/.test(text)) return "pillar-examples-case-studies";
  if (/workflow|review|expertise|notes/.test(text)) return "pillar-content-operations";
  return "pillar-employee-generated-content";
}

function normalizeQuery(query) {
  return String(query).toLowerCase().replace(/\s+/g, " ").trim();
}

function run() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const inputPath = args[0];
  if (!inputPath) {
    throw new Error("Usage: node scripts/seo-aeo/import-query-export.mjs imports/query-exports/file.csv [source_type]");
  }
  const sourceType = args[1] || "approved_query_export";
  const runDate = today();
  const outputDir = ensureDir(path.join(root, "research", "query-intelligence", `${runDate}-import`));
  const source = fs.readFileSync(path.resolve(root, inputPath), "utf8");
  const { rows } = parseCsv(source);
  const sourceId = `${sourceType}:${path.basename(inputPath)}:${runDate}`;

  const normalized = rows
    .map((row, index) => {
      const query = pick(row, ["query", "question", "keyword", "search term", "term", "prompt"]);
      if (!query) return null;
      return {
        query_id: `import-${String(index + 1).padStart(4, "0")}`,
        source_id: sourceId,
        source_type: sourceType,
        query,
        normalized_query: normalizeQuery(query),
        intent: classify(query),
        funnel_stage: "unknown",
        pillar_id: mapPillar(query),
        topic_id: "",
        surface: pick(row, ["surface", "source"]) || sourceType,
        country: pick(row, ["country", "geo"]) || "US",
        language: pick(row, ["language", "lang"]) || "en",
        observed_at: pick(row, ["date", "observed_at"]) || runDate,
        volume: pick(row, ["volume", "search volume", "impressions"]),
        difficulty: pick(row, ["difficulty", "keyword difficulty", "kd"]),
        evidence_use: "discovery_only",
        notes: "Imported query data is discovery only and must not be cited as factual evidence.",
      };
    })
    .filter(Boolean);

  writeCsvAtomic(path.join(outputDir, "normalized-queries.csv"), OUTPUT_HEADERS, normalized);
  fs.writeFileSync(
    path.join(outputDir, "query-decisions.md"),
    `# Query Import Decisions\n\nRun date: ${runDate}\n\nImported ${normalized.length} rows from \`${inputPath}\`.\n\nThese rows are discovery only. Cluster them before opening or refreshing a packet.\n`
  );
  console.log(JSON.stringify({ ok: true, inputPath, outputDir, rows: normalized.length }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
