export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const MIN_DECISION_EVIDENCE_ROWS = 2;
export const MIN_DECISION_EVIDENCE_DATES = 2;

export const PAGE_SIGNAL_FIELDS = [
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
];

const DEFAULT_SITE_ORIGIN = "https://sellinpublic.co";
const CLICK_ID_PARAMS = new Set(["fbclid", "gclid", "gbraid", "wbraid", "msclkid"]);

export function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function hasNumericValue(row, field) {
  if (!isPresent(row[field])) return false;
  return Number.isFinite(Number(row[field]));
}

function isTrackingParam(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized.startsWith("utm_") || CLICK_ID_PARAMS.has(normalized);
}

function normalizePathname(pathname, { trimTrailingSlash = false } = {}) {
  const clean = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (clean === "/") return clean;
  return trimTrailingSlash ? clean.replace(/\/+$/, "") || "/" : clean;
}

function removeTrackingParams(url) {
  for (const name of Array.from(url.searchParams.keys())) {
    if (isTrackingParam(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
}

export function canonicalPageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const pathOnly = text.startsWith("/");
    const url = new URL(text, pathOnly ? DEFAULT_SITE_ORIGIN : undefined);
    url.hash = "";
    removeTrackingParams(url);
    url.pathname = normalizePathname(url.pathname);
    return pathOnly ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return "";
  }
}

export function slugFromPageUrl(value) {
  const canonical = canonicalPageUrl(value);
  if (!canonical) return "";

  try {
    const url = new URL(canonical, DEFAULT_SITE_ORIGIN);
    const clean = normalizePathname(url.pathname, { trimTrailingSlash: true });
    const blogMatch = clean.match(/^\/blog\/([^/]+)$/);
    if (blogMatch) return blogMatch[1];
    if (clean === "/") return "home";
    return clean.split("/").filter(Boolean).pop() || "home";
  } catch {
    return "";
  }
}

export function pageCanonicalIdentity(row) {
  const canonical = canonicalPageUrl(row.page_url);
  if (!canonical) return "";

  try {
    const url = new URL(canonical, DEFAULT_SITE_ORIGIN);
    const origin = url.origin === DEFAULT_SITE_ORIGIN ? "" : url.origin;
    return `${origin}${normalizePathname(url.pathname, { trimTrailingSlash: true })}${url.search}`;
  } catch {
    return canonical;
  }
}

export function pageEvidenceKey(row) {
  return String(row.slug || "").trim() || pageCanonicalIdentity(row) || "";
}

export function pageSignalFields(row) {
  return PAGE_SIGNAL_FIELDS.filter((field) => hasNumericValue(row, field));
}

export function pageDecisionUrl(row) {
  return canonicalPageUrl(row.page_url) || row.page_url || "";
}

export function hasPageIdentity(row) {
  return isPresent(row.date) && isPresent(pageEvidenceKey(row));
}

export function hasPageProvenance(row) {
  return isPresent(row.source_export_id) || isPresent(row.source_file);
}

export function hasPageReview(row) {
  return isPresent(row.reviewed_by);
}

export function hasPageSignals(row) {
  return pageSignalFields(row).length > 0;
}

export function isSignalBearingPageRow(row) {
  return hasPageIdentity(row) && hasPageProvenance(row) && hasPageSignals(row);
}

export function isReviewReadyPageRow(row) {
  return isSignalBearingPageRow(row) && hasPageReview(row);
}

export function shouldScorePageRow(row) {
  return isSignalBearingPageRow(row);
}

function uniquePresent(values) {
  return Array.from(new Set(values.filter(isPresent).map((value) => String(value).trim()))).sort();
}

export function sourceRefsForRows(rows) {
  return uniquePresent(rows.flatMap((row) => [row.source_export_id, row.source_file]));
}

export function reviewersForRows(rows) {
  return uniquePresent(rows.map((row) => row.reviewed_by));
}

export function groupRowsByPageEvidence(rows) {
  const rowsByPage = new Map();
  for (const row of rows) {
    const key = pageEvidenceKey(row);
    if (!key) continue;
    if (!rowsByPage.has(key)) rowsByPage.set(key, []);
    rowsByPage.get(key).push(row);
  }
  return rowsByPage;
}

export function pageDecisionEvidence(
  rows,
  { minRows = MIN_DECISION_EVIDENCE_ROWS, minDates = MIN_DECISION_EVIDENCE_DATES } = {}
) {
  const eligibleRows = rows.filter(isReviewReadyPageRow);
  const dates = uniquePresent(eligibleRows.map((row) => row.date));
  const sourceRefs = sourceRefsForRows(eligibleRows);
  const reviewers = reviewersForRows(eligibleRows);
  const missing = [];

  if (eligibleRows.length < minRows) {
    missing.push(`needs at least ${minRows} reviewed, provenance-bearing signal rows`);
  }
  if (dates.length < minDates) {
    missing.push(`needs at least ${minDates} distinct evidence dates`);
  }
  if (!sourceRefs.length) missing.push("needs source_export_id or source_file provenance");
  if (!reviewers.length) missing.push("needs reviewed_by");

  return {
    ok: missing.length === 0,
    rows: eligibleRows,
    row_count: eligibleRows.length,
    date_count: dates.length,
    required_row_count: minRows,
    required_date_count: minDates,
    window_start: dates[0] || "",
    window_end: dates[dates.length - 1] || "",
    source_refs: sourceRefs,
    reviewers,
    missing,
  };
}

export function pageFeedbackRollup(
  rows,
  { minRows = MIN_DECISION_EVIDENCE_ROWS, minDates = MIN_DECISION_EVIDENCE_DATES } = {}
) {
  const pages = Array.from(groupRowsByPageEvidence(rows).entries()).map(([key, pageRows]) => {
    const signalRows = pageRows.filter(isSignalBearingPageRow);
    const reviewReadyRows = pageRows.filter(isReviewReadyPageRow);
    const evidence = pageDecisionEvidence(pageRows, { minRows, minDates });
    return {
      key,
      raw_row_count: pageRows.length,
      signal_row_count: signalRows.length,
      review_ready_row_count: reviewReadyRows.length,
      decision_grade_row_count: evidence.ok ? evidence.row_count : 0,
      decision_grade: evidence.ok,
      evidence,
    };
  });

  return {
    raw_row_count: rows.length,
    page_count: pages.length,
    signal_row_count: pages.reduce((total, page) => total + page.signal_row_count, 0),
    review_ready_row_count: pages.reduce((total, page) => total + page.review_ready_row_count, 0),
    decision_grade_page_count: pages.filter((page) => page.decision_grade).length,
    decision_grade_row_count: pages.reduce((total, page) => total + page.decision_grade_row_count, 0),
    pages,
  };
}

function componentScore({ good, medium, weak, value, max }) {
  const numeric = number(value);
  if (numeric >= good) return max;
  if (numeric >= medium) return Math.round(max * 0.67);
  if (numeric > weak) return Math.round(max * 0.34);
  return 0;
}

export function contentHealthScore(row) {
  if (!shouldScorePageRow(row)) return "";

  const seo = componentScore({ value: number(row.gsc_clicks) + number(row.bing_clicks), weak: 0, medium: 5, good: 20, max: 30 });
  const aeo = componentScore({ value: row.ai_citations, weak: 0, medium: 1, good: 3, max: 25 });
  const engagement = componentScore({ value: row.ga4_engaged_sessions, weak: 0, medium: 10, good: 40, max: 20 });
  const buyer = componentScore({ value: row.ga4_conversions, weak: 0, medium: 1, good: 3, max: 15 });
  const freshness = 10;
  return Math.min(100, seo + aeo + engagement + buyer + freshness);
}

export function refreshPriorityScore(row) {
  if (!shouldScorePageRow(row)) return "";

  const trafficOpportunity = componentScore({ value: row.gsc_impressions, weak: 0, medium: 50, good: 500, max: 25 });
  const citationGap = number(row.ai_citations) > 0 ? 0 : 20;
  const ctr = number(row.gsc_ctr);
  const ctrGap = number(row.gsc_impressions) > 100 && ctr < 0.02 ? 20 : number(row.gsc_impressions) > 50 && ctr < 0.04 ? 12 : 0;
  const sourceStaleness = 0;
  const conversionPotential = componentScore({ value: row.distribution_clicks, weak: 0, medium: 10, good: 50, max: 15 });
  const recentUpdatePenalty = 0;
  return Math.max(0, Math.min(100, trafficOpportunity + citationGap + ctrGap + sourceStaleness + conversionPotential - recentUpdatePenalty));
}
