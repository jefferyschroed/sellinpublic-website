#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { parseCsv, readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const DISCOVERY_HEADERS = [
  "query_id",
  "source_id",
  "source_type",
  "source_record_id",
  "query",
  "normalized_query",
  "canonical_query_key",
  "intent",
  "funnel_stage",
  "audience",
  "pillar_id",
  "topic_id",
  "surface",
  "country",
  "language",
  "observed_at",
  "page_url",
  "device",
  "volume",
  "difficulty",
  "impressions",
  "clicks",
  "ctr",
  "avg_position",
  "trend_delta",
  "trend_window",
  "confidence",
  "evidence_use",
  "allowed_public_use",
  "raw_path",
  "notes",
];

const QUERY_HEADERS = [
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
  "impressions",
  "clicks",
  "ctr",
  "avg_position",
  "trend_delta",
  "trend_window",
  "evidence_use",
  "notes",
];

const TOPIC_HEADERS = [
  "captured_at",
  "topic",
  "intent",
  "source_count",
  "max_score",
  "evidence_use",
  "recommended_next_action",
];

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "for",
  "from",
  "how",
  "is",
  "of",
  "on",
  "or",
  "should",
  "the",
  "to",
  "vs",
  "what",
  "with",
]);

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

function existsFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0;
}

function readRows(filePath) {
  if (!existsFile(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, "utf8")).rows;
}

function csvFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv") && !entry.name.startsWith("."))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function pick(row, names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.trim().toLowerCase());
    if (found && String(found[1] ?? "").trim() !== "") return String(found[1]).trim();
  }
  return "";
}

function normalizeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalKey(value) {
  return normalizeQuery(value)
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word))
    .join(" ");
}

