#!/usr/bin/env node
import path from "node:path";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import {
  PAGE_SIGNAL_FIELDS,
  canonicalPageUrl,
  hasNumericValue,
  isPresent,
  pageCanonicalIdentity,
  slugFromPageUrl,
} from "./lib/scoring.mjs";

const SCRIPT_ID = "scripts/seo-aeo/rollup-feedback-signals.mjs";
const DERIVED_PREFIX = "derived:page_daily_rollup";
const JOINER = ";";

const PAGE_DAILY_HEADERS = [
  "date",
  "page_url",
  "slug",
  "page_type",
  "publish_date",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "ga4_sessions",
  "ga4_engaged_sessions",
  "ga4_avg_engagement_time_seconds",
  "ga4_conversions",
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr",
  "gsc_avg_position",
  "bing_clicks",
  "bing_impressions",
  "bing_ctr",
  "bing_avg_position",
  "ai_citations",
  "distribution_clicks",
  "content_health_score",
  "refresh_priority_score",
  "decision_evidence_status",
  "decision_evidence_row_count",
  "decision_evidence_date_count",
  "decision_evidence_required_date_count",
  "decision_evidence_included",
  "decision_evidence_reason",
  "notes",
];

const DERIVED_METRIC_FIELDS = [
  "gsc_clicks",
  "gsc_impressions",
  "gsc_ctr",
  "gsc_avg_position",
  "bing_clicks",
  "bing_impressions",
  "bing_ctr",
  "bing_avg_position",
  "ai_citations",
  "distribution_clicks",
];

