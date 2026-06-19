#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = [
  "candidate_id",
  "date",
  "source_type",
  "source_path",
  "observed_problem",
  "affected_workflow",
  "target_skill",
  "root_cause",
  "evidence",
  "reusability_classification",
  "proposed_change",
  "risk",
  "reviewer",
];

const ALLOWED_SOURCE_TYPES = new Set(["qa", "analytics", "performance", "generator", "publishing", "handoff", "source_policy"]);
const REUSABLE_CLASSIFICATION = "reusable_process_change";
const BLANK_VALUES = new Set(["", "todo", "tbd", "n/a", "na", "none", "null", "undefined"]);

function usage() {
  return `Usage: node scripts/seo-aeo/check-skill-learning.mjs --file <candidate.md|candidate.json> [--file ...] [--root <repo>] [--allow-no-candidate]

Validates learning_candidate records before any skill or SOP promotion. The checker requires
complete fields, reusable-process classification, and at least two evidence items or repeat_count >= 2.
Use --allow-no-candidate only for Skill Steward no-change/rejection artifacts that intentionally contain no promotion candidate.`;
}

function readArgs(argv) {
  const args = { files: [], root: process.cwd(), help: false, allowNoCandidate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
    } else if (value === "--file") {
      args.files.push(argv[index + 1] || "");
      index += 1;
    } else if (value === "--root") {
      args.root = argv[index + 1] || args.root;
      index += 1;
    } else if (value === "--allow-no-candidate") {
      args.allowNoCandidate = true;
    } else if (!value.startsWith("-")) {
      args.files.push(value);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function isBlank(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return BLANK_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function unquote(value) {
  const text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length;
}

function inlineListCount(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return 0;
  return text
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function normalizeCandidate(candidate, source) {
  const evidence = candidate.evidence;
  let evidenceCount = Number(candidate.evidence_count || candidate.repeat_count || 0);
  if (Array.isArray(evidence)) evidenceCount = Math.max(evidenceCount, evidence.length);
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    evidenceCount = Math.max(evidenceCount, Object.keys(evidence).length ? 1 : 0);
  }
  if (!Array.isArray(evidence) && typeof evidence === "string") {
    evidenceCount = Math.max(evidenceCount, inlineListCount(evidence) || (isBlank(evidence) ? 0 : 1));
  }
  if (candidate._evidenceCount) evidenceCount = Math.max(evidenceCount, candidate._evidenceCount);
  return { ...candidate, _source: source, _evidenceCount: evidenceCount };
}

function candidatesFromJson(value, source) {
  if (Array.isArray(value)) return value.map((item, index) => normalizeCandidate(item, `${source}#${index + 1}`));
  if (Array.isArray(value.skill_learning_candidates)) {
    return value.skill_learning_candidates.map((item, index) => normalizeCandidate(item, `${source}#${index + 1}`));
  }
  if (value.learning_candidate) return [normalizeCandidate(value.learning_candidate, source)];
  if (value.candidate_id) return [normalizeCandidate(value, source)];
  return [];
}

function parseJsonCandidates(raw, source) {
  try {
    return candidatesFromJson(JSON.parse(raw), source);
  } catch {
    return [];
  }
}

function parseYamlCandidate(lines, startIndex, baseIndent, source) {
  const candidate = {};
  let evidenceIndent = null;
  let evidenceCount = 0;
  const rootIndent = baseIndent >= 0 ? baseIndent + 2 : 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = indentOf(line);
    if (index > startIndex && baseIndent >= 0 && indent <= baseIndent && /^[A-Za-z0-9_]+:/.test(trimmed)) break;

    if (evidenceIndent !== null) {
      if (indent <= evidenceIndent && /^[A-Za-z0-9_]+:/.test(trimmed)) {
        evidenceIndent = null;
      } else if (indent > evidenceIndent && /^-\s+/.test(trimmed)) {
        evidenceCount += 1;
      }
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) continue;
    if (indent !== rootIndent) continue;

    const [, key, rawValue] = keyMatch;
    const value = unquote(rawValue);
    candidate[key] = value;
    if (key === "evidence") {
      evidenceIndent = indent;
      evidenceCount = Math.max(evidenceCount, inlineListCount(value) || (isBlank(value) ? 0 : 1));
    }
  }

  return normalizeCandidate({ ...candidate, _evidenceCount: evidenceCount }, source);
}

function parseYamlCandidates(raw, source) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*learning_candidate:\s*$/.test(lines[index])) {
      starts.push({ index: index + 1, indent: indentOf(lines[index]) });
    }
  }
  if (starts.length) {
    return starts.map((start, index) => parseYamlCandidate(lines, start.index, start.indent, `${source}#${index + 1}`));
  }
  if (raw.includes("candidate_id:")) return [parseYamlCandidate(lines, 0, -1, source)];
  return [];
}