function slugify(value) {
  return normalizeQuery(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function classifyIntent(query) {
  const text = normalizeQuery(query);
  if (/ vs | versus | alternative| compare|comparison/.test(` ${text} `)) return "comparison";
  if (/what is|definition|meaning|define/.test(text)) return "definition";
  if (/how to|how do|steps|workflow|template|checklist|process/.test(text)) return "how_to";
  if (/example|examples|case study|case studies|clay|lovable|gitlab/.test(text)) return "examples";
  if (/measure|roi|metric|analytics|citation|visibility|traffic|conversion/.test(text)) return "measurement";
  if (/should|worth|need|everyone|every employee/.test(text)) return "objection";
  if (/best|tool|software|platform|vendor/.test(text)) return "vendor_evaluation";
  return "other";
}

function mapPillar(query) {
  const text = normalizeQuery(query);
  if (/linkedin|social selling|profile|comment/.test(text)) return "pillar-linkedin-led-gtm";
  if (/measure|roi|metric|analytics|citation|visibility|traffic/.test(text)) return "pillar-measurement-learning";
  if (/example|case study|clay|lovable|gitlab|linear|figma|gong/.test(text)) return "pillar-examples-case-studies";
  if (/workflow|review|expertise|interview|notes|voice/.test(text)) return "pillar-content-operations";
  return "pillar-employee-generated-content";
}

function scalar(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

function hasText(value) {
  return String(value ?? "").trim() !== "";
}

function parseTopicMap(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const topics = [];
  let pillarId = "";
  let inTopics = false;
  let topic = null;
  const flush = () => {
    if (topic) topics.push(topic);
    topic = null;
  };

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const pillarMatch = line.match(/^  - id:\s*(.+)$/);
    if (pillarMatch) {
      flush();
      pillarId = scalar(pillarMatch[1]);
      inTopics = false;
      continue;
    }
    if (/^    topics:\s*$/.test(line)) {
      inTopics = true;
      continue;
    }
    const topicMatch = line.match(/^      - id:\s*(.+)$/);
    if (topicMatch && inTopics) {
      flush();
      topic = { topic_id: scalar(topicMatch[1]), pillar_id: pillarId };
      continue;
    }
    const fieldMatch = line.match(/^        ([a-z_]+):\s*(.*)$/);
    if (topic && fieldMatch) topic[fieldMatch[1]] = scalar(fieldMatch[2]);
  }
  flush();
  return topics;
}

function authorityIndex(root) {
  const mapRows = parseTopicMap(path.join(root, "docs", "seo-aeo", "topic-map.yaml"));
  const coverageRows = readCsv(path.join(root, "docs", "seo-aeo", "topic-coverage.csv")).rows;
  const rows = [...mapRows, ...coverageRows];
  const index = new Map();
  for (const row of rows) {
    for (const value of [row.topic_id, row.primary_query, row.aeo_question, row.title, row.slug]) {
      const key = canonicalKey(value);
      if (key && !index.has(key)) index.set(key, row);
    }
  }
  return index;
}

function matchAuthority(index, query) {
  const key = canonicalKey(query);
  if (index.has(key)) return index.get(key);
  for (const [authorityKey, row] of index.entries()) {
    if (authorityKey && (authorityKey.includes(key) || key.includes(authorityKey))) return row;
  }
  return null;
}

function sourceAllowedPublicUse(sourceType, source = {}) {
  const configured = String(source.allowed_public_use || source.allowedPublicUse || "").trim().toLowerCase().replaceAll("-", "_");
  if (/reddit|manual_ai_prompt_export/.test(sourceType)) return "none";
  if (configured === "none" || configured === "topic_direction") return configured;
  if (/gsc|bing_webmaster/.test(sourceType)) return "refresh_direction";
  return "topic_direction";
}

function isManualOnlySourceType(sourceType) {
  return ["manual_topic_seed", "manual_ai_prompt_export", "manual_serp_observation", "reddit_manual_capture", "reddit_api_export"].includes(sourceType);
}

const DIRECT_VALIDATED_DEMAND_SOURCE_TYPES = new Set([
  "gsc_emerging_query_export",
  "bing_webmaster_query_export",
  "google_trends_csv_export",
  "google_trends_api_export",
]);

function isAffirmativeDemandReview(value) {
  return /^(1|true|yes|y|reviewed|validated)$/i.test(String(value ?? "").trim());
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

function isReviewedDemandSource(source = {}) {
  if (source.source_type !== "other_query_tool_export") return false;
  return (
    String(source.demand_validation_status || "").trim() === "validated" &&
    hasText(source.validation_source) &&
    hasText(source.reviewed_by)
  );
}

function isReviewedDemandRow(row = {}, source = {}) {
  if (row.source_type !== "other_query_tool_export") return false;
  return (
    isAffirmativeDemandReview(row.validated_demand) &&
    hasText(row.validation_source) &&
    hasText(row.reviewed_by)
  ) || isReviewedDemandSource(source);
}

function isValidatedDemandRow(row = {}, source = {}) {
  const merged = { ...source, ...row };
  if (isPublicFeedLikeSource(merged)) return false;
  if (row.source_type === "google_trends_csv_export") {
    return (
      String(source.collection_method || "").trim() === "manual_export" &&
      (hasText(row.trend_delta) || hasText(row.trend_window) || hasText(row.notes))
    );
  }
  if (DIRECT_VALIDATED_DEMAND_SOURCE_TYPES.has(row.source_type)) return true;
  return isReviewedDemandRow(row, source);
}

function sourceMap(sources) {
  return new Map(Array.from(sources.values()).map((source) => [source.source_id, source]));
}

const QUERY_EXPORT_SOURCE_TYPES = new Set([
  "reddit_manual_capture",
  "reddit_api_export",
  "answer_the_public_export",
  "gsc_search_query_export",
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

const SOURCE_TYPE_SURFACES = {
  answer_the_public_export: "answer_the_public",
  bing_webmaster_query_export: "bing_webmaster_tools",
  gsc_search_query_export: "google_search_console",
  gsc_emerging_query_export: "google_search_console",
  google_trends_api_export: "google_trends",
  google_trends_csv_export: "google_trends",
  public_source_trend_export: "public_feed_capture",
  reddit_manual_capture: "reddit",
  reddit_api_export: "reddit",
  other_query_tool_export: "query_tool_export",
};

function sourceTypeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizedSourceText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function publicFeedSourceProfile(surface = "public_feed_capture") {
  return {
    sourceType: "public_source_trend_export",
    surface,
    label: "Public RSS/feed trend capture",
    notes: "Public RSS/feed captures are source leads only and do not validate demand for packet intake.",
  };
}

function gscSourceProfile() {
  return {
    sourceType: "gsc_emerging_query_export",
    surface: "google_search_console",
    label: "Google Search Console",
    notes: "Search Console rows validate search-demand direction only; they are not factual article evidence.",
  };
}

function sourceProfileFromText(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const token = sourceTypeToken(raw);
  if (token === "google_trends_rss" || token === "google_trends_rss_export") {
    return publicFeedSourceProfile("google_trends_rss");
  }
  if (token === "public_source_trend_export") {
    return publicFeedSourceProfile();
  }
  if (QUERY_EXPORT_SOURCE_TYPES.has(token)) {
    if (token === "gsc_search_query_export" || token === "gsc_emerging_query_export") return gscSourceProfile();
    return {
      sourceType: token,
      surface: SOURCE_TYPE_SURFACES[token] || token,
      label: SOURCE_TYPE_SURFACES[token] || token,
    };
  }

  const text = normalizedSourceText(raw);
  if (/\bpublic\s+trends?\b|\b(rss|atom|feed)\b/.test(text)) {
    return publicFeedSourceProfile(/\bgoogle trends?\b/.test(text) ? "google_trends_rss" : "public_feed_capture");
  }
  if (/\b(answer\s*the\s*public|answerthepublic)\b/.test(text)) {
    return {
      sourceType: "answer_the_public_export",
      surface: "answer_the_public",
      label: "AnswerThePublic",
    };
  }
  if (/\bbing\b/.test(text) && /\b(webmaster|webmaster tools|search performance|query)\b/.test(text)) {
    return {
      sourceType: "bing_webmaster_query_export",
      surface: "bing_webmaster_tools",
      label: "Bing Webmaster Tools",
    };
  }
  if (/\bgoogle search console\b|\bsearch console\b|\bgsc\b|\bgoogle_search_console\b/.test(text)) {
    return gscSourceProfile();
  }
  if (/\bgoogle trends?\b/.test(text)) {
    return {
      sourceType: "google_trends_csv_export",
      surface: "google_trends",
      label: "Google Trends CSV",
    };
  }
  if (/\balso\s*asked\b|\balsoasked\b/.test(text)) {
    return {
      sourceType: "other_query_tool_export",
      surface: "alsoasked",
      label: "AlsoAsked",
    };
  }
  if (/\bahrefs\b/.test(text)) {
    return {
      sourceType: "other_query_tool_export",
      surface: "ahrefs",
      label: "Ahrefs",
    };
  }
  if (/\bsemrush\b|\bsem rush\b/.test(text)) {
    return {
      sourceType: "other_query_tool_export",
      surface: "semrush",
      label: "Semrush",
    };
  }

  return null;
}

function importedQuerySourceProfile(inputPath, rows) {
  const values = [
    path.basename(inputPath, ".csv"),
    ...rows.flatMap((row) => [
      pick(row, ["source_type"]),
      pick(row, ["source"]),
      pick(row, ["surface"]),
    ]),
  ];
  let fallback = null;
  for (const value of values) {
    const profile = sourceProfileFromText(value);
    if (!profile) continue;
    if (profile.sourceType !== "other_query_tool_export") return profile;
    fallback ||= profile;
  }
  return (
    fallback || {
      sourceType: "other_query_tool_export",
      surface: "query_tool_export",
      label: "Query tool",
    }
  );
}

function importedQueryText(row) {
  return pick(row, ["query", "question", "keyword", "search term", "search query", "term", "topic", "related query", "rising query", "prompt"]);
}

function reviewedDemandFields(row) {
  const validatedDemand = pick(row, ["validated_demand", "demand_validated", "reviewed_demand"]);
  const validationSource = pick(row, ["validation_source", "paired_source", "validated_by_source"]);
  const reviewedBy = pick(row, ["reviewed_by", "reviewer"]);
  const reviewed = isAffirmativeDemandReview(validatedDemand) && hasText(validationSource) && hasText(reviewedBy);
  return {
    validated_demand: validatedDemand,
    validation_source: validationSource,
    reviewed_by: reviewedBy,
    demand_validation_status: reviewed ? "validated" : "",
  };
}

function reviewedQueryToolExportMetadata(rows, sourceType) {
  if (sourceType !== "other_query_tool_export") return {};
  const queryRows = rows.filter(importedQueryText);
  const reviewedRows = queryRows.filter((row) => reviewedDemandFields(row).demand_validation_status === "validated");
  if (!queryRows.length || !reviewedRows.length) return {};

  const validationSources = Array.from(new Set(reviewedRows.map((row) => reviewedDemandFields(row).validation_source).filter(hasText)));
  const reviewers = Array.from(new Set(reviewedRows.map((row) => reviewedDemandFields(row).reviewed_by).filter(hasText)));
  if (reviewedRows.length !== queryRows.length) {
    return {
      demand_validation_status: "partially_reviewed",
      validation_source: validationSources.join("; "),
      reviewed_by: reviewers.join("; "),
    };
  }

  return {
    demand_validation_status: "validated",
    validation_source: validationSources.join("; "),
    reviewed_by: reviewers.join("; "),
  };
}

function addSource(sources, source) {
  if (!source.source_id || sources.has(source.source_id)) return;
  sources.set(source.source_id, {
    schema_version: undefined,
    ...source,
    evidence_use: "discovery_only",
  });
}

function buildRow({ index, source, query, observedAt, sourceRecordId = "", metrics = {}, extra = {}, authority }) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const match = matchAuthority(authority, normalized);
  const sourceType = source.source_type;
  return {
    query_id: `dq-${String(index).padStart(4, "0")}`,
    source_id: source.source_id,
    source_type: sourceType,
    source_record_id: sourceRecordId,
    query,
    normalized_query: normalized,
    canonical_query_key: canonicalKey(normalized),
    intent: extra.intent || classifyIntent(normalized),
    funnel_stage: extra.funnel_stage || "unknown",
    audience: extra.audience || "b2b_gtm_operator",
    pillar_id: extra.pillar_id || match?.pillar_id || mapPillar(normalized),
    topic_id: extra.topic_id || match?.topic_id || "",
    surface: extra.surface || source.surface || sourceType,
    country: extra.country || source.country || "US",
    language: extra.language || source.language || "en",
    observed_at: observedAt,
    page_url: extra.page_url || metrics.page_url || "",
    device: extra.device || metrics.device || "",
    volume: metrics.volume || "",
    difficulty: metrics.difficulty || "",
    impressions: metrics.impressions || "",
    clicks: metrics.clicks || "",
    ctr: metrics.ctr || "",
    avg_position: metrics.avg_position || "",
    trend_delta: metrics.trend_delta || "",
    trend_window: metrics.trend_window || "",
    confidence: extra.confidence || (sourceType === "gsc_emerging_query_export" ? "high" : "medium"),
    evidence_use: "discovery_only",
    allowed_public_use: sourceAllowedPublicUse(sourceType, source),
    raw_path: source.path || "",
    notes: extra.notes || "Discovery-only query row. Do not cite as factual evidence.",
    validated_demand: extra.validated_demand || "",
    validation_source: extra.validation_source || "",
    reviewed_by: extra.reviewed_by || "",
    demand_validation_status: extra.demand_validation_status || source.demand_validation_status || "",
  };
}

function copyRawFile(root, inputPath, rawDir, outputName) {
  const target = path.join(rawDir, outputName);
  fs.copyFileSync(inputPath, target);
  return relative(root, target);
}

function searchQueryAnalyticsSource(row, runDate) {
  const sourceText = String(row.source || "").toLowerCase();
  if (/bing/.test(sourceText)) {
    return {
      source_id: `bing-webmaster-analytics-${runDate}`,
      source_type: "bing_webmaster_query_export",
      name: "Normalized Bing Webmaster Tools query analytics",
      captured_by: "scripts/seo-aeo/build-discovery-run.mjs",
      captured_at: new Date().toISOString(),
      surface: "bing_webmaster_tools",
      country: "US",
      language: "en",
      path: "analytics/search_query_daily.csv",
      allowed_public_use: "refresh_direction",
      collection_method: "api_or_reviewed_export",
      sanitization_status: "aggregate_only",
      license_or_terms_note: "Use internal Bing search performance data for discovery and prioritization only.",
      notes: "Rows are discovery signals, not factual article evidence.",
    };
  }

  return {
    source_id: `gsc-analytics-${runDate}`,
    source_type: "gsc_emerging_query_export",
    name: "Normalized Google Search Console query analytics",
    captured_by: "scripts/seo-aeo/build-discovery-run.mjs",
    captured_at: new Date().toISOString(),
    surface: "google_search_console",
    country: "US",
    language: "en",
    path: "analytics/search_query_daily.csv",
    allowed_public_use: "refresh_direction",
    collection_method: "read_only_export",
    sanitization_status: "aggregate_only",
    license_or_terms_note: "Use internal Search Console performance data for discovery and prioritization only.",
    notes: "Rows are discovery signals, not factual article evidence.",
  };
}

function collectSearchQueryAnalyticsRows(root, runDate, authority, sources, discoveryRows) {
  const filePath = path.join(root, "analytics", "search_query_daily.csv");
  const rows = readRows(filePath).filter((row) => row.query && (row.impressions || row.clicks || row.avg_position));
  if (!rows.length) return;

  for (const row of rows.slice(-200)) {
    const source = searchQueryAnalyticsSource(row, runDate);
    addSource(sources, source);
    discoveryRows.push(
      buildRow({
        index: discoveryRows.length + 1,
        source,
        query: row.query,
        observedAt: row.date || runDate,
        sourceRecordId: [row.date, row.page_url, row.device, row.country].filter(Boolean).join("|"),
        metrics: {
          page_url: row.page_url,
          device: row.device,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          avg_position: row.avg_position,
        },
        extra: {
          topic_id: row.topic_id || "",
          pillar_id: row.pillar_id || "",
          country: row.country || "US",
          confidence: Number(row.impressions || 0) > 20 ? "high" : "medium",
          notes: `${source.name} row used for refresh, internal-link, and topic-priority discovery only.`,
        },
        authority,
      })
    );
  }
}

function collectAiCitationRows(root, runDate, authority, sources, discoveryRows) {
  const filePath = path.join(root, "analytics", "ai_citation_log.csv");
  const rows = readRows(filePath).filter((row) => row.query || row.missing_angle || row.recommended_action);
  if (!rows.length) return;
  const source = {
    source_id: `ai-citation-log-${runDate}`,
    source_type: "manual_ai_prompt_export",
    name: "Manual AI citation observations",
    captured_by: "scripts/seo-aeo/build-discovery-run.mjs",
    captured_at: new Date().toISOString(),
    surface: "manual_ai_citation_log",
    country: "US",
    language: "en",
    path: "analytics/ai_citation_log.csv",
    allowed_public_use: "none",
    collection_method: "manual_capture",
    sanitization_status: "sanitized",
    license_or_terms_note: "Manual observations are discovery only and not factual evidence.",
    notes: "Use to identify AEO answer gaps and citation opportunities only.",
  };
  addSource(sources, source);

  for (const row of rows.slice(-100)) {
    const query = row.query || row.missing_angle || row.recommended_action;
    discoveryRows.push(
      buildRow({
        index: discoveryRows.length + 1,
        source,
        query,
        observedAt: row.capture_date || runDate,
        sourceRecordId: [row.capture_date, row.surface, row.target_page_url].filter(Boolean).join("|"),
        extra: {
          surface: row.surface || "manual_ai_citation_log",
          page_url: row.target_page_url,
          confidence: "medium",
          notes: `AI citation observation. Missing angle: ${row.missing_angle || "none"}. Recommended action: ${row.recommended_action || "monitor"}.`,
        },
        authority,
      })
    );
  }
}

function collectManualAiQueryObservationFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "ai-query-observations"))) {
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `ai-query-observation-${path.basename(inputPath)}`);
    const source = {
      source_id: `manual-ai-prompt-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: "manual_ai_prompt_export",
      name: `Approved sanitized AI query observation: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: "manual_ai_query_observation",
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: "none",
      collection_method: "manual_capture",
      sanitization_status: "sanitized",
      license_or_terms_note: "Approved sanitized observation only. Do not automate brittle ChatGPT network scraping.",
      notes: "Use to identify answer-engine language and search-query fan-out only. Not factual evidence.",
    };
    addSource(sources, source);

    for (const [rowIndex, row] of readRows(inputPath).entries()) {
      const query = pick(row, ["query", "search_query", "generated_query", "question", "prompt"]);
      if (!query) continue;
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query,
          observedAt: pick(row, ["date", "observed_at", "captured_at"]) || runDate,
          sourceRecordId: pick(row, ["source_record_id", "conversation_id", "prompt_id"]) || `${path.basename(inputPath)}:${rowIndex + 2}`,
          extra: {
            intent: pick(row, ["intent"]) || "",
            funnel_stage: pick(row, ["funnel_stage"]) || "unknown",
            surface: pick(row, ["surface", "answer_engine"]) || "manual_ai_query_observation",
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            confidence: "low",
            notes: pick(row, ["notes"]) || "Approved sanitized AI-query observation. Discovery only; do not cite.",
          },
          authority,
        })
      );
    }
  }
}

function collectManualSerpObservationFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "serp-observations"))) {
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `serp-observation-${path.basename(inputPath)}`);
    const source = {
      source_id: `manual-serp-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: "manual_serp_observation",
      name: `Manual SERP/AEO observation: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: "manual_serp_observation",
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: "topic_direction",
      collection_method: "manual_capture",
      sanitization_status: "sanitized",
      license_or_terms_note: "Manual public SERP observation for discovery only; not factual evidence.",
      notes: "Use to identify SERP features, source gaps, and answer formats only.",
    };
    addSource(sources, source);

    for (const [rowIndex, row] of readRows(inputPath).entries()) {
      const query = pick(row, ["query", "question", "search term", "term", "prompt"]);
      if (!query) continue;
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query,
          observedAt: pick(row, ["date", "observed_at", "captured_at"]) || runDate,
          sourceRecordId: pick(row, ["source_record_id", "serp_url", "result_url"]) || `${path.basename(inputPath)}:${rowIndex + 2}`,
          extra: {
            intent: pick(row, ["intent"]) || "",
            funnel_stage: pick(row, ["funnel_stage"]) || "unknown",
            surface: pick(row, ["surface", "serp_feature"]) || "manual_serp_observation",
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            page_url: pick(row, ["result_url", "page_url", "cited_url"]) || "",
            confidence: "medium",
            notes: pick(row, ["notes"]) || "Manual SERP/AEO observation. Discovery only; verify sources before claims.",
          },
          authority,
        })
      );
    }
  }
}

function collectManualTopicSeedFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "topic-seeds"))) {
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `topic-seed-${path.basename(inputPath)}`);
    const source = {
      source_id: `manual-topic-seed-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: "manual_topic_seed",
      name: `Manual topic seed: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: "manual_topic_seed",
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: "topic_direction",
      collection_method: "manual_capture",
      sanitization_status: "sanitized",
      license_or_terms_note: "Internal editorial topic seed. Use only for discovery and routing.",
      notes: "Seeds can route topic authority and source-gap work, but cannot validate demand alone.",
    };
    addSource(sources, source);

    for (const [rowIndex, row] of readRows(inputPath).entries()) {
      const query = pick(row, ["query", "question", "topic", "seed", "primary_query"]);
      if (!query) continue;
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query,
          observedAt: pick(row, ["date", "observed_at", "captured_at"]) || runDate,
          sourceRecordId: pick(row, ["source_record_id", "seed_id"]) || `${path.basename(inputPath)}:${rowIndex + 2}`,
          extra: {
            intent: pick(row, ["intent"]) || "",
            funnel_stage: pick(row, ["funnel_stage"]) || "unknown",
            audience: pick(row, ["audience"]) || "b2b_gtm_operator",
            pillar_id: pick(row, ["pillar_id"]) || "",
            topic_id: pick(row, ["topic_id"]) || "",
            surface: pick(row, ["surface"]) || "manual_topic_seed",
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            confidence: "low",
            notes: pick(row, ["notes"]) || "Manual topic seed. Discovery only; validate demand before packet intake.",
          },
          authority,
        })
      );
    }
  }
}

const REDDIT_MANUAL_FORBIDDEN_FIELDS = new Set([
  "account",
  "author",
  "author_name",
  "author_url",
  "body",
  "comment",
  "comment_text",
  "content",
  "full_post",
  "full_text",
  "profile",
  "profile_url",
  "raw_body",
  "raw_comment",
  "raw_post",
  "raw_text",
  "screen_name",
  "selftext",
  "text",
  "user",
  "username",
]);

function rowFieldNames(row) {
  return Object.keys(row).map((key) => key.trim().toLowerCase().replace(/[\s-]+/g, "_"));
}

function validateRedditThreadUrl(value, context) {
  const raw = String(value || "").trim();
  if (!raw) return;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${context} has invalid thread_url: ${raw}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "reddit.com" && host !== "old.reddit.com") {
    throw new Error(`${context} thread_url must be a Reddit URL.`);
  }
  if (!/^\/r\/[^/]+\/comments\//i.test(parsed.pathname)) {
    throw new Error(`${context} thread_url must point to a Reddit subreddit comments thread.`);
  }
}

function requireRedditManualValue(row, fieldNames, expected, context) {
  const actual = pick(row, fieldNames);
  if (actual !== expected) {
    throw new Error(`${context} must set ${fieldNames[0]}=${expected}.`);
  }
}

function validateManualRedditCaptureRow(row, context) {
  const forbidden = rowFieldNames(row).filter((fieldName) => REDDIT_MANUAL_FORBIDDEN_FIELDS.has(fieldName));
  if (forbidden.length) {
    throw new Error(`${context} contains forbidden Reddit raw/user field(s): ${forbidden.join(", ")}.`);
  }
  requireRedditManualValue(row, ["source"], "reddit", context);
  requireRedditManualValue(row, ["source_type"], "reddit_manual_capture", context);
  requireRedditManualValue(row, ["capture_method"], "manual_capture_no_api", context);
  requireRedditManualValue(row, ["evidence_use"], "discovery_only", context);
  requireRedditManualValue(row, ["allowed_public_use"], "none", context);
  validateRedditThreadUrl(pick(row, ["thread_url", "url", "page_url"]), context);
}

function collectManualRedditCaptureFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "reddit-manual-captures"))) {
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `reddit-manual-capture-${path.basename(inputPath)}`);
    const source = {
      source_id: `reddit-manual-capture-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: "reddit_manual_capture",
      name: `Manual sanitized Reddit capture: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: "reddit_manual_capture",
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: "none",
      collection_method: "manual_capture_no_api",
      sanitization_status: "sanitized_no_usernames_no_full_comments",
      license_or_terms_note: "Manual Reddit observations are discovery-only. Do not cite Reddit as factual evidence and do not store usernames, authors, full posts, or raw comments.",
      api_used: false,
      uses_reddit_api: false,
      validates_demand: false,
      validates_facts: false,
      notes: "Manual Reddit observations can route topic/source-gap work only. They cannot validate demand, support factual claims, or unlock packet intake without separate validated demand.",
    };
    addSource(sources, source);

    for (const [rowIndex, row] of readRows(inputPath).entries()) {
      const context = `${relative(root, inputPath)} row ${rowIndex + 2}`;
      validateManualRedditCaptureRow(row, context);
      const query = pick(row, ["query", "question", "implied_query", "topic"]);
      if (!query) continue;
      const subreddit = pick(row, ["subreddit"]).replace(/^r\//i, "");
      const rowSurface = subreddit ? `reddit:${subreddit}` : "reddit_manual_capture";
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query,
          observedAt: pick(row, ["observed_at", "date", "captured_at"]) || runDate,
          sourceRecordId: pick(row, ["source_record_id"]) || `${path.basename(inputPath)}:${rowIndex + 2}`,
          metrics: {
            trend_delta: pick(row, ["trend_delta"]),
            trend_window: pick(row, ["trend_window"]),
          },
          extra: {
            intent: pick(row, ["intent"]) || "",
            funnel_stage: pick(row, ["funnel_stage"]) || "unknown",
            audience: pick(row, ["audience"]) || "b2b_gtm_operator",
            pillar_id: pick(row, ["pillar_id"]) || "",
            topic_id: pick(row, ["topic_id"]) || "",
            surface: rowSurface,
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            page_url: pick(row, ["thread_url", "url", "page_url"]) || "",
            confidence: pick(row, ["confidence"]) || "low",
            notes:
              pick(row, ["notes"]) ||
              "Sanitized manual Reddit observation. Discovery only; do not cite and do not treat as validated demand.",
          },
          authority,
        })
      );
    }
  }
}

function collectImportedQueryFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "query-exports"))) {
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `query-export-${path.basename(inputPath)}`);
    const inputRows = readRows(inputPath);
    const sourceProfile = importedQuerySourceProfile(inputPath, inputRows);
    const sourceType = sourceProfile.sourceType;
    const demandReview = reviewedQueryToolExportMetadata(inputRows, sourceType);
    const source = {
      source_id: `${sourceType}-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: sourceType,
      name: `${sourceProfile.label || "Manual query"} export: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: sourceProfile.surface || sourceType,
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: sourceAllowedPublicUse(sourceType),
      collection_method: sourceType === "reddit_manual_capture" ? "manual_capture_no_api" : "manual_export",
      sanitization_status: sourceType === "reddit_manual_capture" ? "sanitized_no_usernames_no_full_comments" : "not_applicable",
      license_or_terms_note: "Export captured under the tool's applicable terms. Use for discovery only.",
      notes:
        sourceProfile.notes ||
        (sourceType === "answer_the_public_export"
          ? "AnswerThePublic is discovery-only by default and cannot unlock ready handoff without separate validated demand."
          : sourceType === "other_query_tool_export"
            ? "Generic query-tool exports count as validated demand only when reviewed_by, validation_source, and validated_demand are populated."
            : "Manual query exports guide topics, sections, and source gaps only."),
      ...demandReview,
    };
    addSource(sources, source);

    for (const [rowIndex, row] of inputRows.entries()) {
      const query = importedQueryText(row);
      if (!query) continue;
      const rowDemandReview = reviewedDemandFields(row);
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query,
          observedAt: pick(row, ["date", "observed_at"]) || runDate,
          sourceRecordId: pick(row, ["source_record_id", "source_export_id"]) || `${path.basename(inputPath)}:${rowIndex + 2}`,
          metrics: {
            volume: pick(row, ["volume", "search volume"]),
            difficulty: pick(row, ["difficulty", "keyword difficulty", "kd"]),
            impressions: pick(row, ["impressions"]),
            clicks: pick(row, ["clicks"]),
            ctr: pick(row, ["ctr", "click through rate", "click-through rate"]),
            avg_position: pick(row, ["avg_position", "average position", "position"]),
            trend_delta: pick(row, ["trend_delta", "change"]),
            trend_window: pick(row, ["trend_window", "period"]),
          },
          extra: {
            surface: pick(row, ["surface", "source"]) || source.surface,
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            ...rowDemandReview,
          },
          authority,
        })
      );
    }
  }
}

function hasPublicFeedTrendSignal(inputPath, rows) {
  if (/\b(public[-_ ]?trends?|rss|atom|feed)\b/i.test(path.basename(inputPath))) return true;
  return rows.some((row) => {
    if (pick(row, ["source_kind", "feed_url", "item_url", "source_name", "news_item_urls", "news_item_sources", "news_item_titles"])) {
      return true;
    }
    const sourceText = [
      pick(row, ["source"]),
      pick(row, ["surface"]),
      pick(row, ["trend_window"]),
    ].join(" ");
    return /\bgoogle[_ -]?trends?[_ -]?rss\b|\b(rss|atom|feed)\b/i.test(sourceText);
  });
}

function trendSourceTypeFor(inputPath, rows) {
  if (hasPublicFeedTrendSignal(inputPath, rows)) return "public_source_trend_export";
  return "google_trends_csv_export";
}

function isCurrentDatedTrendFile(inputPath, runDate) {
  const name = path.basename(inputPath);
  return name.includes(runDate);
}

function publicTrendRowSource(baseSource, row, runDate) {
  const sourceSlug = slugify(pick(row, ["source_id", "source", "source_name"]) || baseSource.source_id);
  return {
    ...baseSource,
    source_id: `public-trends-${sourceSlug}-${runDate.replaceAll("-", "")}`,
    name: pick(row, ["source_name", "source"]) || baseSource.name,
    surface: pick(row, ["surface", "source_kind"]) || baseSource.surface,
    country: pick(row, ["country", "geo"]) || baseSource.country,
    language: pick(row, ["language", "lang"]) || baseSource.language,
    allowed_public_use: pick(row, ["allowed_public_use", "allowed public use"]) || baseSource.allowed_public_use || "topic_direction",
    notes: pick(row, ["notes"]) || baseSource.notes,
  };
}

function collectTrendFiles(root, runDate, authority, sources, discoveryRows, rawDir) {
  for (const inputPath of csvFiles(path.join(root, "imports", "trends"))) {
    if (!isCurrentDatedTrendFile(inputPath, runDate)) continue;
    const relativeRawPath = copyRawFile(root, inputPath, rawDir, `trend-export-${path.basename(inputPath)}`);
    const inputRows = readRows(inputPath);
    const sourceType = trendSourceTypeFor(inputPath, inputRows);
    const source = {
      source_id: `${sourceType === "public_source_trend_export" ? "public-trends" : "google-trends"}-${slugify(path.basename(inputPath, ".csv"))}-${runDate}`,
      source_type: sourceType,
      name:
        sourceType === "public_source_trend_export"
          ? `Public RSS/Atom/JSON feed trend capture: ${path.basename(inputPath)}`
          : `Google Trends or trend CSV export: ${path.basename(inputPath)}`,
      captured_by: "Sell In Public editorial",
      captured_at: new Date().toISOString(),
      surface: sourceType === "public_source_trend_export" ? "public_feed_capture" : "google_trends_or_trend_csv",
      country: "US",
      language: "en",
      path: relativeRawPath,
      allowed_public_use: sourceType === "public_source_trend_export" ? "topic_direction" : "topic_direction",
      collection_method: sourceType === "public_source_trend_export" ? "public_feed_capture" : "manual_export",
      sanitization_status: "not_applicable",
      license_or_terms_note:
        sourceType === "public_source_trend_export"
          ? "Public headline/feed metadata is discovery only and must not be cited as factual evidence without source verification."
          : "Trend values are relative interest only, not factual demand volume.",
      notes:
        sourceType === "public_source_trend_export"
          ? "Use public feed captures for emerging language, source leads, and source-discovery tasks only."
          : "Use trend movement for prioritization only.",
    };
    if (sourceType !== "public_source_trend_export") addSource(sources, source);

    for (const [rowIndex, row] of inputRows.entries()) {
      const rowSource = sourceType === "public_source_trend_export" ? publicTrendRowSource(source, row, runDate) : source;
      addSource(sources, rowSource);
      const query = pick(row, ["query", "term", "topic", "title", "related query", "rising query", "keyword"]);
      if (!query) continue;
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source: rowSource,
          query,
          observedAt: pick(row, ["date", "observed_at"]) || runDate,
          sourceRecordId: `${path.basename(inputPath)}:${rowIndex + 2}`,
          metrics: {
            volume: pick(row, ["volume", "search volume", "search_volume", "approx_traffic", "approx traffic"]),
            trend_delta: pick(row, ["trend_delta", "change", "growth", "value"]),
            trend_window: pick(row, ["trend_window", "timeframe", "period"]) || "unknown",
          },
          extra: {
            surface: pick(row, ["surface", "source_kind", "source"]) || source.surface,
            country: pick(row, ["country", "geo"]) || "US",
            language: pick(row, ["language", "lang"]) || "en",
            page_url: pick(row, ["item_url", "page_url", "url"]) || "",
            confidence: pick(row, ["confidence"]) || (sourceType === "public_source_trend_export" ? "low" : "medium"),
            notes:
              pick(row, ["notes"]) ||
              (sourceType === "public_source_trend_export"
                ? "Public feed headline. Discovery only; route to Source Registry before using as evidence."
                : "Trend export row. Treat values as relative movement only."),
          },
          authority,
        })
      );
    }
  }
}

function daysBetweenIso(left, right) {
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return Infinity;
  return Math.abs(Math.round((rightDate.getTime() - leftDate.getTime()) / 86400000));
}

function runDateFromTrendRunName(name) {
  return String(name || "").match(/^(\d{4}-\d{2}-\d{2})-/)?.[1] || "";
}

