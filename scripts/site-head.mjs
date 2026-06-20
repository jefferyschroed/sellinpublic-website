export const SITE_FAVICON_PATH = "/public/assets/brand/hashtagiconlight.webp";

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

export function hasSiteFavicon(html) {
  const expected = normalizeHref(SITE_FAVICON_PATH);
  return Array.from(String(html || "").matchAll(/<link\b([^>]*)>/gi)).some((match) => {
    const relTokens = getAttr(match[1], "rel").toLowerCase().split(/\s+/).filter(Boolean);
    const href = normalizeHref(getAttr(match[1], "href"));
    return relTokens.includes("icon") && href === expected;
  });
}