const SOURCE_PATHS = {
  search: "analytics/search_query_daily.csv",
  ai: "analytics/ai_citation_log.csv",
  distribution: "analytics/distribution_daily.csv",
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function text(value) {
  return String(value ?? "").trim();
}

function splitList(value) {
  return text(value)
    .split(JOINER)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniquePresent(values) {
  return Array.from(new Set(values.flatMap(splitList))).sort();
}

function joined(values, { limit = 0 } = {}) {
  const unique = uniquePresent(values);
  if (!limit || unique.length <= limit) return unique.join(JOINER);
  return `${unique.slice(0, limit).join(JOINER)}${JOINER}+${unique.length - limit} more`;
}

function appendList(...values) {
  return joined(values);
}

function numberOrNull(value) {
  if (!isPresent(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded)
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "");
}

function sumField(rows, field) {
  let found = false;
  let total = 0;
  for (const row of rows) {
    const value = numberOrNull(row[field]);
    if (value === null) continue;
    found = true;
    total += value;
  }
  return found ? total : null;
}

function weightedAverage(rows, valueField, weightField) {
  let weightedTotal = 0;
  let weightTotal = 0;
  const unweighted = [];

  for (const row of rows) {
    const value = numberOrNull(row[valueField]);
    if (value === null) continue;
    const weight = numberOrNull(row[weightField]);
    if (weight !== null && weight > 0) {
      weightedTotal += value * weight;
      weightTotal += weight;
    } else {
      unweighted.push(value);
    }
  }

  if (weightTotal > 0) return weightedTotal / weightTotal;
  if (!unweighted.length) return null;
  return unweighted.reduce((total, value) => total + value, 0) / unweighted.length;
}

function ratio(numerator, denominator) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function truthy(value) {
  return ["1", "true", "yes", "y", "cited", "sell_in_public"].includes(text(value).toLowerCase());
}

function isAbsoluteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function bestCanonicalPageUrl(values) {
  const canonical = uniquePresent(values.map((value) => canonicalPageUrl(value)));
  return canonical.find(isAbsoluteUrl) || canonical[0] || "";
}

function pageIdentity(pageUrl, slug) {
  const canonical = canonicalPageUrl(pageUrl);
  const canonicalIdentity = canonical ? pageCanonicalIdentity({ page_url: canonical }) : "";
  const derivedSlug = text(slug) || slugFromPageUrl(canonical);
  if (canonicalIdentity) {
    return {
      key: `url:${canonicalIdentity}`,
      urlIdentity: canonicalIdentity,
      pageUrl: canonical,
      slug: derivedSlug,
    };
  }
  if (derivedSlug) {
    return {
      key: `slug:${derivedSlug}`,
      urlIdentity: "",
      pageUrl: "",
      slug: derivedSlug,
    };
  }
  return null;
}

function rowReviewer(row) {
  return text(row.reviewed_by) || text(row.reviewer);
}

function sourceRef(row, fallbackSourcePath) {
  return {
    sourceExportId: text(row.source_export_id),
    sourceFile: text(row.source_file) || fallbackSourcePath,
    capturedBy: text(row.captured_by),
    propertyId: text(row.property_id),
    timezone: text(row.timezone),
    reviewer: rowReviewer(row),
  };
}

function makeContribution({ kind, sourcePath, row, rowIndex, date, pageUrl, slug, fields, extra = {} }) {
  const identity = pageIdentity(pageUrl, slug);
  if (!text(date) || !identity) return null;
  const refs = sourceRef(row, sourcePath);
  return {
    kind,
    sourcePath,
    sourceRow: rowIndex + 2,
    date: text(date),
    pageUrl: identity.pageUrl,
    urlIdentity: identity.urlIdentity,
    slug: identity.slug,
    fields,
    ...refs,
    ...extra,
  };
}

function searchEngine(row) {
  const source = `${row.source || ""} ${row.source_file || ""}`.toLowerCase();
  if (source.includes("bing")) return "bing";
  if (source.includes("google") || source.includes("gsc") || source.includes("search_console") || source.includes("search-console")) return "gsc";
  return "";
}

function hasAnyNumeric(row, fields) {
  return fields.some((field) => numberOrNull(row[field]) !== null);
}

function searchContributions(rows) {
  const contributions = [];
  const skipped = [];

  rows.forEach((row, rowIndex) => {
    const engine = searchEngine(row);
    if (!engine) {
      skipped.push({ source: SOURCE_PATHS.search, row: rowIndex + 2, reason: "unrecognized_search_source" });
      return;
    }
    if (!hasAnyNumeric(row, ["clicks", "impressions", "ctr", "avg_position"])) {
      skipped.push({ source: SOURCE_PATHS.search, row: rowIndex + 2, reason: "no_search_metric" });
      return;
    }
    const contribution = makeContribution({
      kind: "search",
      sourcePath: SOURCE_PATHS.search,
      row,
      rowIndex,
      date: row.date,
      pageUrl: row.page_url,
      slug: row.slug || slugFromPageUrl(row.page_url),
      fields: {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        avg_position: row.avg_position,
      },
      extra: { engine },
    });
    if (contribution) contributions.push(contribution);
    else skipped.push({ source: SOURCE_PATHS.search, row: rowIndex + 2, reason: "missing_page_identity" });
  });

  return { contributions, skipped };
}

function aiCitationContributions(rows) {
  const contributions = [];
  const skipped = [];

  rows.forEach((row, rowIndex) => {
    if (!text(row.capture_date)) {
      skipped.push({ source: SOURCE_PATHS.ai, row: rowIndex + 2, reason: "missing_capture_date" });
      return;
    }
    if (!isPresent(row.is_sell_in_public)) {
      skipped.push({ source: SOURCE_PATHS.ai, row: rowIndex + 2, reason: "missing_is_sell_in_public" });
      return;
    }

    const cited = truthy(row.is_sell_in_public);
    const pageUrl = cited ? text(row.cited_url) || text(row.target_page_url) : text(row.target_page_url);
    const contribution = makeContribution({
      kind: "ai",
      sourcePath: SOURCE_PATHS.ai,
      row,
      rowIndex,
      date: row.capture_date,
      pageUrl,
      slug: slugFromPageUrl(pageUrl),
      fields: {
        ai_citation: cited ? "1" : "0",
      },
      extra: { cited },
    });
    if (contribution) contributions.push(contribution);
    else skipped.push({ source: SOURCE_PATHS.ai, row: rowIndex + 2, reason: "missing_page_identity" });
  });

  return { contributions, skipped };
}

function distributionContributions(rows) {
  const contributions = [];
  const skipped = [];

  rows.forEach((row, rowIndex) => {
    if (numberOrNull(row.clicks) === null) {
      skipped.push({ source: SOURCE_PATHS.distribution, row: rowIndex + 2, reason: "no_click_metric" });
      return;
    }
    const pageUrl = text(row.content_url);
    const contribution = makeContribution({
      kind: "distribution",
      sourcePath: SOURCE_PATHS.distribution,
      row,
      rowIndex,
      date: row.date,
      pageUrl,
      slug: row.slug || slugFromPageUrl(pageUrl),
      fields: {
        distribution_clicks: row.clicks,
      },
      extra: { channel: text(row.channel) },
    });
    if (contribution) contributions.push(contribution);
    else skipped.push({ source: SOURCE_PATHS.distribution, row: rowIndex + 2, reason: "missing_page_identity" });
  });

  return { contributions, skipped };
}

function readContributions(root) {
  const search = searchContributions(readCsv(path.join(root, SOURCE_PATHS.search)).rows);
  const ai = aiCitationContributions(readCsv(path.join(root, SOURCE_PATHS.ai)).rows);
  const distribution = distributionContributions(readCsv(path.join(root, SOURCE_PATHS.distribution)).rows);
  return {
    contributions: [...search.contributions, ...ai.contributions, ...distribution.contributions],
    skipped: [...search.skipped, ...ai.skipped, ...distribution.skipped],
  };
}

function contributionGroupingKey(contribution, slugUrlKeyByDate) {
  if (contribution.urlIdentity) return `${contribution.date}\u0001url:${contribution.urlIdentity}`;
  const slug = text(contribution.slug);
  const slugKey = slug ? `${contribution.date}\u0001${slug}` : "";
  if (slugKey && slugUrlKeyByDate.has(slugKey)) return slugUrlKeyByDate.get(slugKey);
  return slug ? `${contribution.date}\u0001slug:${slug}` : "";
}

function groupContributions(contributions) {
  const slugUrlKeyByDate = new Map();
  for (const contribution of contributions) {
    if (!contribution.urlIdentity || !contribution.slug) continue;
    const slugKey = `${contribution.date}\u0001${contribution.slug}`;
    const groupKey = `${contribution.date}\u0001url:${contribution.urlIdentity}`;
    if (!slugUrlKeyByDate.has(slugKey) || groupKey.localeCompare(slugUrlKeyByDate.get(slugKey)) < 0) {
      slugUrlKeyByDate.set(slugKey, groupKey);
    }
  }

  const groups = new Map();
  for (const contribution of contributions) {
    const groupKey = contributionGroupingKey(contribution, slugUrlKeyByDate);
    if (!groupKey) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(contribution);
  }
  return groups;
}

function aggregateSearch(contributions, engine) {
  const rows = contributions.filter((contribution) => contribution.kind === "search" && contribution.engine === engine).map((contribution) => contribution.fields);
  if (!rows.length) return {};

  const clicks = sumField(rows, "clicks");
  const impressions = sumField(rows, "impressions");
  const ctrFromTotals = ratio(clicks, impressions);
  const ctr = ctrFromTotals ?? weightedAverage(rows, "ctr", "impressions");
  const avgPosition = weightedAverage(rows, "avg_position", "impressions");
  const prefix = engine === "bing" ? "bing" : "gsc";
  return Object.fromEntries(
    [
      [`${prefix}_clicks`, clicks],
      [`${prefix}_impressions`, impressions],
      [`${prefix}_ctr`, ctr],
      [`${prefix}_avg_position`, avgPosition],
    ]
      .filter(([, value]) => value !== null)
      .map(([field, value]) => [field, formatNumber(value)])
  );
}

function aggregateAi(contributions) {
  const rows = contributions.filter((contribution) => contribution.kind === "ai").map((contribution) => contribution.fields);
  if (!rows.length) return {};
  return { ai_citations: formatNumber(sumField(rows, "ai_citation") ?? 0) };
}

function aggregateDistribution(contributions) {
  const rows = contributions.filter((contribution) => contribution.kind === "distribution").map((contribution) => contribution.fields);
  if (!rows.length) return {};
  return { distribution_clicks: formatNumber(sumField(rows, "distribution_clicks") ?? 0) };
}

function safeIdSegment(value) {
  return text(value)
    .replace(/^url:/, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sourceCounts(contributions) {
  const counts = new Map();
  for (const contribution of contributions) {
    counts.set(contribution.sourcePath, (counts.get(contribution.sourcePath) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, count]) => `${source} rows=${count}`)
    .join("; ");
}

function aggregateGroup(groupKey, contributions) {
  const [date, identityKey] = groupKey.split("\u0001");
  const pageUrl = bestCanonicalPageUrl(contributions.map((contribution) => contribution.pageUrl));
  const slug = text(contributions.find((contribution) => contribution.slug)?.slug) || slugFromPageUrl(pageUrl);
  const metrics = {
    ...aggregateSearch(contributions, "gsc"),
    ...aggregateSearch(contributions, "bing"),
    ...aggregateAi(contributions),
    ...aggregateDistribution(contributions),
  };
  const metricFields = new Set(Object.keys(metrics));
  const sourceExportIds = uniquePresent(contributions.map((contribution) => contribution.sourceExportId));
  const sourceFiles = uniquePresent(contributions.flatMap((contribution) => [contribution.sourceFile, contribution.sourcePath]));
  const capturedBy = uniquePresent(contributions.map((contribution) => contribution.capturedBy));
  const reviewers = uniquePresent(contributions.map((contribution) => contribution.reviewer));
  const allSourceRowsReviewed = contributions.every((contribution) => isPresent(contribution.reviewer));
  const reviewStatus = allSourceRowsReviewed ? "all_source_rows_reviewed" : "contains_unreviewed_source_rows";
  const sourceIdTail = sourceExportIds.length ? joined(sourceExportIds, { limit: 8 }) : safeIdSegment(identityKey);
  const derivedSourceExportId = `${DERIVED_PREFIX}:${date}:${safeIdSegment(identityKey)}${sourceIdTail ? `:${sourceIdTail}` : ""}`;
  const notes = [
    `Derived page_daily row from real source rows only via ${SCRIPT_ID}.`,
    sourceCounts(contributions),
    sourceExportIds.length ? `source_export_ids=${joined(sourceExportIds, { limit: 12 })}` : "",
    sourceFiles.length ? `source_files=${joined(sourceFiles, { limit: 12 })}` : "",
    reviewers.length ? `source_reviewers=${reviewers.join(JOINER)}` : "source_reviewers=none",
    `review_status=${reviewStatus}`,
    allSourceRowsReviewed ? "" : "reviewed_by left blank so unreviewed API/source rows do not become decision-grade.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    row: {
      date,
      page_url: pageUrl,
      slug,
      page_type: "",
      publish_date: "",
      source_export_id: derivedSourceExportId,
      source_file: `derived from ${joined(sourceFiles, { limit: 12 })}`,
      property_id: joined(contributions.map((contribution) => contribution.propertyId)),
      timezone: joined(contributions.map((contribution) => contribution.timezone)),
      captured_by: appendList(SCRIPT_ID, ...capturedBy),
      reviewed_by: allSourceRowsReviewed ? reviewers.join(JOINER) : "",
      ...metrics,
      content_health_score: "",
      refresh_priority_score: "",
      notes,
    },
    meta: {
      metricFields,
      reviewers,
      allSourceRowsReviewed,
      reviewStatus,
      sourceCount: contributions.length,
    },
  };
}

function existingRowKey(row) {
  if (!text(row.date)) return "";
  const canonicalIdentity = pageCanonicalIdentity(row);
  if (canonicalIdentity) return `${row.date}\u0001url:${canonicalIdentity}`;
  const slug = text(row.slug) || slugFromPageUrl(row.page_url);
  return slug ? `${row.date}\u0001slug:${slug}` : "";
}

function slugRowKey(row) {
  const slug = text(row.slug) || slugFromPageUrl(row.page_url);
  return text(row.date) && slug ? `${row.date}\u0001${slug}` : "";
}

function buildExistingIndexes(rows) {
  const byIdentity = new Map();
  const bySlug = new Map();
  rows.forEach((row, index) => {
    const key = existingRowKey(row);
    if (key && !byIdentity.has(key)) byIdentity.set(key, index);
    const slugKey = slugRowKey(row);
    if (slugKey && !bySlug.has(slugKey)) bySlug.set(slugKey, index);
  });
  return { byIdentity, bySlug };
}

function findExistingIndex(rows, indexes, derivedRow) {
  const identityKey = existingRowKey(derivedRow);
  if (identityKey && indexes.byIdentity.has(identityKey)) return indexes.byIdentity.get(identityKey);
  const slugKey = slugRowKey(derivedRow);
  if (slugKey && indexes.bySlug.has(slugKey)) return indexes.bySlug.get(slugKey);
  return -1;
}

function retainedExistingSignalFields(existing, derivedMetricFields) {
  return PAGE_SIGNAL_FIELDS.filter((field) => !derivedMetricFields.has(field) && hasNumericValue(existing, field));
}

function resolvedReviewedBy(existing, derivedMeta) {
  const retainedSignals = retainedExistingSignalFields(existing, derivedMeta.metricFields);
  const existingReviewer = text(existing.reviewed_by);
  if (retainedSignals.length && !existingReviewer) return "";
  if (!derivedMeta.allSourceRowsReviewed) return "";
  return appendList(existingReviewer, ...derivedMeta.reviewers);
}

function mergeNotes(existingNotes, derivedNotes, extraNotes = []) {
  return Array.from(
    new Set([existingNotes, derivedNotes, ...extraNotes].map((value) => text(value)).filter(Boolean))
  ).join(" | ");
}

function mergeDerivedRow(existing, derived) {
  const row = { ...Object.fromEntries(PAGE_DAILY_HEADERS.map((header) => [header, ""])), ...existing };
  const derivedRow = derived.row;
  const derivedMeta = derived.meta;
  const pageUrl = bestCanonicalPageUrl([derivedRow.page_url, row.page_url]);
  const retainedSignals = retainedExistingSignalFields(row, derivedMeta.metricFields);
  const existingReviewer = text(row.reviewed_by);
  const reviewNotes = [];

  row.date = row.date || derivedRow.date;
  row.page_url = pageUrl || row.page_url || derivedRow.page_url;
  row.slug = row.slug || derivedRow.slug || slugFromPageUrl(row.page_url);
  row.property_id = appendList(row.property_id, derivedRow.property_id);
  row.timezone = appendList(row.timezone, derivedRow.timezone);
  row.source_export_id = appendList(row.source_export_id, derivedRow.source_export_id);
  row.source_file = appendList(row.source_file, derivedRow.source_file);
  row.captured_by = appendList(row.captured_by, derivedRow.captured_by);

  for (const field of DERIVED_METRIC_FIELDS) {
    if (isPresent(derivedRow[field])) row[field] = derivedRow[field];
  }

  row.reviewed_by = resolvedReviewedBy(row, derivedMeta);
  if (!row.reviewed_by && existingReviewer && !derivedMeta.allSourceRowsReviewed) {
    reviewNotes.push("reviewed_by cleared for this derived merge because newly rolled-up source rows include unreviewed signals.");
  }
  if (!row.reviewed_by && retainedSignals.length && !existingReviewer) {
    reviewNotes.push(`reviewed_by left blank because retained existing signals lack review attribution: ${retainedSignals.join(";")}.`);
  }
  row.notes = mergeNotes(row.notes, derivedRow.notes, reviewNotes);
  return row;
}

function outputRows(existingRows, derivedRows) {
  const rows = [...existingRows];
  for (const derived of derivedRows) {
    const indexes = buildExistingIndexes(rows);
    const existingIndex = findExistingIndex(rows, indexes, derived.row);
    if (existingIndex >= 0) {
      rows[existingIndex] = mergeDerivedRow(rows[existingIndex], derived);
    } else {
      rows.push(mergeDerivedRow({}, derived));
    }
  }
  return rows;
}

function run() {
  const root = process.cwd();
  const dryRun = hasFlag("--dry-run");
  const pageDailyPath = path.join(root, "analytics", "page_daily.csv");
  const current = readCsv(pageDailyPath, PAGE_DAILY_HEADERS);
  const { contributions, skipped } = readContributions(root);
  const groups = groupContributions(contributions);
  const derivedRows = Array.from(groups.entries())
    .map(([groupKey, groupContributions]) => aggregateGroup(groupKey, groupContributions))
    .filter(({ meta }) => meta.metricFields.size > 0)
    .sort((a, b) => existingRowKey(a.row).localeCompare(existingRowKey(b.row)));

  const headers = Array.from(new Set([...current.headers, ...PAGE_DAILY_HEADERS]));
  const rows = outputRows(current.rows, derivedRows).map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? ""])));

  if (!dryRun && derivedRows.length) writeCsvAtomic(pageDailyPath, headers, rows);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        output: "analytics/page_daily.csv",
        source_rows: contributions.length + skipped.length,
        rolled_up_source_rows: contributions.length,
        skipped_source_rows: skipped.length,
        derived_page_rows: derivedRows.length,
        page_daily_rows: rows.length,
        wrote_file: !dryRun && derivedRows.length > 0,
        skipped_examples: skipped.slice(0, 10),
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
