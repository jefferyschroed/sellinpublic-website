#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { ensureDir, loadConfig } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const DEFAULT_ENDPOINT = "https://trends.google.com/trending/rss?geo=US";

const OUTPUT_HEADERS = [
  "captured_at",
  "date",
  "observed_at",
  "source",
  "source_id",
  "source_record_id",
  "query",
  "term",
  "topic",
  "volume",
  "approx_traffic",
  "trend_delta",
  "trend_window",
  "link",
  "page_url",
  "published_at",
  "surface",
  "country",
  "language",
  "news_item_urls",
  "news_item_sources",
  "news_item_titles",
  "confidence",
  "evidence_use",
  "allowed_public_use",
  "notes",
];

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

function rootRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function slugify(value, fallback = "google-trends-rss") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
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

function hashId(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function normalizeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
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

function absoluteUrl(value, baseUrl) {
  const text = cleanCell(value, 1200);
  if (!text) return "";
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return text;
  }
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

function pubDateToDate(value) {
  const text = cleanCell(value, 120);
  const match = text.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/);
  if (!match) return "";
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const month = months[match[2].toLowerCase()];
  if (!month) return "";
  return `${match[3]}-${month}-${String(Number(match[1])).padStart(2, "0")}`;
}

function approxTrafficToVolume(value) {
  const raw = cleanCell(value, 80);
  const match = raw.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([kmb])?\+?$/i);
  if (!match) return "";
  const multiplier = {
    "": 1,
    k: 1000,
    m: 1000000,
    b: 1000000000,
  }[String(match[2] || "").toLowerCase()];
  return String(Math.round(Number(match[1]) * multiplier));
}

function newsItemsFromBlock(block, feedUrl) {
  const blocks = xmlBlocks(block, "ht:news_item").length ? xmlBlocks(block, "ht:news_item") : xmlBlocks(block, "news_item");
  return blocks
    .map((newsBlock) => ({
      title: firstXmlText(newsBlock, ["ht:news_item_title", "news_item_title"]),
      url: absoluteUrl(firstXmlText(newsBlock, ["ht:news_item_url", "news_item_url"]), feedUrl),
      source: firstXmlText(newsBlock, ["ht:news_item_source", "news_item_source"]),
    }))
    .filter((item) => item.title || item.url || item.source);
}

function itemFromXmlBlock(block, feedUrl) {
  const title = firstXmlText(block, ["title"]);
  const approxTraffic = firstXmlText(block, ["ht:approx_traffic", "approx_traffic"]);
  const pubDate = firstXmlText(block, ["pubDate"]);
  const link = firstXmlLink(block, feedUrl);
  return {
    title,
    approxTraffic,
    pubDate,
    link,
    newsItems: newsItemsFromBlock(block, feedUrl),
  };
}

function parseRss(text, feedUrl) {
  const xml = String(text || "").replace(/<!--[\s\S]*?-->/g, " ");
  return xmlBlocks(xml, "item").map((block) => itemFromXmlBlock(block, feedUrl));
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
  const sourceLabel = sourceId || source.id || source.name || source.endpoint || source.url || "unknown";
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
      `googleTrendsRss source '${sourceLabel}' includePatterns`
    ),
    excludeKeywords,
    excludePatterns: compileFilterPatterns(
      excludePatternValues,
      `googleTrendsRss source '${sourceLabel}' excludePatterns`
    ),
  };
}

function hasIncludeFilters(filters) {
  return filters.includeKeywords.length > 0 || filters.includePatterns.length > 0;
}

function fieldsForFilter(row) {
  return [
    row.query,
    row.topic,
    row.link,
    row.news_item_titles,
    row.news_item_sources,
    row.news_item_urls,
    [row.source, row.source_id, row.surface, row.country, row.language].filter(Boolean).join(" "),
  ].map((value) => String(value || "").toLowerCase());
}

function fieldsMatchFilters(fields, keywords, patterns) {
  return (
    keywords.some((keyword) => fields.some((field) => field.includes(keyword))) ||
    patterns.some((pattern) => fields.some((field) => pattern.test(field)))
  );
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

function filterRows(rows, filters) {
  const includeRequired = hasIncludeFilters(filters);
  const kept = [];
  const counts = emptyFilterCounts();

  for (const row of rows) {
    const fields = fieldsForFilter(row);
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

function joined(values, maxLength = 1800) {
  return cleanCell(Array.from(new Set(values.map((value) => cleanCell(value, 600)).filter(Boolean))).join(" | "), maxLength);
}

function countryFromEndpoint(endpoint) {
  try {
    return cleanCell(new URL(endpoint).searchParams.get("geo") || "", 20);
  } catch {
    return "";
  }
}

function languageFromEndpoint(endpoint) {
  try {
    const language = new URL(endpoint).searchParams.get("hl") || "";
    return cleanCell(language.split("-")[0], 20);
  } catch {
    return "";
  }
}

function assertOfficialEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`googleTrendsRss endpoint '${endpoint}' is not a valid URL.`);
  }
  const pathname = url.pathname.replace(/\/$/, "");
  if (url.protocol !== "https:" || url.hostname !== "trends.google.com" || pathname !== "/trending/rss") {
    throw new Error(
      `googleTrendsRss endpoint '${endpoint}' must be the official https://trends.google.com/trending/rss endpoint.`
    );
  }
}

