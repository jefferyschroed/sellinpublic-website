#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { ensureDir, loadConfig } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const OUTPUT_HEADERS = [
  "captured_at",
  "observed_at",
  "date",
  "source",
  "source_id",
  "source_name",
  "source_kind",
  "feed_url",
  "source_record_id",
  "query",
  "term",
  "topic",
  "title",
  "item_url",
  "page_url",
  "published_at",
  "author",
  "surface",
  "country",
  "language",
  "trend_delta",
  "trend_window",
  "confidence",
  "evidence_use",
  "allowed_public_use",
  "notes",
];

const ALLOWED_PUBLIC_USES = new Set(["none", "topic_direction"]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid --date value '${value}'. Use yyyy-mm-dd.`);
  }
  return value;
}

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function slugify(value, fallback = "public-source") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function normalizePublicUse(value) {
  return String(value || "topic_direction")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function publicUseFor(settings, source) {
  const value = normalizePublicUse(source.allowedPublicUse ?? source.allowed_public_use ?? settings.allowedPublicUse);
  if (!ALLOWED_PUBLIC_USES.has(value)) {
    throw new Error(
      `publicTrendSources source '${source.id || source.name || source.url || "unknown"}' has invalid allowed_public_use '${value}'. Use none or topic_direction.`
    );
  }
  return value;
}

function sourceIsEnabled(source) {
  return source.enabled === true && source.disabled !== true && source.allow !== false && source.allowed !== false;
}

function filterValues(object, camelName, snakeName) {
  const values = [];
  for (const value of [object?.[camelName], object?.[snakeName]]) {
    if (Array.isArray(value)) {
      values.push(...value);
    } else if (value !== undefined && value !== null) {
      values.push(value);
    }
  }
  return values.map((value) => cleanCell(value, 500)).filter(Boolean);
}

function compileFilterPatterns(patterns, label) {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      throw new Error(`${label} has invalid pattern '${pattern}': ${error.message}`);
    }
  });
}

function buildRowFilters(settings, source, sourceId) {
  const sourceLabel = sourceId || source.id || source.name || source.url || "unknown";
  const includeKeywords = [
    ...filterValues(settings, "includeKeywords", "include_keywords"),
    ...filterValues(source, "includeKeywords", "include_keywords"),
  ].map((value) => value.toLowerCase());
  const excludeKeywords = [
    ...filterValues(settings, "excludeKeywords", "exclude_keywords"),
    ...filterValues(source, "excludeKeywords", "exclude_keywords"),
  ].map((value) => value.toLowerCase());
  const includePatternValues = [
    ...filterValues(settings, "includePatterns", "include_patterns"),
    ...filterValues(source, "includePatterns", "include_patterns"),
  ];
  const excludePatternValues = [
    ...filterValues(settings, "excludePatterns", "exclude_patterns"),
    ...filterValues(source, "excludePatterns", "exclude_patterns"),
  ];
  return {
    includeKeywords,
    includePatterns: compileFilterPatterns(
      includePatternValues,
      `publicTrendSources source '${sourceLabel}' includePatterns`
    ),
    excludeKeywords,
    excludePatterns: compileFilterPatterns(
      excludePatternValues,
      `publicTrendSources source '${sourceLabel}' excludePatterns`
    ),
  };
}

function hasIncludeFilters(filters) {
  return filters.includeKeywords.length > 0 || filters.includePatterns.length > 0;
}

function filterFieldsForRow(row) {
  return [
    row.title,
    row.topic,
    [row.item_url, row.page_url, row.feed_url].filter(Boolean).join(" "),
    [row.source, row.source_id, row.source_name, row.source_kind].filter(Boolean).join(" "),
  ].map((value) => String(value || "").toLowerCase());
}

function fieldsMatchFilters(fields, keywords, patterns) {
  return (
    keywords.some((keyword) => fields.some((field) => field.includes(keyword))) ||
    patterns.some((pattern) => fields.some((field) => pattern.test(field)))
  );
}

function filterRows(rows, filters) {
  const includeRequired = hasIncludeFilters(filters);
  const kept = [];
  const counts = {
    total: 0,
    excluded: 0,
    missing_required_include: 0,
  };

  for (const row of rows) {
    const fields = filterFieldsForRow(row);
    if (fieldsMatchFilters(fields, filters.excludeKeywords, filters.excludePatterns)) {
      counts.excluded += 1;
      continue;
    }
    if (includeRequired && !fieldsMatchFilters(fields, filters.includeKeywords, filters.includePatterns)) {
      counts.missing_required_include += 1;
      continue;
    }
    kept.push(row);
  }

  counts.total = counts.excluded + counts.missing_required_include;
  return { rows: kept, counts };
}

function emptyFilterCounts() {
  return {
    total: 0,
    excluded: 0,
    missing_required_include: 0,
  };
}

function addFilterCounts(total, counts) {
  total.total += counts.total;
  total.excluded += counts.excluded;
  total.missing_required_include += counts.missing_required_include;
  return total;
}

function rootRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function resolveOutputPath(root, settings, runDate) {
  const outputDir = path.resolve(root, settings.outputDir || "imports/trends");
  const relativeOutputDir = path.relative(root, outputDir);
  if (relativeOutputDir.startsWith("..") || path.isAbsolute(relativeOutputDir)) {
    throw new Error("publicTrendSources.outputDir must stay inside the repository.");
  }
  const fileName = settings.outputFile
    ? String(settings.outputFile).replaceAll("{date}", runDate)
    : `${runDate}-public-trends.csv`;
  return path.join(outputDir, path.basename(fileName));
}

function hashId(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanCell(value, maxLength = 500) {
  return normalizeWhitespace(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function decodeXmlEntities(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    const named = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
    };
    if (Object.hasOwn(named, lower)) return named[lower];
    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  });
}

function textFromMarkup(value) {
  return cleanCell(
    decodeXmlEntities(
      String(value || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagPattern(name) {
  const escaped = escapeRegex(name);
  return name.includes(":") ? escaped : `(?:[A-Za-z0-9_.-]+:)?${escaped}`;
}

function xmlBlocks(xml, tagName) {
  const pattern = tagPattern(tagName);
  const regex = new RegExp(`<${pattern}\\b[^>]*>([\\s\\S]*?)<\\/${pattern}>`, "gi");
  return Array.from(String(xml || "").matchAll(regex), (match) => match[1]);
}

function firstXmlText(block, tagNames) {
  for (const tagName of tagNames) {
    const pattern = tagPattern(tagName);
    const regex = new RegExp(`<${pattern}\\b[^>]*>([\\s\\S]*?)<\\/${pattern}>`, "i");
    const match = String(block || "").match(regex);
    if (match) {
      const text = textFromMarkup(match[1]);
      if (text) return text;
    }
  }
  return "";
}

function xmlAttrs(value) {
  const attrs = {};
  const regex = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of String(value || "").matchAll(regex)) {
    attrs[match[1].toLowerCase()] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

function firstXmlLink(block, feedUrl) {
  const pattern = tagPattern("link");
  const regex = new RegExp(`<${pattern}\\b([^>]*)\\/?>`, "gi");
  for (const match of String(block || "").matchAll(regex)) {
    const attrs = xmlAttrs(match[1]);
    if (attrs.href && (!attrs.rel || attrs.rel === "alternate")) return absoluteUrl(attrs.href, feedUrl);
  }
  const textLink = firstXmlText(block, ["link"]);
  return textLink ? absoluteUrl(textLink, feedUrl) : "";
}

function absoluteUrl(value, baseUrl) {
  const text = cleanCell(value, 1200);
  if (!text) return "";
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return text;
  }
}

function hostnameFor(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRedditUrl(value) {
  const host = hostnameFor(value);
  return host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it" || host.endsWith(".redd.it");
}

function normalizeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemFromXmlBlock(block, feedUrl) {
  const title = firstXmlText(block, ["title"]);
  const itemUrl = firstXmlLink(block, feedUrl);
  const publishedAt = firstXmlText(block, ["pubDate", "published", "updated", "dc:date", "date"]);
  const sourceRecordId = firstXmlText(block, ["guid", "id"]) || itemUrl || title;
  const author = firstXmlText(block, ["author", "dc:creator", "creator", "name"]);
  return {
    title,
    itemUrl,
    publishedAt,
    sourceRecordId,
    author,
  };
}

function parseXmlFeed(text, feedUrl) {
  const xml = String(text || "").replace(/<!--[\s\S]*?-->/g, " ");
  return [...xmlBlocks(xml, "item"), ...xmlBlocks(xml, "entry")].map((block) => itemFromXmlBlock(block, feedUrl));
}

function firstValue(object, names) {
  for (const name of names) {
    const value = object?.[name];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

function jsonItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.feed?.items)) return data.feed.items;
  return [];
}

function authorFromJson(item) {
  const author = item.author || item.authors?.[0] || item.creator;
  if (typeof author === "string") return author;
  if (author && typeof author === "object") return firstValue(author, ["name", "url"]);
  return "";
}

function parseJsonFeed(text, feedUrl) {
  const data = JSON.parse(text);
  return jsonItems(data).map((item) => {
    const title = firstValue(item, ["title", "headline", "name"]);
    const itemUrl = firstValue(item, ["url", "external_url", "html_url", "link", "permalink"]);
    const publishedAt = firstValue(item, ["date_published", "date_modified", "published_at", "published", "updated_at", "date"]);
    const sourceRecordId = firstValue(item, ["id", "guid", "uuid", "slug"]) || itemUrl || title;
    return {
      title: textFromMarkup(title),
      itemUrl: absoluteUrl(itemUrl, feedUrl),
      publishedAt: cleanCell(publishedAt, 120),
      sourceRecordId: cleanCell(sourceRecordId, 300),
      author: cleanCell(authorFromJson(item), 200),
    };
  });
}

function parseFeed({ text, contentType, format, feedUrl }) {
  const configuredFormat = String(format || "auto").toLowerCase();
  const trimmed = String(text || "").trim();
  const looksJson = configuredFormat === "json" || contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (looksJson) return parseJsonFeed(trimmed, feedUrl);
  return parseXmlFeed(trimmed, feedUrl);
}

async function fetchText(url, { timeoutMs, userAgent }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml;q=0.9, */*;q=0.5",
        "user-agent": userAgent,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    return {
      text,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function rowForItem({ item, source, sourceId, sourceKind, allowedPublicUse, runDate, capturedAt }) {
  const title = cleanCell(item.title, 300);
  if (!title) return null;
  const itemUrl = cleanCell(item.itemUrl, 1200);
  if (isRedditUrl(itemUrl)) return null;
  const topic = cleanCell(source.topic || source.defaultTopic || "", 160);
  const sourceRecordId = cleanCell(item.sourceRecordId || itemUrl || title, 500);
  return {
    captured_at: capturedAt,
    observed_at: runDate,
    date: cleanCell(item.publishedAt, 80) || runDate,
    source: sourceId,
    source_id: sourceId,
    source_name: cleanCell(source.name || sourceId, 160),
    source_kind: sourceKind,
    feed_url: cleanCell(source.url, 1200),
    source_record_id: `${sourceId}:${hashId(sourceRecordId)}`,
    query: title,
    term: title,
    topic: topic || title,
    title,
    item_url: itemUrl,
    page_url: itemUrl,
    published_at: cleanCell(item.publishedAt, 80),
    author: cleanCell(item.author, 160),
    surface: cleanCell(source.surface || sourceKind, 120),
    country: cleanCell(source.country || "US", 20),
    language: cleanCell(source.language || "en", 20),
    trend_delta: "",
    trend_window: cleanCell(source.trendWindow || "latest_public_feed", 80),
    confidence: cleanCell(source.confidence || "low", 20),
    evidence_use: "discovery_only",
    allowed_public_use: allowedPublicUse,
    notes: cleanCell(
      source.notes || "Public source headline captured for discovery only. Do not cite or treat as factual evidence.",
      500
    ),
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = row.item_url || `${row.source_id}:${normalizeQuery(row.title)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function collectSource({ source, sourceIndex, settings, runDate, capturedAt }) {
  const sourceId = slugify(source.id || source.name || `public-source-${sourceIndex + 1}`);
  const sourceKind = cleanCell(source.kind || "public_feed", 80);
  const allowedPublicUse = publicUseFor(settings, source);
  const filters = buildRowFilters(settings, source, sourceId);
  const perSourceLimit = Math.min(
    numeric(source.dailyLimit ?? source.limit, Number.POSITIVE_INFINITY),
    numeric(settings.perSourceLimit, 10)
  );

  if (!source.url) return { sourceId, rows: [], error: "Missing source.url." };
  if (isRedditUrl(source.url)) return { sourceId, rows: [], error: "Reddit URLs are not allowed for public trend discovery." };

  const { text, contentType } = await fetchText(source.url, {
    timeoutMs: numeric(source.timeoutMs ?? settings.timeoutMs, 10000),
    userAgent:
      source.userAgent ||
      settings.userAgent ||
      "SellInPublicTrendDiscovery/1.0 (discovery-only public feed fetcher)",
  });
  const items = parseFeed({ text, contentType, format: source.format, feedUrl: source.url });
  const rowsBeforeFilter = items
    .map((item) => rowForItem({ item, source, sourceId, sourceKind, allowedPublicUse, runDate, capturedAt }))
    .filter(Boolean);
  const filterResult = filterRows(rowsBeforeFilter, filters);
  const rows = filterResult.rows.slice(0, perSourceLimit);
  return {
    sourceId,
    rows,
    error: "",
    itemCount: items.length,
    rowsBeforeFilter: rowsBeforeFilter.length,
    rowsAfterFilter: filterResult.rows.length,
    filteredCounts: filterResult.counts,
  };
}

async function run() {
  if (typeof fetch !== "function") {
    throw new Error("This script requires a Node runtime with global fetch support.");
  }

  const root = process.cwd();
  const config = loadConfig(root);
  const settings = config.publicTrendSources || {};
  const runDate = validateDate(arg("--date", today()));
  const dryRun = hasFlag("--dry-run");
  const capturedAt = new Date().toISOString();
  const outputPath = resolveOutputPath(root, settings, runDate);
  const enabled = settings.enabled === true || process.env.SEO_AEO_PUBLIC_TRENDS_ENABLED === "true";

  if (!enabled) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          run_date: runDate,
          output_path: rootRelative(root, outputPath),
          rows_before_filter: 0,
          rows_after_filter: 0,
          filtered: 0,
          filtered_counts: emptyFilterCounts(),
          reason: "publicTrendSources.enabled is false. Enable explicit public sources before fetching.",
        },
        null,
        2
      )
    );
    return;
  }

  const sources = Array.isArray(settings.sources) ? settings.sources : [];
  const enabledSources = sources.filter(sourceIsEnabled);
  const skippedSources = sources
    .filter((source) => !sourceIsEnabled(source))
    .map((source) => ({
      source_id: slugify(source.id || source.name || source.url || "public-source"),
      reason: source.disabled === true ? "disabled" : "not_enabled_or_not_allowed",
    }));

  if (!enabledSources.length) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          run_date: runDate,
          output_path: rootRelative(root, outputPath),
          rows_before_filter: 0,
          rows_after_filter: 0,
          filtered: 0,
          filtered_counts: emptyFilterCounts(),
          reason: "No publicTrendSources.sources entries are enabled and allowed.",
          skipped_sources: skippedSources,
        },
        null,
        2
      )
    );
    return;
  }

  const results = [];
  for (const [sourceIndex, source] of enabledSources.entries()) {
    try {
      results.push(await collectSource({ source, sourceIndex, settings, runDate, capturedAt }));
    } catch (error) {
      results.push({
        sourceId: slugify(source.id || source.name || `public-source-${sourceIndex + 1}`),
        rows: [],
        error: error.message,
        rowsBeforeFilter: 0,
        rowsAfterFilter: 0,
        filteredCounts: emptyFilterCounts(),
      });
    }
  }

  const totalLimit = numeric(settings.dailyItemLimit, numeric(settings.dailyTopicLimit, 25));
  const rows = dedupeRows(results.flatMap((result) => result.rows)).slice(0, totalLimit);
  const rowsBeforeFilter = results.reduce((sum, result) => sum + numeric(result.rowsBeforeFilter, 0), 0);
  const rowsAfterFilter = results.reduce((sum, result) => sum + numeric(result.rowsAfterFilter, 0), 0);
  const filteredCounts = results.reduce(
    (counts, result) => addFilterCounts(counts, result.filteredCounts || emptyFilterCounts()),
    emptyFilterCounts()
  );
  const errors = results.filter((result) => result.error).map(({ sourceId, error }) => ({ source_id: sourceId, error }));
  if (errors.length === enabledSources.length && !rows.length) {
    throw new Error(`All public trend sources failed: ${JSON.stringify(errors)}`);
  }
  if (!dryRun) {
    ensureDir(path.dirname(outputPath));
    writeCsvAtomic(outputPath, OUTPUT_HEADERS, rows);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        run_date: runDate,
        output_path: rootRelative(root, outputPath),
        rows: rows.length,
        rows_before_filter: rowsBeforeFilter,
        rows_after_filter: rowsAfterFilter,
        filtered: filteredCounts.total,
        filtered_counts: filteredCounts,
        enabled_sources: enabledSources.length,
        skipped_sources: skippedSources,
        errors,
        note: dryRun
          ? "Dry run only; no CSV was written."
          : "Rows are discovery_only and import-compatible with scripts/seo-aeo/build-discovery-run.mjs via imports/trends.",
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