function collectExistingTrendRun(root, runDate, authority, sources, discoveryRows) {
  const trendRoot = path.join(root, "research", "trend-intelligence");
  if (!fs.existsSync(trendRoot)) return;
  const runs = fs
    .readdirSync(trendRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== `${runDate}-daily-discovery` && !entry.name.startsWith(".") && entry.name !== "templates")
    .map((entry) => path.join(trendRoot, entry.name))
    .sort()
    .reverse();

  for (const runDir of runs.slice(0, 2)) {
    const carriedDate = runDateFromTrendRunName(path.basename(runDir));
    if (!carriedDate || daysBetweenIso(carriedDate, runDate) > 7) continue;
    const normalizedPath = path.join(runDir, "normalized-discovery-queries.csv");
    const manifestPath = path.join(runDir, "source-manifest.json");
    if (!existsFile(normalizedPath)) continue;

    let manifestSources = [];
    try {
      manifestSources = JSON.parse(fs.readFileSync(manifestPath, "utf8")).sources || [];
    } catch {
      manifestSources = [];
    }
    for (const source of manifestSources) addSource(sources, source);

    for (const row of readRows(normalizedPath)) {
      const source = sources.get(row.source_id) || {
        source_id: row.source_id || `trend-run-${path.basename(runDir)}`,
        source_type: row.source_type || "other_query_tool_export",
        surface: row.surface || "trend_intelligence",
        country: row.country || "US",
        language: row.language || "en",
        path: relative(root, normalizedPath),
      };
      addSource(sources, source);
      discoveryRows.push(
        buildRow({
          index: discoveryRows.length + 1,
          source,
          query: row.query || row.normalized_query,
          observedAt: row.observed_at || runDate,
          sourceRecordId: row.source_record_id || row.query_id,
          metrics: row,
          extra: {
            intent: row.intent,
            funnel_stage: row.funnel_stage,
            audience: row.audience,
            pillar_id: row.pillar_id,
            topic_id: row.topic_id,
            surface: row.surface,
            country: row.country,
            language: row.language,
            page_url: row.page_url,
            confidence: row.confidence || "medium",
            notes: "Carried forward from an existing trend-intelligence normalized discovery run.",
          },
          authority,
        })
      );
    }
  }
}

function dedupeRows(rows) {
  const byKey = new Map();
  const duplicates = [];
  const cleanRows = rows.filter(Boolean);
  for (const row of cleanRows) {
    const key = row.canonical_query_key || canonicalKey(row.normalized_query || row.query);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingMetric = Number(existing.impressions || existing.volume || existing.clicks || 0);
    const rowMetric = Number(row.impressions || row.volume || row.clicks || 0);
    const canonical = rowMetric > existingMetric ? row : existing;
    const duplicate = rowMetric > existingMetric ? existing : row;
    if (rowMetric > existingMetric) byKey.set(key, row);
    duplicates.push({
      duplicate_id: `dup-${String(duplicates.length + 1).padStart(4, "0")}`,
      canonical_query_id: canonical.query_id,
      duplicate_query_id: duplicate.query_id,
      match_type: "canonical_query_key",
      match_confidence: "high",
      merge_decision: "merge",
      reason: `Same canonical query key: ${key}`,
      reviewer: "automation",
      reviewed_at: new Date().toISOString(),
    });
  }
  return { rows: cleanRows, duplicates };
}

function clusterRows(rows, sources) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.topic_id || `${row.pillar_id}:${row.intent}:${canonicalKey(row.query).split(" ").slice(0, 5).join(" ")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const sourcesById = sourceMap(sources);
  function representativeWeight(row) {
    const source = sourcesById.get(row.source_id) || {};
    const metric = Number(row.impressions || row.clicks || row.volume || 0);
    if (row.source_type === "gsc_emerging_query_export") return 100000000 + metric;
    if (isValidatedDemandRow(row, source)) return 50000000 + metric;
    if (isPublicFeedLikeSource({ ...source, ...row })) return metric;
    return 1000000 + metric;
  }
  return Array.from(groups.entries()).map(([key, group], index) => {
    const representative = group.sort((a, b) => representativeWeight(b) - representativeWeight(a))[0];
    const sourceTypes = Array.from(new Set(group.map((row) => row.source_type).filter(Boolean)));
    const sourceIds = Array.from(new Set(group.map((row) => row.source_id).filter(Boolean)));
    const hasPerformance = group.some((row) => row.source_type === "gsc_emerging_query_export");
    const hasValidatedDemandSignal = group.some((row) => isValidatedDemandRow(row, sourcesById.get(row.source_id)));
    const confidence = sourceTypes.length >= 2 || hasPerformance ? "medium" : "low";
    let decision = "monitor";
    let recommendedAsset = "monitor_only";
    if (representative.topic_id && hasPerformance) {
      decision = "refresh_packet";
      recommendedAsset = "refresh";
    } else if (representative.topic_id && sourceTypes.length >= 2 && hasValidatedDemandSignal) {
      decision = representative.intent === "objection" ? "map_as_faq" : "map_as_section";
      recommendedAsset = representative.intent === "objection" ? "faq" : "section";
    }

    return {
      cluster_id: `cluster-${String(index + 1).padStart(3, "0")}-${slugify(key).slice(0, 36)}`,
      label: representative.query,
      intent: representative.intent,
      pillar_id: representative.pillar_id,
      topic_id: representative.topic_id,
      representative_query: representative.query,
      canonical_query_ids: group.map((row) => row.query_id),
      source_ids: sourceIds,
      source_types: sourceTypes,
      cluster_confidence: confidence,
      recommended_asset: recommendedAsset,
      topic_score: "",
      decision,
      source_readiness: "needs_source_discovery",
      evidence_use: "discovery_only",
      excluded_sources_for_evidence: sourceIds,
      source_gaps: ["Find approved factual sources before drafting any public claims."],
      sme_questions: ["What internal examples or buyer language should be validated before this becomes a post or section?"],
      notes: "Discovery-only cluster generated by scripts/seo-aeo/build-discovery-run.mjs.",
    };
  });
}

function yamlValue(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlArray(values, indent = "      ") {
  const items = (values || []).filter((value) => String(value ?? "").trim() !== "");
  if (!items.length) return " []";
  return `\n${items.map((item) => `${indent}- ${yamlValue(item)}`).join("\n")}`;
}

function clustersYaml(runId, runDate, clusters) {
  if (!clusters.length) {
    return `schema_version: "1.0"
run_id: ${yamlValue(runId)}
updated_at: ${yamlValue(runDate)}
rule: "Cluster by semantic intent. Discovery data is not factual evidence."

clusters: []
`;
  }

  return `schema_version: "1.0"
run_id: ${yamlValue(runId)}
updated_at: ${yamlValue(runDate)}
rule: "Cluster by semantic intent. Discovery data is not factual evidence."