function sourceIsEnabled(source) {
  return source.enabled === true && source.disabled !== true && source.allow !== false && source.allowed !== false;
}

function configuredSources(settings) {
  const configured = Array.isArray(settings.sources) ? settings.sources : [];
  const skippedSources = configured
    .filter((source) => !sourceIsEnabled(source))
    .map((source, index) => ({
      source_id: slugify(source.id || source.name || source.endpoint || source.url || `google-trends-rss-${index + 1}`),
      reason: source.disabled === true ? "disabled" : "not_enabled_or_not_allowed",
    }));
  const enabledSources = configured.filter(sourceIsEnabled);
  if (enabledSources.length) return { sources: enabledSources, skippedSources };
  return {
    sources: [
      {
        id: settings.id || "google-trends-rss-us",
        name: settings.name || "Google Trends RSS",
        endpoint: settings.endpoint || settings.url || DEFAULT_ENDPOINT,
        country: settings.country,
        language: settings.language,
        surface: settings.surface,
        topic: settings.topic,
        trendWindow: settings.trendWindow,
        confidence: settings.confidence,
        allowedPublicUse: settings.allowedPublicUse,
        notes: settings.notes,
      },
    ],
    skippedSources,
  };
}

function resolveOutputPath(root, settings, runDate) {
  const outputDir = path.resolve(root, settings.outputDir || "imports/trends");
  const relativeOutputDir = path.relative(root, outputDir);
  if (relativeOutputDir.startsWith("..") || path.isAbsolute(relativeOutputDir)) {
    throw new Error("googleTrendsRss.outputDir must stay inside the repository.");
  }
  const fileName = settings.outputFile
    ? String(settings.outputFile).replaceAll("{date}", runDate)
    : `${runDate}-google-trends-rss.csv`;
  return path.join(outputDir, path.basename(fileName));
}

