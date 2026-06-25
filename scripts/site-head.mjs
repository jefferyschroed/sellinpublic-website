export const SITE_FAVICON_PATH = "/public/assets/brand/hashtagiconlight.webp";
export const REB2B_TRACKING_KEY = "4N210HQMXV6Z";
export const REB2B_TRACKING_START = "<!-- SIP_REB2B_TRACKING_START -->";
export const REB2B_TRACKING_END = "<!-- SIP_REB2B_TRACKING_END -->";

function decodeEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function getAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
}

function normalizeHref(value) {
  const href = String(value || "").split(/[?#]/)[0];
  const originRelative = href.replace(/^https?:\/\/sellinpublic\.co\//i, "/");
  return originRelative.replace(/^\/+/, "");
}

export function renderFaviconLinks() {
  return [
    `<link rel="icon" href="${SITE_FAVICON_PATH}" type="image/webp" sizes="any" />`,
    `<link rel="shortcut icon" href="${SITE_FAVICON_PATH}" type="image/webp" />`,
    `<link rel="apple-touch-icon" href="${SITE_FAVICON_PATH}" type="image/webp" sizes="180x180" />`,
  ].join("\n    ");
}

export function renderReb2bTracking(key = REB2B_TRACKING_KEY) {
  const normalizedKey = String(key || "").trim();
  if (!/^[A-Z0-9]+$/i.test(normalizedKey)) return "";
  return `${REB2B_TRACKING_START}
    <script>!function(key) {if (window.reb2b) return;window.reb2b = {loaded: true};var s = document.createElement("script");s.async = true;s.src = "https://ddwl4m2hdecbv.cloudfront.net/b/" + key + "/" + key + ".js.gz";document.getElementsByTagName("script")[0].parentNode.insertBefore(s, document.getElementsByTagName("script")[0]);}("${normalizedKey}");</script>
    ${REB2B_TRACKING_END}`;
}

export function hasSiteFavicon(html) {
  const expected = normalizeHref(SITE_FAVICON_PATH);
  return Array.from(String(html || "").matchAll(/<link\b([^>]*)>/gi)).some((match) => {
    const relTokens = getAttr(match[1], "rel").toLowerCase().split(/\s+/).filter(Boolean);
    const href = normalizeHref(getAttr(match[1], "href"));
    return relTokens.includes("icon") && href === expected;
  });
}

export function hasReb2bTracking(html, key = REB2B_TRACKING_KEY) {
  const source = String(html || "");
  const expectedKey = String(key || "").trim();
  return (
    Boolean(expectedKey) &&
    source.includes("window.reb2b") &&
    source.includes("https://ddwl4m2hdecbv.cloudfront.net/b/") &&
    source.includes(expectedKey)
  );
}