clusters:
${clusters
  .map(
    (cluster) => `  - cluster_id: ${yamlValue(cluster.cluster_id)}
    label: ${yamlValue(cluster.label)}
    intent: ${yamlValue(cluster.intent)}
    pillar_id: ${yamlValue(cluster.pillar_id)}
    topic_id: ${yamlValue(cluster.topic_id)}
    representative_query: ${yamlValue(cluster.representative_query)}
    canonical_query_ids:${yamlArray(cluster.canonical_query_ids, "      ")}
    source_ids:${yamlArray(cluster.source_ids, "      ")}
    source_types:${yamlArray(cluster.source_types, "      ")}
    cluster_confidence: ${yamlValue(cluster.cluster_confidence)}
    recommended_asset: ${yamlValue(cluster.recommended_asset)}
    topic_score: ${cluster.topic_score || ""}
    decision: ${yamlValue(cluster.decision)}
    source_readiness: ${yamlValue(cluster.source_readiness)}
    evidence_use: "discovery_only"
    excluded_sources_for_evidence:${yamlArray(cluster.excluded_sources_for_evidence, "      ")}
    source_gaps:${yamlArray(cluster.source_gaps, "      ")}
    sme_questions:${yamlArray(cluster.sme_questions, "      ")}
    notes: ${yamlValue(cluster.notes)}
`
  )
  .join("")}`;
}

function handoffStatus(rows, clusters, sources) {
  const sourceTypes = new Set(rows.map((row) => row.source_type));
  const sourcesById = sourceMap(sources);
  const hasStrongSignals = rows.some((row) => row.source_type === "gsc_emerging_query_export" && Number(row.impressions || 0) >= 10);
  const hasValidatedDemandSignal = rows.some((row) => isValidatedDemandRow(row, sourcesById.get(row.source_id)));
  const manualOnly = sourceTypes.size > 0 && Array.from(sourceTypes).every(isManualOnlySourceType);
  const usableClusters = clusters.filter((cluster) => cluster.decision !== "monitor");
  if (manualOnly) return rows.length || sources.size ? "draft" : "no_inputs";
  if (usableClusters.length && rows.length >= 5 && sourceTypes.size >= 2 && (hasStrongSignals || hasValidatedDemandSignal)) return "ready";
  if (rows.length || sources.size) return "draft";
  return "no_inputs";
}

function handoffYaml(runId, runDate, status, clusters) {
  const candidates = handoffCandidateClusters(clusters)
    .slice(0, 12)
    .map((cluster, index) => {
      const title = cluster.label.replace(/\?+$/, "");
      const aeoQuestion = cluster.representative_query.endsWith("?")
        ? cluster.representative_query
        : `What should B2B teams know about ${cluster.representative_query}?`;
      return `  - candidate_id: "candidate-${String(index + 1).padStart(3, "0")}"
    cluster_id: ${yamlValue(cluster.cluster_id)}
    recommended_title: ${yamlValue(title)}
    slug_candidate: ${yamlValue(slugify(title))}
    primary_query: ${yamlValue(cluster.representative_query)}
    secondary_queries: []
    aeo_question: ${yamlValue(aeoQuestion)}
    pillar_id: ${yamlValue(cluster.pillar_id)}
    topic_id: ${yamlValue(cluster.topic_id)}
    recommended_asset: ${yamlValue(cluster.recommended_asset)}
    decision: ${yamlValue(cluster.decision)}
    cluster_confidence: ${yamlValue(cluster.cluster_confidence)}
    discovery_sources:${yamlArray(cluster.source_ids, "      ")}
    excluded_sources_for_evidence:${yamlArray(cluster.excluded_sources_for_evidence, "      ")}
    source_gaps:${yamlArray(cluster.source_gaps, "      ")}
    sme_questions:${yamlArray(cluster.sme_questions, "      ")}
    internal_links:
      - "https://sellinpublic.co/blog/"
    reason_to_create_or_refresh: ${yamlValue(status === "ready" ? "Multi-source discovery signal is ready for topic/source review." : "")}
    reason_to_wait: ${yamlValue(status === "ready" ? "" : "Needs stronger source diversity, GSC metrics, or source readiness before packet creation.")}
`;
    });

  return `schema_version: "1.0"
run_id: ${yamlValue(runId)}
created_at: ${yamlValue(runDate)}
handoff_status: ${yamlValue(status)}
rule: "Packet owners must still validate topic score, source readiness, and SME gaps. Discovery data is not factual evidence."