async function fetchRss(endpoint, { timeoutMs, userAgent }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/rss+xml, text/xml;q=0.9, */*;q=0.5",
        "user-agent": userAgent,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function rowForItem({ item, source, settings, sourceId, endpoint, runDate, capturedAt }) {
  const query = cleanCell(item.title, 240);
  if (!query) return null;
  const observedDate = pubDateToDate(item.pubDate) || runDate;
  const country = cleanCell(source.country || settings.country || countryFromEndpoint(endpoint) || "US", 20);
  const language = cleanCell(source.language || settings.language || languageFromEndpoint(endpoint) || "en", 20);
  const link = cleanCell(item.link || endpoint, 1200);
  const approxTraffic = cleanCell(item.approxTraffic, 80);
  const newsItemUrls = joined(item.newsItems.map((newsItem) => newsItem.url));
  const newsItemSources = joined(item.newsItems.map((newsItem) => newsItem.source), 1000);
  const newsItemTitles = joined(item.newsItems.map((newsItem) => newsItem.title), 2200);
  return {
    captured_at: capturedAt,
    date: observedDate,
    observed_at: observedDate,
    source: "google_trends_rss",
    source_id: sourceId,
    source_record_id: `${sourceId}:${hashId([query, item.pubDate, approxTraffic].join("|"))}`,
    query,
    term: query,
    topic: cleanCell(source.topic || settings.topic || query, 240),
    volume: approxTrafficToVolume(approxTraffic),
    approx_traffic: approxTraffic,
    trend_delta: "",
    trend_window: cleanCell(source.trendWindow || settings.trendWindow || "google_trends_rss_daily", 80),
    link,
    page_url: link,
    published_at: cleanCell(item.pubDate, 120),
    surface: cleanCell(source.surface || settings.surface || "google_trends_rss", 120),
    country,
    language,
    news_item_urls: newsItemUrls,
    news_item_sources: newsItemSources,
    news_item_titles: newsItemTitles,
    confidence: cleanCell(source.confidence || settings.confidence || "medium", 20),
    evidence_use: "discovery_only",
    allowed_public_use: cleanCell(source.allowedPublicUse || settings.allowedPublicUse || "topic_direction", 40),
    notes: cleanCell(
      source.notes ||
        settings.notes ||
        `Official Google Trends RSS discovery signal only. approx_traffic=${approxTraffic || "unknown"}; linked news items are context/source leads and must not be cited without verification.`,
      700
    ),
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = [normalizeQuery(row.query), row.date, row.country, row.language].join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function collectSource({ source, sourceIndex, settings, runDate, capturedAt }) {
  const endpoint = source.endpoint || source.url || settings.endpoint || settings.url || DEFAULT_ENDPOINT;
  assertOfficialEndpoint(endpoint);
  const sourceId = slugify(source.id || source.name || `google-trends-rss-${sourceIndex + 1}`);
  const filters = buildRowFilters(settings, source, sourceId);
  const perSourceLimit = Math.min(
    numeric(source.dailyLimit ?? source.limit, Number.POSITIVE_INFINITY),
    numeric(settings.perSourceLimit, 25)
  );
  const text = await fetchRss(endpoint, {
    timeoutMs: numeric(source.timeoutMs ?? settings.timeoutMs, 10000),
    userAgent:
      source.userAgent ||
      settings.userAgent ||
      "SellInPublicGoogleTrendsRSS/1.0 (discovery-only RSS fetcher)",
  });
  const items = parseRss(text, endpoint);
  const rowsBeforeFilter = items
    .map((item) => rowForItem({ item, source, settings, sourceId, endpoint, runDate, capturedAt }))
    .filter(Boolean);
  const filterResult = filterRows(rowsBeforeFilter, filters);
  return {
    sourceId,
    rows: filterResult.rows.slice(0, perSourceLimit),
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
  const settings = config.googleTrendsRss || {};
  const runDate = validateDate(arg("--date", today()));
  const dryRun = hasFlag("--dry-run");
  const capturedAt = new Date().toISOString();
  const outputPath = resolveOutputPath(root, settings, runDate);
  const enabled = settings.enabled === true || process.env.SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED === "true";

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
          reason: "googleTrendsRss.enabled is false. Enable it explicitly before fetching official Google Trends RSS discovery signals.",
        },
        null,
        2
      )
    );
    return;
  }

  const { sources, skippedSources } = configuredSources(settings);
  if (!sources.length) {
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
          reason: "No googleTrendsRss endpoint or enabled sources are configured.",
          skipped_sources: skippedSources,
        },
        null,
        2
      )
    );
    return;
  }

  const results = [];
  for (const [sourceIndex, source] of sources.entries()) {
    try {
      results.push(await collectSource({ source, sourceIndex, settings, runDate, capturedAt }));
    } catch (error) {
      results.push({
        sourceId: slugify(source.id || source.name || `google-trends-rss-${sourceIndex + 1}`),
        rows: [],
        error: error.message,
        itemCount: 0,
        rowsBeforeFilter: 0,
        rowsAfterFilter: 0,
        filteredCounts: emptyFilterCounts(),
      });
    }
  }

  const filteredCounts = results.reduce(
    (counts, result) => addFilterCounts(counts, result.filteredCounts || emptyFilterCounts()),
    emptyFilterCounts()
  );
  const rowsBeforeFilter = results.reduce((sum, result) => sum + numeric(result.rowsBeforeFilter, 0), 0);
  const rowsAfterFilter = results.reduce((sum, result) => sum + numeric(result.rowsAfterFilter, 0), 0);
  const itemCount = results.reduce((sum, result) => sum + numeric(result.itemCount, 0), 0);
  const totalLimit = numeric(settings.dailyItemLimit, numeric(settings.dailyTopicLimit, 25));
  const rows = dedupeRows(results.flatMap((result) => result.rows)).slice(0, totalLimit);
  const errors = results.filter((result) => result.error).map(({ sourceId, error }) => ({ source_id: sourceId, error }));

  if (errors.length === sources.length && !rows.length) {
    throw new Error(`All Google Trends RSS sources failed: ${JSON.stringify(errors)}`);
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
        items: itemCount,
        rows: rows.length,
        rows_before_filter: rowsBeforeFilter,
        rows_after_filter: rowsAfterFilter,
        filtered: filteredCounts.total,
        filtered_counts: filteredCounts,
        enabled_sources: sources.length,
        skipped_sources: skippedSources,
        errors,
        note: dryRun
          ? "Dry run only; no CSV was written."
          : "Rows are official Google Trends RSS discovery signals and can be imported by scripts/seo-aeo/build-discovery-run.mjs as public_source_trend_export, not validated demand.",
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
