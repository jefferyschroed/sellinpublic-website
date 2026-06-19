#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./lib/csv.mjs";

const REQUIRED_ARTIFACTS = [
  "source-manifest.json",
  "normalized-queries.csv",
  "query-clusters.yaml",
  "query-decisions.md",
  "brief-handoff.yaml",
];

const NORMALIZED_QUERY_HEADERS = [
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

const REQUIRED_NORMALIZED_VALUES = [
  "query_id",
  "source_id",
  "source_type",
  "query",
  "normalized_query",
  "intent",
  "funnel_stage",
  "pillar_id",
  "surface",
  "country",
  "language",
  "observed_at",
  "evidence_use",
];

const PREFERRED_SOURCE_TYPES = new Set([
  "reddit_manual_capture",
  "reddit_api_export",
  "answer_the_public_export",
  "gsc_emerging_query_export",
  "bing_webmaster_query_export",
  "google_trends_api_export",
  "google_trends_csv_export",
  "public_source_trend_export",
  "manual_ai_prompt_export",
  "manual_serp_observation",
  "manual_topic_seed",
  "other_query_tool_export",
]);

const LEGACY_SOURCE_TYPE_ALIASES = new Map([
  ["approved_ai_prompt_export", "manual_ai_prompt_export"],
]);

const PREFERRED_CLUSTER_DECISIONS = new Set([
  "create_packet",
  "refresh_packet",
  "map_as_section",
  "map_as_faq",
  "monitor",
  "reject",
]);

const LEGACY_CLUSTER_DECISIONS = new Set([
  "create_or_refresh_packet",
  "map_as_h2_faq_or_section",
]);

function usage() {
  console.log(`Usage:
  node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed>
  node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed> --json
  node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed> --fail-on-warn
  node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed> --require-handoff-ready

Validates required query-intelligence artifacts, clustering coverage, dedupe sufficiency, and discovery-only evidence guardrails without third-party packages.`);
}

function parseArgs(argv) {
  const args = {
    runDir: "",
    json: false,
    failOnWarn: false,
    requireHandoffReady: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--fail-on-warn") args.failOnWarn = true;
    else if (arg === "--require-handoff-ready") args.requireHandoffReady = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else if (!args.runDir) args.runDir = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  return args;
}

function add(items, severity, area, check, detail, extra = {}) {
  items.push({ severity, area, check, detail, ...extra });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return String(value ?? "").trim() !== "";
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function artifactPath(context, relativePath) {
  return path.join(context.runDir, relativePath);
}

function fileExists(context, relativePath) {
  const filePath = artifactPath(context, relativePath);
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function dirExists(context, relativePath) {
  const dirPath = artifactPath(context, relativePath);
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function nonEmptyFileExists(context, relativePath) {
  const filePath = artifactPath(context, relativePath);
  return fileExists(context, relativePath) && fs.statSync(filePath).size > 0;
}

function readText(context, relativePath) {
  return fs.readFileSync(artifactPath(context, relativePath), "utf8");
}

function readJson(context, relativePath, items) {
  try {
    return JSON.parse(readText(context, relativePath));
  } catch (error) {
    add(items, "blocker", "artifact", relativePath, `Invalid JSON: ${error.message}`);
    return null;
  }
}

function stripInlineComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }
    if (!quote && char === "#" && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function splitYamlPair(text) {
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }
    if (!quote && char === ":") {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }
  return null;
}

function splitTopLevelCsv(text) {
  const values = [];
  let current = "";
  let quote = "";
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? "" : quote || char;
      current += char;
      continue;
    }
    if (!quote && (char === "[" || char === "{")) depth += 1;
    if (!quote && (char === "]" || char === "}")) depth -= 1;
    if (!quote && depth === 0 && char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim() || text.endsWith(",")) values.push(current.trim());
  return values;
}

function parseYamlScalar(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevelCsv(inner).map(parseYamlScalar);
  }
  return trimmed;
}

function parseYamlSubset(source, label) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const entries = [];

  lines.forEach((line, index) => {
    const withoutComment = stripInlineComment(line).replace(/\s+$/, "");
    if (!withoutComment.trim()) return;
    entries.push({
      line: index + 1,
      indent: withoutComment.match(/^ */)[0].length,
      text: withoutComment.trim(),
    });
  });

  const root = {};
  const stack = [{ indent: -1, value: root }];

  function nextContainer(index) {
    const next = entries[index + 1];
    return next && next.text.startsWith("- ") ? [] : {};
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    while (stack.length > 1 && stack[stack.length - 1].indent >= entry.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (entry.text.startsWith("- ")) {
      if (!Array.isArray(parent)) {
        throw new Error(`${label}:${entry.line} has a list item outside a list.`);
      }
      const itemText = entry.text.slice(2).trim();
      if (!itemText) {
        const child = nextContainer(index);
        parent.push(child);
        stack.push({ indent: entry.indent, value: child });
        continue;
      }

      const pair = splitYamlPair(itemText);
      if (pair) {
        const [key, rawValue] = pair;
        const child = {};
        parent.push(child);
        if (!rawValue) {
          const nested = nextContainer(index);
          child[key] = nested;
          stack.push({ indent: entry.indent, value: child });
          stack.push({ indent: entry.indent + 1, value: nested });
        } else {
          child[key] = parseYamlScalar(rawValue);
          stack.push({ indent: entry.indent, value: child });
        }
      } else {
        parent.push(parseYamlScalar(itemText));
      }
      continue;
    }

    if (!isObject(parent)) {
      throw new Error(`${label}:${entry.line} has a mapping value outside a map.`);
    }

    const pair = splitYamlPair(entry.text);
    if (!pair) {
      throw new Error(`${label}:${entry.line} is not a supported YAML mapping line.`);
    }

    const [key, rawValue] = pair;
    if (!key) {
      throw new Error(`${label}:${entry.line} has an empty key.`);
    }
    if (!rawValue) {
      const child = nextContainer(index);
      parent[key] = child;
      stack.push({ indent: entry.indent, value: child });
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }

  return root;
}

function readYaml(context, relativePath, items) {
  try {
    return parseYamlSubset(readText(context, relativePath), relativePath);
  } catch (error) {
    add(items, "blocker", "artifact", relativePath, `Unsupported or invalid YAML subset: ${error.message}`);
    return null;
  }
}

function normalizeQuery(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDiscoveryOnly(value) {
  return String(value ?? "").trim() === "discovery_only";
}

function isManualSourceType(value) {
  const sourceType = String(value ?? "").trim();
  return sourceType.startsWith("manual_") || sourceType.includes("_manual_");
}

const DIRECT_VALIDATED_DEMAND_SOURCE_TYPES = new Set([
  "gsc_emerging_query_export",
  "bing_webmaster_query_export",
  "google_trends_api_export",
  "google_trends_csv_export",
]);

function isReadyHandoffStatus(value) {
  return String(value ?? "").trim().toLowerCase() === "ready";
}

function isGoogleTrendsRssLike(value) {
  return /\bgoogle[_ -]?trends?[_ -]?rss\b/i.test(String(value || ""));
}

function isPublicFeedLikeSource(source = {}) {
  const text = [
    source.source_type,
    source.surface,
    source.name,
    source.path,
    source.collection_method,
  ].join(" ");
  return source.source_type === "public_source_trend_export" || isGoogleTrendsRssLike(text);
}

function isReviewedGenericQueryToolSource(source = {}) {
  if (source.source_type !== "other_query_tool_export") return false;
  return (
    String(source.demand_validation_status || "").trim() === "validated" &&
    hasText(source.validation_source) &&
    hasText(source.reviewed_by)
  );
}

function isValidatedDemandSource(source = {}) {
  if (isPublicFeedLikeSource(source)) return false;
  if (DIRECT_VALIDATED_DEMAND_SOURCE_TYPES.has(source.source_type)) return true;
  return isReviewedGenericQueryToolSource(source);
}

function sourceForRow(context, row) {
  return {
    ...(context.sourceById?.get(row.source_id) || {}),
    source_id: row.source_id,
    source_type: row.source_type,
    surface: row.surface,
  };
}

function readyDemandGate(context) {
  const demandSources = new Map();
  const discoveryOnlySources = new Map();

  for (const row of context.normalizedRows || []) {
    const source = sourceForRow(context, row);
    if (!hasText(source.source_id) && !hasText(source.source_type)) continue;
    const key = source.source_id || `${source.source_type}:${source.surface || ""}`;
    if (isValidatedDemandSource(source)) {
      demandSources.set(key, source);
    } else {
      discoveryOnlySources.set(key, source);
    }
  }

  return {
    demandSources: Array.from(demandSources.values()),
    discoveryOnlySources: Array.from(discoveryOnlySources.values()),
  };
}

function sourceSummary(sources) {
  return Array.from(new Set(sources.map((source) => [source.source_type, source.surface].filter(hasText).join(":"))))
    .filter(hasText)
    .join(", ") || "none";
}

function isSensitiveDiscoverySourceType(value) {
  const sourceType = String(value ?? "").trim();
  return /reddit|ai_prompt|chatgpt|claude|perplexity|gemini/i.test(sourceType);
}

function isPreferredOrLegacySourceType(value) {
  const sourceType = String(value ?? "").trim();
  return PREFERRED_SOURCE_TYPES.has(sourceType) || LEGACY_SOURCE_TYPE_ALIASES.has(sourceType);
}

function checkRequiredArtifacts(context, items) {
  for (const artifact of REQUIRED_ARTIFACTS) {
    if (nonEmptyFileExists(context, artifact)) {
      add(items, "ready", "artifact", artifact, "Required artifact exists and is non-empty.");
    } else if (fileExists(context, artifact)) {
      add(items, "blocker", "artifact", artifact, "Required artifact exists but is empty.");
    } else {
      add(items, "blocker", "artifact", artifact, "Missing required artifact.");
    }
  }

  if (dirExists(context, "raw")) {
    const rawEntries = fs.readdirSync(artifactPath(context, "raw")).filter((entry) => !entry.startsWith("."));
    if (rawEntries.length) {
      add(items, "ready", "artifact", "raw/", `Raw capture folder exists with ${rawEntries.length} file(s).`);
    } else {
      add(items, "warn", "artifact", "raw/", "Raw capture folder exists but is empty.");
    }
  } else {
    add(items, "warn", "artifact", "raw/", "Missing raw capture folder for approved exports or manual capture notes.");
  }
}

function validateManifest(context, items) {
  if (!fileExists(context, "source-manifest.json")) return;
  const manifest = readJson(context, "source-manifest.json", items);
  context.manifest = manifest;
  if (!manifest || !isObject(manifest)) {
    add(items, "blocker", "source-manifest", "shape", "source-manifest.json must be a JSON object.");
    return;
  }

  const runFolder = path.basename(context.runDir);
  if (!hasText(manifest.run_id)) {
    add(items, "blocker", "source-manifest", "run_id", "Missing run_id.");
  } else if (manifest.run_id !== runFolder) {
    add(items, "warn", "source-manifest", "run_id", `run_id (${manifest.run_id}) does not match folder name (${runFolder}).`);
  } else {
    add(items, "ready", "source-manifest", "run_id", "run_id matches the run folder.");
  }

  if (!hasText(manifest.run_date)) {
    add(items, "warn", "source-manifest", "run_date", "Missing run_date; newer schema expects the run date separately from created_at.");
  }

  if (!hasText(manifest.rule) || !/discovery|evidence/i.test(String(manifest.rule))) {
    add(items, "blocker", "source-manifest", "rule", "Manifest rule must state the discovery-only evidence boundary.");
  } else {
    add(items, "ready", "source-manifest", "rule", "Manifest states the discovery-only evidence boundary.");
  }

  if (!Array.isArray(manifest.sources) || !manifest.sources.length) {
    add(items, "blocker", "source-manifest", "sources", "Manifest must include at least one source.");
    return;
  }

  const sourceIds = new Set();
  const sourceById = new Map();
  const activeSources = [];
  for (const [index, source] of manifest.sources.entries()) {
    const label = hasText(source?.source_id) ? source.source_id : `source ${index + 1}`;
    if (!isObject(source)) {
      add(items, "blocker", "source-manifest", label, "Each source must be an object.");
      continue;
    }

    if (!hasText(source.source_id)) {
      add(items, "blocker", "source-manifest", label, "Source is missing source_id.");
    } else if (sourceIds.has(source.source_id)) {
      add(items, "blocker", "source-manifest", source.source_id, "Duplicate source_id in manifest.");
    } else {
      sourceIds.add(source.source_id);
      sourceById.set(source.source_id, source);
    }

    if (!hasText(source.source_type)) {
      add(items, "blocker", "source-manifest", label, "Source is missing source_type.");
    } else if (!isPreferredOrLegacySourceType(source.source_type)) {
      add(items, "warn", "source-manifest", label, `Source type '${source.source_type}' is not in docs/seo-aeo/schemas/discovery-source-manifest.schema.json.`);
    } else if (LEGACY_SOURCE_TYPE_ALIASES.has(source.source_type)) {
      add(items, "warn", "source-manifest", label, `Source type '${source.source_type}' is legacy; prefer '${LEGACY_SOURCE_TYPE_ALIASES.get(source.source_type)}'.`);
    }

    if (!isDiscoveryOnly(source.evidence_use)) {
      add(items, "blocker", "source-manifest", label, "Every manifest source must use evidence_use: discovery_only.");
    }

    if (
      isSensitiveDiscoverySourceType(source.source_type) &&
      hasText(source.allowed_public_use) &&
      source.allowed_public_use !== "none"
    ) {
      add(items, "blocker", "source-manifest", label, "Reddit and AI prompt sources must use allowed_public_use: none.");
    }

    if (isPublicFeedLikeSource(source) && String(source.demand_validation_status || "").trim() === "validated") {
      add(items, "blocker", "source-manifest", label, "Public feed captures and Google Trends RSS cannot use demand_validation_status: validated.");
    }

    if (source.source_type === "google_trends_csv_export" && isGoogleTrendsRssLike([source.surface, source.name, source.path].join(" "))) {
      add(items, "blocker", "source-manifest", label, "Google Trends RSS/feed captures must be public_source_trend_export, not google_trends_csv_export.");
    }

    if (
      source.source_type === "other_query_tool_export" &&
      String(source.demand_validation_status || "").trim() === "validated" &&
      (!hasText(source.validation_source) || !hasText(source.reviewed_by))
    ) {
      add(items, "blocker", "source-manifest", label, "Reviewed generic query-tool exports need validation_source and reviewed_by.");
    }

    if (hasText(source.path)) {
      activeSources.push(source);
      const sourcePath = path.resolve(context.root, source.path);
      if (!fs.existsSync(sourcePath)) {
        add(items, "warn", "source-manifest", label, `Source path does not exist: ${source.path}`);
      }
    }

    const recommendedMetadata = [
      "captured_by",
      "captured_at",
      "surface",
      "country",
      "language",
      "path",
      "allowed_public_use",
      "collection_method",
      "sanitization_status",
      "license_or_terms_note",
    ];
    const missingMetadata = recommendedMetadata.filter((key) => !hasText(source[key]));
    if (missingMetadata.length) {
      add(items, "warn", "source-manifest", label, `Missing recommended metadata: ${missingMetadata.join(", ")}.`);
    }
  }

  context.sourceIds = sourceIds;
  context.sourceById = sourceById;
  context.manifestSources = manifest.sources;
  context.sourceTypes = new Set(manifest.sources.map((source) => source.source_type).filter(hasText));

  if (activeSources.length <= 1) {
    add(items, "warn", "source-manifest", "source depth", `Only ${activeSources.length} manifest source(s) have a raw path; supplement before treating demand as validated.`);
  }

  if (activeSources.length && activeSources.every((source) => isManualSourceType(source.source_type))) {
    add(items, "warn", "source-manifest", "manual-only data", "All active manifest sources are manual captures or seeds.");
  }
}

function validateNormalizedQueries(context, items) {
  if (!fileExists(context, "normalized-queries.csv")) return;
  const source = readText(context, "normalized-queries.csv");
  const { headers, rows } = parseCsv(source);
  context.normalizedHeaders = headers;
  context.normalizedRows = rows;

  const headerSet = new Set(headers);
  const missingHeaders = NORMALIZED_QUERY_HEADERS.filter((header) => !headerSet.has(header));
  if (missingHeaders.length) {
    add(items, "blocker", "normalized-queries", "headers", `Missing required CSV headers: ${missingHeaders.join(", ")}.`);
  } else {
    add(items, "ready", "normalized-queries", "headers", "All required normalized query headers are present.");
  }

  if (!rows.length) {
    add(items, "blocker", "normalized-queries", "rows", "normalized-queries.csv must include at least one query row.");
    return;
  }

  const queryIds = new Set();
  const duplicateQueryIds = new Set();
  const normalizedKeys = new Map();
  const rowSourceTypes = new Set();
  let evidenceViolations = 0;
  let missingRequiredValues = 0;
  let unknownSourceIds = 0;
  let sourceTypeWarnings = 0;
  let sensitivePublicUseViolations = 0;

  for (const [index, row] of rows.entries()) {
    const rowLabel = row.query_id || `row ${index + 2}`;
    for (const field of REQUIRED_NORMALIZED_VALUES) {
      if (!hasText(row[field])) missingRequiredValues += 1;
    }

    if (hasText(row.query_id)) {
      if (queryIds.has(row.query_id)) duplicateQueryIds.add(row.query_id);
      queryIds.add(row.query_id);
    }

    if (hasText(row.normalized_query)) {
      const key = hasText(row.canonical_query_key) ? row.canonical_query_key : normalizeQuery(row.normalized_query);
      if (!normalizedKeys.has(key)) normalizedKeys.set(key, []);
      normalizedKeys.get(key).push(rowLabel);
    }

    if (!isDiscoveryOnly(row.evidence_use)) evidenceViolations += 1;

    if (hasText(row.source_id) && context.sourceIds?.size && !context.sourceIds.has(row.source_id)) {
      unknownSourceIds += 1;
    }

    if (hasText(row.source_type)) {
      rowSourceTypes.add(row.source_type);
      if (!isPreferredOrLegacySourceType(row.source_type)) sourceTypeWarnings += 1;
    }

    if (
      isSensitiveDiscoverySourceType(row.source_type) &&
      hasText(row.allowed_public_use) &&
      row.allowed_public_use !== "none"
    ) {
      sensitivePublicUseViolations += 1;
    }
  }

  context.queryIds = queryIds;
  context.normalizedKeyDuplicates = Array.from(normalizedKeys.entries()).filter(([, ids]) => ids.length > 1);
  context.rowSourceTypes = rowSourceTypes;

  if (missingRequiredValues) {
    add(items, "blocker", "normalized-queries", "required values", `${missingRequiredValues} required cell(s) are blank.`);
  }

  if (duplicateQueryIds.size) {
    add(items, "blocker", "normalized-queries", "query_id uniqueness", `Duplicate query_id values: ${Array.from(duplicateQueryIds).join(", ")}.`);
  } else {
    add(items, "ready", "normalized-queries", "query_id uniqueness", `${queryIds.size} unique query_id values.`);
  }

  if (evidenceViolations) {
    add(items, "blocker", "normalized-queries", "evidence_use", `${evidenceViolations} row(s) do not use evidence_use: discovery_only.`);
  } else {
    add(items, "ready", "normalized-queries", "evidence_use", "All normalized rows are discovery_only.");
  }

  if (sensitivePublicUseViolations) {
    add(items, "blocker", "normalized-queries", "allowed_public_use", `${sensitivePublicUseViolations} Reddit or AI prompt row(s) allow public evidence use.`);
  }

  if (unknownSourceIds) {
    add(items, "warn", "normalized-queries", "source lineage", `${unknownSourceIds} row(s) reference source_id values not found in source-manifest.json.`);
  }

  if (sourceTypeWarnings) {
    add(items, "warn", "normalized-queries", "source_type", `${sourceTypeWarnings} row(s) use source_type values outside the preferred schema enum.`);
  }

  const metricFields = ["volume", "difficulty", "impressions", "clicks", "trend_delta"];
  const hasAnyMetric = rows.some((row) => metricFields.some((field) => hasText(row[field])));
  if (!hasAnyMetric) {
    add(items, "warn", "normalized-queries", "thin data", "No volume, difficulty, impression, click, or trend metrics are populated.");
  }

  if (rows.length < 5) {
    add(items, "warn", "normalized-queries", "thin data", `Only ${rows.length} normalized query row(s) are present.`);
  }

  if (rowSourceTypes.size && Array.from(rowSourceTypes).every(isManualSourceType)) {
    add(items, "warn", "normalized-queries", "manual-only data", "All normalized rows come from manual source types.");
  }
}

function findDedupeMap(context) {
  const candidates = ["dedupe-map.csv", "dedupe/dedupe-map.csv"];
  return candidates.find((candidate) => fileExists(context, candidate)) || "";
}

function validateDedupe(context, items) {
  if (!context.normalizedRows?.length) return;

  const dedupePath = findDedupeMap(context);
  const duplicateGroups = context.normalizedKeyDuplicates || [];
  if (!duplicateGroups.length && !dedupePath) {
    add(items, "ready", "dedupe", "dedupe sufficiency", "No duplicate normalized query keys detected; dedupe map is not required for this run.");
    return;
  }

  if (duplicateGroups.length && !dedupePath) {
    const sample = duplicateGroups.slice(0, 3).map(([key, ids]) => `${key}: ${ids.join(", ")}`).join("; ");
    add(items, "warn", "dedupe", "dedupe sufficiency", `Duplicate normalized query keys need review and no dedupe map was found. Sample: ${sample}`);
    return;
  }

  const { headers, rows } = parseCsv(readText(context, dedupePath));
  const requiredHeaders = ["duplicate_id", "canonical_query_id", "duplicate_query_id", "match_type", "merge_decision", "reason"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    add(items, "warn", "dedupe", dedupePath, `Dedupe map is present but missing headers: ${missingHeaders.join(", ")}.`);
    return;
  }

  if (duplicateGroups.length && !rows.length) {
    add(items, "warn", "dedupe", dedupePath, "Dedupe map is present but empty while duplicate normalized query keys exist.");
    return;
  }

  add(items, "ready", "dedupe", dedupePath, `Dedupe map is present with ${rows.length} row(s).`);
}

function clusterQueryIds(cluster) {
  if (Array.isArray(cluster.canonical_query_ids)) return cluster.canonical_query_ids;
  if (Array.isArray(cluster.query_ids)) return cluster.query_ids;
  return [];
}

function validateClusters(context, items) {
  if (!fileExists(context, "query-clusters.yaml")) return;
  const clustersYaml = readYaml(context, "query-clusters.yaml", items);
  context.clustersYaml = clustersYaml;
  if (!clustersYaml || !isObject(clustersYaml)) return;

  if (!Array.isArray(clustersYaml.clusters) || !clustersYaml.clusters.length) {
    add(items, "blocker", "query-clusters", "clusters", "query-clusters.yaml must include at least one cluster.");
    return;
  }

  const clusterIds = new Set();
  const duplicateClusterIds = new Set();
  const clusteredQueryIds = new Set();
  let unknownQueryReferences = 0;
  let missingQueryLists = 0;
  let missingEvidenceUse = 0;
  let sourceLineageWarnings = 0;
  let legacyQueryIds = 0;
  let legacyDecisions = 0;
  let unrecognizedDecisions = 0;

  for (const [index, cluster] of clustersYaml.clusters.entries()) {
    const label = cluster?.cluster_id || `cluster ${index + 1}`;
    if (!isObject(cluster)) {
      add(items, "blocker", "query-clusters", label, "Each cluster must be a mapping.");
      continue;
    }

    if (!hasText(cluster.cluster_id)) {
      add(items, "blocker", "query-clusters", label, "Cluster is missing cluster_id.");
    } else if (clusterIds.has(cluster.cluster_id)) {
      duplicateClusterIds.add(cluster.cluster_id);
    } else {
      clusterIds.add(cluster.cluster_id);
    }

    for (const field of ["label", "intent", "pillar_id", "representative_query", "recommended_asset", "decision"]) {
      if (!hasText(cluster[field])) {
        add(items, "blocker", "query-clusters", label, `Cluster is missing ${field}.`);
      }
    }

    if (Array.isArray(cluster.query_ids) && !Array.isArray(cluster.canonical_query_ids)) {
      legacyQueryIds += 1;
    }

    const ids = clusterQueryIds(cluster).filter(hasText);
    if (!ids.length) {
      missingQueryLists += 1;
    }

    for (const queryId of ids) {
      clusteredQueryIds.add(queryId);
      if (context.queryIds?.size && !context.queryIds.has(queryId)) {
        unknownQueryReferences += 1;
      }
    }

    if (hasText(cluster.evidence_use) && !isDiscoveryOnly(cluster.evidence_use)) {
      add(items, "blocker", "query-clusters", label, "Cluster evidence_use must be discovery_only.");
    } else if (!hasText(cluster.evidence_use)) {
      missingEvidenceUse += 1;
    }

    if (!Array.isArray(cluster.source_ids) || !cluster.source_ids.length || !Array.isArray(cluster.source_types) || !cluster.source_types.length) {
      sourceLineageWarnings += 1;
    }

    if (Array.isArray(cluster.source_ids) && context.sourceIds?.size) {
      const unknownSourceIds = cluster.source_ids.filter((sourceId) => !context.sourceIds.has(sourceId));
      if (unknownSourceIds.length) {
        add(items, "warn", "query-clusters", label, `Cluster references source_id values not found in the manifest: ${unknownSourceIds.join(", ")}.`);
      }
    }

    if (hasText(cluster.decision)) {
      if (LEGACY_CLUSTER_DECISIONS.has(cluster.decision)) legacyDecisions += 1;
      else if (!PREFERRED_CLUSTER_DECISIONS.has(cluster.decision)) unrecognizedDecisions += 1;
    }
  }

  if (duplicateClusterIds.size) {
    add(items, "blocker", "query-clusters", "cluster_id uniqueness", `Duplicate cluster_id values: ${Array.from(duplicateClusterIds).join(", ")}.`);
  }

  if (missingQueryLists) {
    add(items, "blocker", "query-clusters", "cluster coverage", `${missingQueryLists} cluster(s) have no canonical_query_ids or query_ids.`);
  }

  if (unknownQueryReferences) {
    add(items, "blocker", "query-clusters", "cluster coverage", `${unknownQueryReferences} clustered query reference(s) are not present in normalized-queries.csv.`);
  }

  if (context.queryIds?.size) {
    const unclustered = Array.from(context.queryIds).filter((queryId) => !clusteredQueryIds.has(queryId));
    if (unclustered.length) {
      add(items, "blocker", "query-clusters", "cluster coverage", `Unclustered normalized queries: ${unclustered.join(", ")}.`);
    } else {
      add(items, "ready", "query-clusters", "cluster coverage", `All ${context.queryIds.size} normalized query row(s) are included in clusters.`);
    }
  }

  if (legacyQueryIds) {
    add(items, "warn", "query-clusters", "schema shape", `${legacyQueryIds} cluster(s) use query_ids; prefer canonical_query_ids.`);
  }

  if (missingEvidenceUse) {
    add(items, "warn", "query-clusters", "evidence_use", `${missingEvidenceUse} cluster(s) omit evidence_use: discovery_only.`);
  }

  if (sourceLineageWarnings) {
    add(items, "warn", "query-clusters", "source lineage", `${sourceLineageWarnings} cluster(s) omit source_ids or source_types.`);
  }

  if (legacyDecisions) {
    add(items, "warn", "query-clusters", "decision enum", `${legacyDecisions} cluster(s) use legacy decision values; prefer create_packet, refresh_packet, map_as_section, map_as_faq, monitor, or reject.`);
  }

  if (unrecognizedDecisions) {
    add(items, "warn", "query-clusters", "decision enum", `${unrecognizedDecisions} cluster(s) use unrecognized decision values.`);
  }

  const allSingletons = clustersYaml.clusters.every((cluster) => clusterQueryIds(cluster).length <= 1);
  if (allSingletons && context.normalizedRows?.length >= 5) {
    add(items, "warn", "query-clusters", "cluster sufficiency", "Every cluster is a singleton; review whether semantic clustering is deep enough.");
  }
}

function validateDecisions(context, items) {
  if (!fileExists(context, "query-decisions.md")) return;
  const text = readText(context, "query-decisions.md");
  if (!text.trim()) return;

  const hasDiscoveryBoundary = /discovery|directional|guide packet planning|guide.*packet|query data/i.test(text);
  const hasEvidenceBoundary = /do not cite|cannot support|not.*evidence|not cite/i.test(text);
  if (!hasDiscoveryBoundary && !hasEvidenceBoundary) {
    add(items, "blocker", "query-decisions", "discovery guardrail", "query-decisions.md must state that query data is discovery-only and not factual evidence.");
  } else {
    add(items, "ready", "query-decisions", "discovery guardrail", "Decision notes include discovery-only/no-evidence guardrails.");
  }

  if (context.manifest?.run_id && !text.includes(context.manifest.run_id)) {
    add(items, "warn", "query-decisions", "run linkage", "query-decisions.md does not mention the manifest run_id.");
  }

  if (context.normalizedRows?.length && !/volume|query|cluster|decision/i.test(text)) {
    add(items, "warn", "query-decisions", "decision detail", "Decision notes are thin; include cluster decisions and demand limitations.");
  }
}

function handoffPackets(handoff) {
  if (!handoff || !isObject(handoff)) return [];
  if (Array.isArray(handoff.recommended_packets)) return handoff.recommended_packets;
  if (Array.isArray(handoff.candidates)) return handoff.candidates;
  return [];
}

function packetValue(packet, names) {
  for (const name of names) {
    if (hasText(packet[name])) return packet[name];
  }
  return "";
}

function validateHandoff(context, items) {
  if (!fileExists(context, "brief-handoff.yaml")) return;
  const handoff = readYaml(context, "brief-handoff.yaml", items);
  context.handoff = handoff;
  if (!handoff || !isObject(handoff)) return;

  if (!hasText(handoff.rule) || !/source|validate|review|evidence|gap/i.test(String(handoff.rule))) {
    add(items, "warn", "brief-handoff", "rule", "Handoff rule should remind packet owners to validate sources, topic score, and SME gaps.");
  }

  if (!hasText(handoff.handoff_status)) {
    add(
      items,
      context.requireHandoffReady ? "blocker" : "warn",
      "brief-handoff",
      "handoff_status",
      "handoff_status is missing."
    );
  } else if (!isReadyHandoffStatus(handoff.handoff_status)) {
    add(
      items,
      context.requireHandoffReady ? "blocker" : "warn",
      "brief-handoff",
      "handoff_status",
      `handoff_status is '${handoff.handoff_status}', not ready.`
    );
  } else {
    const gate = readyDemandGate(context);
    if (!gate.demandSources.length) {
      add(
        items,
        "blocker",
        "brief-handoff",
        "validated demand gate",
        `handoff_status: ready requires validated demand from GSC, Bing Webmaster, manual Google Trends CSV/API, or a reviewed generic query-tool export. Discovery-only sources present: ${sourceSummary(gate.discoveryOnlySources)}.`
      );
    } else {
      add(
        items,
        "ready",
        "brief-handoff",
        "validated demand gate",
        `Ready handoff is backed by validated demand source(s): ${sourceSummary(gate.demandSources)}.`
      );
    }
  }

  const packets = handoffPackets(handoff);
  if (!packets.length) {
    add(items, "blocker", "brief-handoff", "recommended packets", "brief-handoff.yaml must include recommended_packets or candidates.");
    return;
  }

  const normalizedQueries = new Set(
    (context.normalizedRows || []).flatMap((row) => [normalizeQuery(row.query), normalizeQuery(row.normalized_query)]).filter(Boolean)
  );
  let missingPacketFields = 0;
  let unmatchedPrimaryQueries = 0;
  let emptySourceGaps = 0;

  for (const [index, packet] of packets.entries()) {
    const label = packetValue(packet, ["packet_id", "candidate_id", "slug", "slug_candidate", "title", "recommended_title"]) || `packet ${index + 1}`;
    if (!isObject(packet)) {
      add(items, "blocker", "brief-handoff", label, "Each handoff packet must be a mapping.");
      continue;
    }

    const required = [
      ["title", "recommended_title"],
      ["slug", "slug_candidate"],
      ["topic_id"],
      ["primary_query"],
      ["aeo_question"],
      ["recommended_asset"],
    ];
    for (const names of required) {
      if (!packetValue(packet, names)) missingPacketFields += 1;
    }

    for (const arrayField of ["secondary_queries", "source_gaps", "sme_questions", "internal_links"]) {
      if (!Array.isArray(packet[arrayField])) {
        missingPacketFields += 1;
      }
    }

    if (hasText(packet.primary_query) && normalizedQueries.size && !normalizedQueries.has(normalizeQuery(packet.primary_query))) {
      unmatchedPrimaryQueries += 1;
    }

    if (Array.isArray(packet.source_gaps) && !packet.source_gaps.length) {
      emptySourceGaps += 1;
    }
  }

  if (missingPacketFields) {
    add(items, "blocker", "brief-handoff", "packet fields", `${missingPacketFields} required handoff field(s) are missing.`);
  } else {
    add(items, "ready", "brief-handoff", "packet fields", `${packets.length} recommended packet(s) include required handoff fields.`);
  }

  if (unmatchedPrimaryQueries) {
    add(items, "warn", "brief-handoff", "primary query", `${unmatchedPrimaryQueries} primary query value(s) do not match normalized-queries.csv.`);
  }

  const allManualRows = context.rowSourceTypes?.size && Array.from(context.rowSourceTypes).every(isManualSourceType);
  if (emptySourceGaps && allManualRows) {
    add(items, "warn", "brief-handoff", "source gaps", `${emptySourceGaps} recommended packet(s) have empty source_gaps while query data is manual-only.`);
  }
}

function statusFor(items, failOnWarn) {
  const blockers = items.filter((item) => item.severity === "blocker").length;
  const warnings = items.filter((item) => item.severity === "warn").length;
  if (blockers) return { status: "failed", exitCode: 1 };
  if (warnings && failOnWarn) return { status: "failed_on_warnings", exitCode: 1 };
  if (warnings) return { status: "passed_with_warnings", exitCode: 0 };
  return { status: "passed", exitCode: 0 };
}

function printText(report) {
  console.log(`Query intelligence validation: ${report.run_dir}`);
  console.log(`Status: ${report.status}`);
  console.log(`Blockers: ${report.counts.blocker}  Warnings: ${report.counts.warn}  Ready: ${report.counts.ready}`);

  for (const severity of ["blocker", "warn", "ready"]) {
    const group = report.items.filter((item) => item.severity === severity);
    if (!group.length) continue;
    console.log("");
    console.log(`${severity.toUpperCase()}:`);
    for (const item of group) {
      console.log(`- [${item.area}] ${item.check}: ${item.detail}`);
    }
  }
}

function buildReport(context, items, failOnWarn) {
  const { status, exitCode } = statusFor(items, failOnWarn);
  return {
    status,
    exit_code: exitCode,
    run_dir: relative(context.root, context.runDir),
    counts: {
      blocker: items.filter((item) => item.severity === "blocker").length,
      warn: items.filter((item) => item.severity === "warn").length,
      ready: items.filter((item) => item.severity === "ready").length,
    },
    items,
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }
  if (!args.runDir) {
    usage();
    throw new Error("Missing run folder path.");
  }

  const root = process.cwd();
  const runDir = path.resolve(root, args.runDir);
  const context = {
    root,
    runDir,
    sourceIds: new Set(),
    sourceById: new Map(),
    manifestSources: [],
    sourceTypes: new Set(),
    queryIds: new Set(),
    normalizedRows: [],
    normalizedKeyDuplicates: [],
    rowSourceTypes: new Set(),
    requireHandoffReady: args.requireHandoffReady,
  };
  const items = [];

  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    add(items, "blocker", "artifact", "run folder", `Run folder does not exist: ${args.runDir}`);
  } else {
    checkRequiredArtifacts(context, items);
    validateManifest(context, items);
    validateNormalizedQueries(context, items);
    validateDedupe(context, items);
    validateClusters(context, items);
    validateDecisions(context, items);
    validateHandoff(context, items);
  }

  const report = buildReport(context, items, args.failOnWarn);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }
  return report.exit_code;
}

try {
  process.exit(run());
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