${candidates.length ? `recommended_packets:\n${candidates.join("")}` : "recommended_packets: []\n"}`;
}

function handoffCandidateClusters(clusters) {
  return clusters.filter((cluster) => cluster.decision !== "monitor");
}

function topicRows(clusters, capturedAt) {
  return clusters.map((cluster) => ({
    captured_at: capturedAt,
    topic: cluster.representative_query,
    intent: cluster.intent,
    source_count: cluster.source_ids.length,
    max_score: cluster.source_types.includes("gsc_emerging_query_export") ? 80 : 50,
    evidence_use: "discovery_only",
    recommended_next_action:
      cluster.decision === "monitor"
        ? "monitor_until_stronger_signal"
        : "route_to_topic_cartographer_and_source_registry_before_packet",
  }));
}

function writeRollup(filePath, report) {
  const inputLines = report.inputs
    .map((input) => `| ${input.source_type} | ${input.status} | \`${input.artifact || ""}\` | ${input.notes || ""} |`)
    .join("\n");
  const candidateLines = report.clusters
    .slice(0, 20)
    .map((cluster) => `| ${cluster.cluster_id} | ${cluster.decision} | ${cluster.representative_query} |`)
    .join("\n");
  const markdown = `# Daily Discovery Rollup

Run: \`${report.run_id}\`

Rule: Discovery data is not factual evidence. Reddit, public feeds, Google Trends RSS, manual AI prompt exports, autocomplete, PAA, and query exports are discovery only unless a separate validated-demand import explicitly qualifies them for planning gates.

## Inputs

| Source type | Status | Artifact | Notes |
|---|---|---|---|
${inputLines}

## Summary

- Normalized discovery rows: ${report.rows.length}
- Unique source types: ${report.source_types.length}
- Clusters: ${report.clusters.length}
- Handoff status: ${report.handoff_status}

## Cluster Changes

| Cluster | Decision | Summary |
|---|---|---|
${candidateLines || "| None | monitor | No discovery rows available. |"}

## Source Gaps

- Every candidate requires approved factual sources before drafting public claims.

## QA

- [x] Every normalized row uses \`evidence_use: discovery_only\`.
- [x] Reddit rows use \`allowed_public_use: none\`.
- [x] Manual AI prompt rows use \`allowed_public_use: none\`.
- [ ] Downstream claim ledgers and \`citations.json\` still require separate Source Registry and Claim Ledger QA before drafting or publishing.
- [ ] This rollup does not prove that discovery sources were excluded from future factual claims; it only records discovery-lane boundaries for this run.
- [x] Analytics CSVs were read but not edited.
`;
  fs.writeFileSync(filePath, markdown);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const runId = `${runDate}-daily-discovery`;
  const capturedAt = new Date().toISOString();
  const trendDir = ensureDir(path.join(root, "research", "trend-intelligence", runId));
  const rawDir = ensureDir(path.join(trendDir, "raw"));
  const queryDir = path.join(root, "research", "query-intelligence", runId);
  const sources = new Map();
  const discoveryRows = [];
  const authority = authorityIndex(root);

  collectSearchQueryAnalyticsRows(root, runDate, authority, sources, discoveryRows);
  collectAiCitationRows(root, runDate, authority, sources, discoveryRows);
  collectManualAiQueryObservationFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectManualSerpObservationFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectManualTopicSeedFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectManualRedditCaptureFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectImportedQueryFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectTrendFiles(root, runDate, authority, sources, discoveryRows, rawDir);
  collectExistingTrendRun(root, runDate, authority, sources, discoveryRows);

  const { rows, duplicates } = dedupeRows(discoveryRows);
  const clusters = clusterRows(rows, sources);
  const status = handoffStatus(rows, clusters, sources);
  const sourceList = Array.from(sources.values()).map((source) => {
    const clean = { ...source };
    delete clean.schema_version;
    return clean;
  });
  const manifest = {
    schema_version: "1.0",
    run_id: runId,
    run_date: runDate,
    created_at: capturedAt,
    rule: "Discovery inputs only. Do not cite these sources as factual evidence in public articles.",
    owner: "Sell In Public editorial",
    sources: sourceList,
  };

  const manifestPath = path.join(trendDir, "source-manifest.json");
  const discoveryCsvPath = path.join(trendDir, "normalized-discovery-queries.csv");
  const dedupePath = path.join(trendDir, "dedupe-map.csv");
  const clustersPath = path.join(trendDir, "query-clusters.yaml");
  const handoffPath = path.join(trendDir, "brief-handoff-candidates.yaml");

  writeJsonAtomic(manifestPath, manifest);
  writeCsvAtomic(discoveryCsvPath, DISCOVERY_HEADERS, rows);
  writeCsvAtomic(dedupePath, ["duplicate_id", "canonical_query_id", "duplicate_query_id", "match_type", "match_confidence", "merge_decision", "reason", "reviewer", "reviewed_at"], duplicates);
  fs.writeFileSync(clustersPath, clustersYaml(runId, runDate, clusters));
  fs.writeFileSync(handoffPath, handoffYaml(runId, runDate, status, clusters));
  fs.writeFileSync(
    path.join(trendDir, "query-decisions.md"),
    `# Query Discovery Decisions\n\nRun: ${runId}\n\nDiscovery rows can guide packet planning, H2s, FAQs, refreshes, and source gaps. They do not support factual claims and must not be cited.\n\nHandoff status: ${status}\n\nRows: ${rows.length}\nClusters: ${clusters.length}\nSource types: ${Array.from(new Set(rows.map((row) => row.source_type))).join(", ") || "none"}\n`
  );
  fs.writeFileSync(path.join(trendDir, "review-notes.md"), `# Review Notes\n\n- Handoff status: ${status}\n- Review source diversity and source gaps before opening packets.\n`);
  writeCsvAtomic(path.join(trendDir, "topic-candidates.csv"), TOPIC_HEADERS, topicRows(clusters, capturedAt));

  const hasHandoffCandidates = handoffCandidateClusters(clusters).length > 0;
  if (rows.length && hasHandoffCandidates) {
    ensureDir(queryDir);
    ensureDir(path.join(queryDir, "raw"));
    writeJsonAtomic(path.join(queryDir, "source-manifest.json"), manifest);
    writeCsvAtomic(
      path.join(queryDir, "normalized-queries.csv"),
      QUERY_HEADERS,
      rows.map((row) => Object.fromEntries(QUERY_HEADERS.map((header) => [header, row[header] || ""])))
    );
    writeCsvAtomic(path.join(queryDir, "dedupe-map.csv"), ["duplicate_id", "canonical_query_id", "duplicate_query_id", "match_type", "match_confidence", "merge_decision", "reason", "reviewer", "reviewed_at"], duplicates);
    fs.writeFileSync(path.join(queryDir, "query-clusters.yaml"), clustersYaml(runId, runDate, clusters));
    fs.writeFileSync(path.join(queryDir, "query-decisions.md"), fs.readFileSync(path.join(trendDir, "query-decisions.md"), "utf8"));
    fs.writeFileSync(path.join(queryDir, "brief-handoff.yaml"), handoffYaml(runId, runDate, status, clusters));
    fs.cpSync(path.join(trendDir, "raw"), path.join(queryDir, "raw"), { recursive: true });
  }

  const queryExportFiles = csvFiles(path.join(root, "imports", "query-exports"));
  const queryExportProfiles = queryExportFiles.map((filePath) => importedQuerySourceProfile(filePath, readRows(filePath)));
  const trendFiles = csvFiles(path.join(root, "imports", "trends"));
  const trendSourceTypes = trendFiles.map((filePath) => trendSourceTypeFor(filePath, readRows(filePath)));
  const analyticsQueryRows = readRows(path.join(root, "analytics", "search_query_daily.csv"));
  const hasQueryExportSourceType = (sourceType) => queryExportProfiles.some((profile) => profile.sourceType === sourceType);
  const hasTrendSourceType = (sourceType) => trendSourceTypes.includes(sourceType);
  const hasAnalyticsSource = (source) => analyticsQueryRows.some((row) => row.source === source);

  const inputs = [
    {
      source_type: "gsc_emerging_query_export",
      status: hasAnalyticsSource("google_search_console") || hasQueryExportSourceType("gsc_emerging_query_export") ? "present" : "missing",
      artifact: "analytics/search_query_daily.csv; imports/query-exports/*gsc*.csv",
      notes: "Automated when GSC credentials are configured; normalized manual GSC imports can also flow here.",
    },
    {
      source_type: "manual_ai_prompt_export",
      status:
        readRows(path.join(root, "analytics", "ai_citation_log.csv")).length ||
        csvFiles(path.join(root, "imports", "ai-query-observations")).length
          ? "present"
          : "missing",
      artifact: "analytics/ai_citation_log.csv; imports/ai-query-observations/*.csv",
      notes: "Manual AI citation and approved sanitized AI-query observations only.",
    },
    {
      source_type: "manual_serp_observation",
      status: csvFiles(path.join(root, "imports", "serp-observations")).length ? "present" : "missing",
      artifact: "imports/serp-observations/*.csv",
      notes: "Manual SERP/PAA/AEO observations; discovery only.",
    },
    {
      source_type: "manual_topic_seed",
      status: csvFiles(path.join(root, "imports", "topic-seeds")).length ? "present" : "missing",
      artifact: "imports/topic-seeds/*.csv",
      notes: "Editorial topic seeds; cannot validate demand alone.",
    },
    {
      source_type: "reddit_manual_capture",
      status: csvFiles(path.join(root, "imports", "reddit-manual-captures")).length ? "present" : "missing",
      artifact: "imports/reddit-manual-captures/*.csv",
      notes: "Manual sanitized Reddit observations only; no API use, no usernames or raw comments, and no demand/factual validation.",
    },
    {
      source_type: "answer_the_public_export",
      status: hasQueryExportSourceType("answer_the_public_export") ? "present" : "missing",
      artifact: "imports/query-exports/*answer-the-public*.csv",
      notes: "AnswerThePublic query exports are discovery-only by default and cannot unlock ready handoff alone.",
    },
    {
      source_type: "bing_webmaster_query_export",
      status: hasAnalyticsSource("bing_webmaster_tools") || hasQueryExportSourceType("bing_webmaster_query_export") ? "present" : "missing",
      artifact: "analytics/search_query_daily.csv; imports/query-exports/*bing*.csv",
      notes: "Bing Webmaster API rows or reviewed query exports; validated demand for discovery and refresh prioritization only.",
    },
    {
      source_type: "other_query_tool_export",
      status: hasQueryExportSourceType("other_query_tool_export") ? "present" : "missing",
      artifact: "imports/query-exports/*.csv",
      notes: "Ahrefs, Semrush, AlsoAsked, or similar query-tool exports count as validated demand only when explicitly reviewed.",
    },
    {
      source_type: "public_source_trend_export",
      status: hasTrendSourceType("public_source_trend_export") ? "present" : "missing",
      artifact: "imports/trends/*public-trends*.csv; imports/trends/*rss*.csv",
      notes: "Automated public RSS/Atom/JSON feed headline captures, including Google Trends RSS; source leads only, not validated demand.",
    },
    {
      source_type: "google_trends_csv_export",
      status: hasTrendSourceType("google_trends_csv_export") || hasQueryExportSourceType("google_trends_csv_export") ? "present" : "missing",
      artifact: "imports/trends/*.csv; imports/query-exports/*google-trends*.csv",
      notes: "Google Trends CSV/UI exports only; RSS/feed captures stay public_source_trend_export.",
    },
  ];
  writeRollup(path.join(trendDir, "daily-discovery-rollup.md"), {
    run_id: runId,
    rows,
    clusters,
    source_types: Array.from(new Set(rows.map((row) => row.source_type))),
    handoff_status: status,
    inputs,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        run_id: runId,
        handoff_status: status,
        rows: rows.length,
        clusters: clusters.length,
        sources: sourceList.length,
        trend_dir: relative(root, trendDir),
        query_intelligence_dir: rows.length && hasHandoffCandidates ? relative(root, queryDir) : "",
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
