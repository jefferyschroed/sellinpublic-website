export const SEARCH_QUERY_HEADERS = [
  "date",
  "source",
  "source_export_id",
  "source_file",
  "property_id",
  "timezone",
  "captured_by",
  "reviewed_by",
  "query",
  "page_url",
  "slug",
  "device",
  "country",
  "clicks",
  "impressions",
  "ctr",
  "avg_position",
  "search_intent",
  "serp_features",
  "content_action",
  "notes",
];

export function slugFromUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const clean = url.pathname.replace(/\/+$/, "");
    const blogMatch = clean.match(/^\/blog\/([^/]+)$/);
    if (blogMatch) return blogMatch[1];
    if (clean === "" || clean === "/") return "home";
    return clean.split("/").filter(Boolean).pop() || "home";
  } catch {
    return "";
  }
}

export function classifyIntent(query) {
  const text = String(query).toLowerCase();
  if (/\bvs\b|versus|alternative|compare|comparison/.test(text)) return "comparison";
  if (/what is|definition|meaning/.test(text)) return "definition";
  if (/how to|how do|steps|checklist/.test(text)) return "how_to";
  if (/example|case study|examples/.test(text)) return "example";
  if (/measure|roi|analytics|metric/.test(text)) return "measurement";
  return "unknown";
}