function markdownBlocks(raw) {
  const blocks = [];
  const fence = /```(?:json|yaml|yml)?\s*\n([\s\S]*?)```/g;
  let match = fence.exec(raw);
  while (match) {
    if (match[1].includes("learning_candidate") || match[1].includes("candidate_id")) blocks.push(match[1]);
    match = fence.exec(raw);
  }
  return blocks.length ? blocks : [raw];
}

function parseCandidates(raw, source) {
  const directJson = parseJsonCandidates(raw, source);
  if (directJson.length) return directJson;

  const candidates = [];
  for (const [index, block] of markdownBlocks(raw).entries()) {
    candidates.push(...parseJsonCandidates(block, `${source}#block-${index + 1}`));
    candidates.push(...parseYamlCandidates(block, `${source}#block-${index + 1}`));
  }
  return candidates;
}

function noCandidateDisposition(raw) {
  const text = raw.toLowerCase();
  const noChangeSignals = [
    "no_sop_change_warranted",
    "no_new_sop_change_warranted",
    "no skill, sop",
    "no proposed skill or sop change",
    "no proposed skill or SOP change".toLowerCase(),
    "reject promotion",
    "rejection note",
  ];
  return noChangeSignals.some((signal) => text.includes(signal));
}

function resolveRepoPath(root, value) {
  const text = String(value || "").trim();
  if (!text || /^https?:\/\//.test(text) || text.includes("*")) return "";
  return path.isAbsolute(text) ? text : path.resolve(root, text);
}

function validateCandidate(candidate, root) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (field === "evidence") {
      if (!candidate._evidenceCount) errors.push("evidence must include at least one item");
      continue;
    }
    if (isBlank(candidate[field])) errors.push(`${field} is required`);
  }

  const sourceType = String(candidate.source_type || "").trim();
  if (sourceType && !ALLOWED_SOURCE_TYPES.has(sourceType)) {
    errors.push(`source_type must be one of: ${Array.from(ALLOWED_SOURCE_TYPES).join(", ")}`);
  }

  const classification = String(candidate.reusability_classification || "").trim();
  if (classification !== REUSABLE_CLASSIFICATION) {
    errors.push(`reusability_classification must be ${REUSABLE_CLASSIFICATION} before promotion`);
  }

  const evidenceSupport = Math.max(candidate._evidenceCount || 0, Number(candidate.repeat_count || 0));
  if (evidenceSupport < 2) {
    errors.push("reusable process changes require at least two evidence items or repeat_count >= 2");
  }
  if (sourceType === "qa" && evidenceSupport < 2) {
    errors.push("QA findings with fewer than two evidence items are treated as one-off and rejected");
  }

  const rootCause = String(candidate.root_cause || "").trim().toLowerCase();
  if (["unknown", "unclear", "none", "n/a", "na"].includes(rootCause)) {
    errors.push("root_cause must name the process gap, not unknown or none");
  }

  const oneOffSignals = ["isolated", "this article only", "single page", "typo", "copy edit", "layout bug"];
  const problemText = `${candidate.observed_problem || ""} ${candidate.proposed_change || ""}`.toLowerCase();
  if (oneOffSignals.some((signal) => problemText.includes(signal)) && evidenceSupport < 2) {
    errors.push("one-off wording requires repeated evidence before it can become a reusable process change");
  }

  const sourcePath = resolveRepoPath(root, candidate.source_path);
  if (sourcePath && !fs.existsSync(sourcePath)) {
    errors.push(`source_path does not exist: ${candidate.source_path}`);
  }

  return errors;
}

function run() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.files.length || args.files.some((file) => !file)) {
    console.error(usage());
    process.exit(1);
  }

  const root = path.resolve(args.root);
  const issues = [];
  let checked = 0;
  const noCandidateFiles = [];

  for (const file of args.files) {
    const filePath = path.isAbsolute(file) ? file : path.resolve(root, file);
    if (!fs.existsSync(filePath)) {
      issues.push(`${file}: file not found`);
      continue;
    }

    const candidates = parseCandidates(fs.readFileSync(filePath, "utf8"), file);
    if (!candidates.length) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (args.allowNoCandidate && noCandidateDisposition(raw)) {
        noCandidateFiles.push(file);
        continue;
      }
      issues.push(`${file}: no learning_candidate records found`);
      continue;
    }

    for (const candidate of candidates) {
      checked += 1;
      for (const error of validateCandidate(candidate, root)) {
        issues.push(`${candidate._source}: ${error}`);
      }
    }
  }

  if (issues.length) {
    console.error("Skill learning check failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, checked, no_candidate_files: noCandidateFiles, files: args.files }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
