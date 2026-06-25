#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { configuredMeasurementId } from "./blog/google-tag.mjs";
import { hasReb2bTracking, hasSiteFavicon, REB2B_TRACKING_KEY, SITE_FAVICON_PATH } from "./site-head.mjs";
import { extractPublicTextBlocks, scanAntiAiismsInBlocks } from "./seo-aeo/lib/anti-aiism-scan.mjs";

const root = process.cwd();
const input = process.argv[2];
const AUTHOR_NAME = "Jeffery Schroeder";
const AUTHOR_URL = "https://www.linkedin.com/in/jeffery-schroeder-957b98337/";
const HERO_RATIO_MIN = 2;
const HERO_RATIO_MAX = 2.6;
const TITLE_MAX_LENGTH = 60;
const TITLE_TARGET_MIN_LENGTH = 45;
const TITLE_TARGET_MAX_LENGTH = 58;
const META_DESCRIPTION_MIN_LENGTH = 110;
const META_DESCRIPTION_MAX_LENGTH = 155;
const META_DESCRIPTION_TARGET_MIN_LENGTH = 130;
const META_DESCRIPTION_TARGET_MAX_LENGTH = 150;
const SOCIAL_DESCRIPTION_MAX_LENGTH = 155;
const HERO_ALT_MIN_LENGTH = 24;

const failures = [];
const passes = [];

const fail = (message) => failures.push(message);
const pass = (message) => passes.push(message);

if (!input) {
  console.error("Usage: node scripts/check-blog-post.mjs blog/[slug]/index.html");
  process.exit(2);
}

const postPath = path.resolve(root, input);
if (!fs.existsSync(postPath)) {
  console.error(`Blog post not found: ${postPath}`);
  process.exit(2);
}

const html = fs.readFileSync(postPath, "utf8");
const measurementId = configuredMeasurementId(root);
const relativePostPath = path.relative(root, postPath).replaceAll(path.sep, "/");
const slugMatch = relativePostPath.match(/^blog\/([^/]+)\/index\.html$/);
const slug = slugMatch?.[1];

if (!slug) {
  fail("Post path must be blog/[slug]/index.html.");
} else {
  pass(`Post slug detected: ${slug}`);
}

const decodeEntities = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

const stripTags = (value) => decodeEntities(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());

const getAttr = (attrs, name) => {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
};

const hasAttr = (attrs, name) => new RegExp(`(?:^|\\s)${name}\\s*=`, "i").test(attrs);

const tagAttrs = (tagName, source) =>
  Array.from(source.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))).map((match) => match[1]);

const tagBlocks = (tagName, source) =>
  Array.from(source.matchAll(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi"))).map((match) => ({
    attrs: match[1],
    body: match[2],
    full: match[0],
  }));

const resolveSitePath = (src) => path.join(root, src.replace(/^\//, "").split("?")[0]);

const readImageDimensions = (filePath) => {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      format: "png",
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          format: "jpeg",
        };
      }
      offset += 2 + size;
    }
  }

  if (
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunkType = buffer.toString("ascii", 12, 16);

    if (chunkType === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
        format: "webp",
      };
    }

    if (chunkType === "VP8 " && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        format: "webp",
      };
    }

    if (chunkType === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
        format: "webp",
      };
    }
  }

  throw new Error(`Unsupported image format for dimension check: ${filePath}`);
};

const firstMetaContent = ({ name, property }) => {
  const attrs = tagAttrs("meta", html).find((item) => {
    if (name) return getAttr(item, "name").toLowerCase() === name.toLowerCase();
    if (property) return getAttr(item, "property").toLowerCase() === property.toLowerCase();
    return false;
  });
  return attrs ? getAttr(attrs, "content") : "";
};

const assertMaxLength = (label, value, max) => {
  const length = String(value || "").trim().length;
  if (!length) {
    fail(`${label} is missing.`);
    return;
  }
  if (length <= max) pass(`${label} is ${length} characters.`);
  else fail(`${label} must be ${max} characters or fewer, found ${length}.`);
};

const assertRangeLength = (label, value, min, max) => {
  const length = String(value || "").trim().length;
  if (length >= min && length <= max) pass(`${label} is ${length} characters.`);
  else fail(`${label} must be ${min}-${max} characters, found ${length}.`);
};

const collectJsonLdTypes = (value, types = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdTypes(item, types));
    return types;
  }

  if (!value || typeof value !== "object") return types;

  const type = value["@type"];
  if (Array.isArray(type)) types.push(...type);
  if (typeof type === "string") types.push(type);

  if (value["@graph"]) collectJsonLdTypes(value["@graph"], types);

  Object.values(value).forEach((item) => {
    if (item && typeof item === "object" && item !== value["@graph"]) collectJsonLdTypes(item, types);
  });

  return types;
};

const h1Count = tagAttrs("h1", html).length;
if (h1Count === 1) pass("Exactly one H1 is present.");
else fail(`Expected exactly one H1, found ${h1Count}.`);

const titleText = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
assertMaxLength("Rendered <title>", titleText, TITLE_MAX_LENGTH);
if (
  titleText.length >= TITLE_TARGET_MIN_LENGTH &&
  titleText.length <= TITLE_TARGET_MAX_LENGTH
) {
  pass(`Rendered <title> is in the ${TITLE_TARGET_MIN_LENGTH}-${TITLE_TARGET_MAX_LENGTH} character target range.`);
}

const metaDescription = firstMetaContent({ name: "description" });
assertRangeLength("Meta description", metaDescription, META_DESCRIPTION_MIN_LENGTH, META_DESCRIPTION_MAX_LENGTH);
if (
  metaDescription.length >= META_DESCRIPTION_TARGET_MIN_LENGTH &&
  metaDescription.length <= META_DESCRIPTION_TARGET_MAX_LENGTH
) {
  pass(`Meta description is in the ${META_DESCRIPTION_TARGET_MIN_LENGTH}-${META_DESCRIPTION_TARGET_MAX_LENGTH} character target range.`);
}
assertMaxLength("Open Graph title", firstMetaContent({ property: "og:title" }), TITLE_MAX_LENGTH);
assertMaxLength("Twitter title", firstMetaContent({ name: "twitter:title" }), TITLE_MAX_LENGTH);
assertMaxLength("Open Graph description", firstMetaContent({ property: "og:description" }), SOCIAL_DESCRIPTION_MAX_LENGTH);
assertMaxLength("Twitter description", firstMetaContent({ name: "twitter:description" }), SOCIAL_DESCRIPTION_MAX_LENGTH);

if (
  measurementId &&
  html.includes("window.SIP_TRACKING.ga4MeasurementId") &&
  html.includes(measurementId)
) {
  pass(`Consent-managed GA4 config is present for ${measurementId}.`);
} else {
  fail(`Consent-managed GA4 config must be present for ${measurementId || "the configured Measurement ID"}.`);
}

if (hasSiteFavicon(html)) pass(`Site favicon points to ${SITE_FAVICON_PATH}.`);
else fail(`Site favicon link must point to ${SITE_FAVICON_PATH}.`);

if (hasReb2bTracking(html)) pass(`ReB2B tracking is present for ${REB2B_TRACKING_KEY}.`);
else fail(`ReB2B tracking must be present for ${REB2B_TRACKING_KEY}.`);

const metaAuthor = tagAttrs("meta", html)
  .filter((attrs) => getAttr(attrs, "name").toLowerCase() === "author")
  .map((attrs) => getAttr(attrs, "content"))[0];
if (metaAuthor === AUTHOR_NAME) pass("Meta author is Jeffery Schroeder.");
else fail(`Meta author must be ${AUTHOR_NAME}.`);

const authorLinks = tagBlocks("a", html).filter((link) => {
  const classes = getAttr(link.attrs, "class").split(/\s+/);
  return classes.includes("blog-author");
});

if (authorLinks.some((link) => getAttr(link.attrs, "href") === AUTHOR_URL && stripTags(link.body) === AUTHOR_NAME)) {
  pass("Visible author links to Jeffery Schroeder's LinkedIn profile.");
} else {
  fail(`Visible .blog-author link must use ${AUTHOR_NAME} and ${AUTHOR_URL}.`);
}

const jsonLdBlocks = tagBlocks("script", html).filter(
  (script) => getAttr(script.attrs, "type").toLowerCase() === "application/ld+json"
);
const jsonLdTypes = [];
jsonLdBlocks.forEach((script, index) => {
  try {
    jsonLdTypes.push(...collectJsonLdTypes(JSON.parse(script.body.trim())));
  } catch (error) {
    fail(`JSON-LD block ${index + 1} is not valid JSON: ${error.message}`);
  }
});

["BlogPosting", "BreadcrumbList", "FAQPage"].forEach((type) => {
  if (jsonLdTypes.includes(type)) pass(`${type} JSON-LD is present.`);
  else fail(`${type} JSON-LD is missing.`);
});

const layoutIndex = html.indexOf('class="blog-layout"');
const railIndex = html.indexOf('class="blog-rail"');
const mainIndex = html.indexOf('class="blog-main"');
const introIndex = html.indexOf('class="blog-intro');
const articleIndex = html.indexOf('class="blog-article"');
const tocIndex = html.indexOf('class="blog-toc"');
if (
  layoutIndex >= 0 &&
  railIndex > layoutIndex &&
  mainIndex > railIndex &&
  introIndex > mainIndex &&
  articleIndex > introIndex &&
  tocIndex > articleIndex
) {
  pass("Page-level layout places side rails beside the intro, hero, and article.");
} else {
  fail("Post must use .blog-layout with .blog-rail, .blog-main, and .blog-toc as page-level siblings.");
}

const imageAttrs = tagAttrs("img", html);
if (!imageAttrs.length) {
  fail("Rendered blog HTML must include images with alt text.");
} else {
  const badImages = imageAttrs
    .map((attrs, index) => ({
      index: index + 1,
      src: getAttr(attrs, "src"),
      missingAlt: !hasAttr(attrs, "alt"),
      alt: getAttr(attrs, "alt").trim(),
    }))
    .filter((image) => image.missingAlt || !image.alt);
  if (!badImages.length) {
    pass("Every rendered image has non-empty alt text.");
  } else {
    fail(
      `Every rendered image must have non-empty alt text. Offenders: ${badImages
        .map((image) => `${image.src || `image ${image.index}`}${image.missingAlt ? " missing alt" : " empty alt"}`)
        .join(", ")}.`
    );
  }
}

const heroFigure = html.match(/<figure\b[^>]*class=["'][^"']*\bblog-hero\b[^"']*["'][^>]*>([\s\S]*?)<\/figure>/i);
if (!heroFigure) {
  fail("Hero figure with class blog-hero is missing.");
} else {
  const heroImgMatch = heroFigure[1].match(/<img\b([^>]*)>/i);
  if (!heroImgMatch) {
    fail("Hero figure must contain an img.");
  } else {
    const attrs = heroImgMatch[1];
    const src = getAttr(attrs, "src");
    const alt = getAttr(attrs, "alt");
    const widthAttr = Number(getAttr(attrs, "width"));
    const heightAttr = Number(getAttr(attrs, "height"));

    if (alt.length >= HERO_ALT_MIN_LENGTH) pass("Hero image has descriptive alt text.");
    else fail(`Hero image alt text must be at least ${HERO_ALT_MIN_LENGTH} characters.`);

    if (slug && src.startsWith(`/public/assets/blog/${slug}/`)) {
      pass("Hero image is post-local.");
    } else {
      fail(`Hero image must live under /public/assets/blog/${slug || "[slug]"}/.`);
    }

    if (src.endsWith(".webp")) {
      pass("Hero image uses WebP as the publishable source.");
    } else {
      fail("Hero image src must use .webp as the publishable source.");
    }

    if (src.includes("/public/assets/hero/")) {
      fail("Hero image must not reuse the global site hero asset folder.");
    }

    const heroPath = resolveSitePath(src);
    if (!fs.existsSync(heroPath)) {
      fail(`Hero image file does not exist: ${src}`);
    } else {
      try {
        const dimensions = readImageDimensions(heroPath);
        const ratio = dimensions.width / dimensions.height;
        if (widthAttr === dimensions.width && heightAttr === dimensions.height) {
          pass(`Hero width and height attributes match source image (${dimensions.width}x${dimensions.height}).`);
        } else {
          fail(`Hero width/height attrs must match source image (${dimensions.width}x${dimensions.height}).`);
        }

        if (ratio >= HERO_RATIO_MIN && ratio <= HERO_RATIO_MAX) {
          pass(`Hero aspect ratio is within ${HERO_RATIO_MIN}:1 to ${HERO_RATIO_MAX}:1.`);
        } else {
          fail(`Hero aspect ratio must be ${HERO_RATIO_MIN}:1 to ${HERO_RATIO_MAX}:1, found ${ratio.toFixed(2)}:1.`);
        }
      } catch (error) {
        fail(error.message);
      }
    }
  }
}

const mediaFigures = Array.from(html.matchAll(/<figure\b[^>]*class=["'][^"']*\bblog-media\b[^"']*["'][^>]*>([\s\S]*?)<\/figure>/gi));
mediaFigures.forEach((figure, index) => {
  const imgMatch = figure[1].match(/<img\b([^>]*)>/i);
  if (!imgMatch) return;

  const attrs = imgMatch[1];
  const src = getAttr(attrs, "src");
  const widthAttr = Number(getAttr(attrs, "width"));
  const heightAttr = Number(getAttr(attrs, "height"));
  const imagePath = resolveSitePath(src);

  if (!fs.existsSync(imagePath)) {
    fail(`Blog media image ${index + 1} file does not exist: ${src}`);
    return;
  }

  try {
    const dimensions = readImageDimensions(imagePath);
    if (widthAttr === dimensions.width && heightAttr === dimensions.height) {
      pass(`Blog media image ${index + 1} width and height match source image.`);
    } else {
      fail(`Blog media image ${index + 1} width/height attrs must match source image (${dimensions.width}x${dimensions.height}).`);
    }
  } catch (error) {
    fail(error.message);
  }
});

if (!html.includes("data-copy-block")) {
  pass("No copy blocks present.");
} else if (html.includes("copy-button__icon--copy") && html.includes("copy-button__icon--check")) {
  pass("Copy block uses icon-only clipboard/check states.");
} else {
  fail("Copy blocks must include clipboard and check icons.");
}

["data-copy-page", "data-ask-ai"].forEach((attribute) => {
  const pattern = new RegExp(`<button\\b(?=[^>]*${attribute})(?=[\\s\\S]*?blog-floating-button__check)[\\s\\S]*?<\\/button>`, "i");
  if (pattern.test(html)) pass(`Floating ${attribute} button includes check state.`);
  else fail(`Floating ${attribute} button must include .blog-floating-button__check.`);
});

const ctaMatch = html.match(/<section\b[^>]*class=["'][^"']*\bblog-cta\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
if (ctaMatch && !/<u\b|text-decoration\s*:/i.test(ctaMatch[1])) {
  pass("CTA markup does not add underlines.");
} else {
  fail("CTA markup must not add underlines.");
}

const articleMatch = html.match(/<article\b[^>]*class=["'][^"']*\bblog-article\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i);
const featurePitchPhrases = [
  { label: "booked meetings/conversations claim", pattern: /\bbooked (sales )?(calls|meetings|conversations)\b/i },
  { label: "managed sales motion", pattern: /\bmanaged sales motion\b/i },
  { label: "managed system feature pitch", pattern: /\bmanaged system that turns\b/i },
  { label: "feature-heavy outreach phrase", pattern: /\brelevant outreach\b/i },
  { label: "feature-heavy reply phrase", pattern: /\bhandled replies\b/i },
];

const scanForFeaturePitch = (name, source) => {
  const hits = featurePitchPhrases.filter(({ pattern }) => pattern.test(source));
  if (!hits.length) {
    pass(`${name} avoids feature-heavy positioning phrases.`);
    return;
  }

  fail(`${name} includes feature-heavy positioning language: ${hits.map((hit) => hit.label).join(", ")}.`);
};

if (articleMatch) scanForFeaturePitch("Article body", articleMatch[1]);
else fail("Article body with class blog-article is missing.");

if (articleMatch) {
  const articleText = stripTags(articleMatch[1]);
  const styleRules = [
    { label: "em dash", pattern: /—/ },
    { label: "unlock", pattern: /\bunlock\b/i },
    { label: "leverage as business filler", pattern: /\bleverage\b/i },
    { label: "supercharge", pattern: /\bsupercharge\b/i },
    { label: "game-changer", pattern: /\bgame-?chang(?:er|ing)\b/i },
    { label: "seamless", pattern: /\bseamless\b/i },
    { label: "robust", pattern: /\brobust\b/i },
    { label: "cutting-edge", pattern: /\bcutting-edge\b/i },
    { label: "transformative", pattern: /\btransformative\b/i },
    { label: "empower", pattern: /\bempower(?:s|ed|ing)?\b/i },
    { label: "delve", pattern: /\bdelve\b/i },
    { label: "holistic", pattern: /\bholistic\b/i },
    { label: "synergy", pattern: /\bsynergy\b/i },
    { label: "frictionless", pattern: /\bfrictionless\b/i },
    { label: "impactful", pattern: /\bimpactful\b/i },
    { label: "actionable", pattern: /\bactionable\b/i },
    { label: "utilize", pattern: /\butiliz(?:e|es|ed|ing)\b/i },
    { label: "facilitate", pattern: /\bfacilitat(?:e|es|ed|ing)\b/i },
    { label: "demonstrate", pattern: /\bdemonstrat(?:e|es|ed|ing)\b/i },
    { label: "generic landscape opener", pattern: /\bin today's\b/i },
    { label: "now more than ever", pattern: /\bnow more than ever\b/i },
    { label: "In this article", pattern: /\bin this article\b/i },
    { label: "By the end of this post", pattern: /\bby the end of this post\b/i },
    { label: "At the end of the day", pattern: /\bat the end of the day\b/i },
    { label: "drive results", pattern: /\bdrive results\b/i },
    { label: "move the needle", pattern: /\bmove the needle\b/i },
    { label: "stand out from the noise", pattern: /\bstand out from the noise\b/i },
    { label: "cut through the clutter", pattern: /\bcut through the clutter\b/i },
    { label: "here's why that matters", pattern: /\bhere's why that matters\b/i },
    { label: "but here's the catch", pattern: /\bbut here's the catch\b/i },
  ];
  const styleHits = styleRules.filter(({ pattern }) => pattern.test(articleText));
  if (!styleHits.length) {
    pass("Article body passes the Sell In Public SEO blog style scan.");
  } else {
    fail(`Article body violates the Sell In Public SEO blog style scan: ${styleHits.map((hit) => hit.label).join(", ")}.`);
  }

  const antiAiismFindings = scanAntiAiismsInBlocks(extractPublicTextBlocks(articleMatch[1]), {
    root,
    examplesPost: /\bexamples\b/i.test(slug || ""),
    source: "rendered_article_scan",
  });
  if (!antiAiismFindings.length) {
    pass("Article body passes the deterministic anti-AIism scan.");
  } else {
    const summary = antiAiismFindings
      .slice(0, 6)
      .map((finding) => `${finding.rule_id || finding.category}: "${finding.quote}"`)
      .join("; ");
    fail(`Article body violates the deterministic anti-AIism scan: ${summary}.`);
  }
}

const stylesheetHrefs = tagAttrs("link", html)
  .filter((attrs) => getAttr(attrs, "rel").toLowerCase() === "stylesheet")
  .map((attrs) => getAttr(attrs, "href"));
const blogCssHref = stylesheetHrefs.find((href) => href.startsWith("/blog/blog.css"));
if (!blogCssHref) {
  fail("Post must use /blog/blog.css.");
} else {
  const cssPath = resolveSitePath(blogCssHref);
  const css = fs.readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const cssRules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));

  const hasForcedImageSizing = (body) =>
    body
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .some((declaration) => {
        const [property, ...valueParts] = declaration.split(":");
        const propertyName = property?.trim().toLowerCase();
        const value = valueParts.join(":").trim().toLowerCase();
        return propertyName === "object-fit" || (propertyName === "height" && value !== "auto");
      });

  const mediaRules = cssRules.filter((rule) => rule.selector.includes(".blog-media img") || rule.selector.includes(".blog-media video"));
  const forcedMediaRule = mediaRules.find((rule) => hasForcedImageSizing(rule.body));
  if (mediaRules.length && !forcedMediaRule) pass("Blog media CSS preserves source aspect ratios.");
  else fail("Blog media CSS must use natural height and must not force object-fit.");

  const heroRules = cssRules.filter((rule) => rule.selector.includes(".blog-hero img"));
  const forcedHeroRule = heroRules.find((rule) => hasForcedImageSizing(rule.body));
  if (heroRules.length && !forcedHeroRule) pass("Hero CSS preserves source aspect ratio.");
  else fail("Hero CSS must use natural height and must not force object-fit.");

  const ctaRule = cssRules.find((rule) => rule.selector === ".blog-cta a" && /text-decoration\s*:\s*none\s*;?/i.test(rule.body));
  if (ctaRule) pass("CTA links are globally un-underlined in the blog foundation.");
  else fail("CSS must include .blog-cta a { text-decoration: none; }.");

  const floatingRule = cssRules.find((rule) => rule.selector === ".blog-floating-button" && /opacity\s*:\s*0\.[0-9]+/i.test(rule.body));
  const floatingCopiedRule = cssRules.find((rule) => rule.selector === ".blog-floating-button.is-copied" && /transform\s*:\s*scale/i.test(rule.body));
  if (floatingRule && floatingCopiedRule) pass("Floating buttons have translucent default and copied expansion state.");
  else fail("Floating buttons must be translucent by default and expand on copied state.");

  const layoutRule = cssRules.find((rule) => rule.selector === ".blog-layout" && /grid-template-columns\s*:/i.test(rule.body));
  const mainRule = cssRules.find((rule) => rule.selector === ".blog-main" && /min-width\s*:\s*0/i.test(rule.body));
  const stickyRule = cssRules.find((rule) => rule.selector.includes(".blog-rail") && rule.selector.includes(".blog-toc") && /position\s*:\s*sticky/i.test(rule.body));
  if (layoutRule && mainRule && stickyRule) pass("Blog layout CSS supports page-level sticky side rails.");
  else fail("Blog layout CSS must keep .blog-rail and .blog-toc sticky beside .blog-main.");
}

if (failures.length) {
  console.error("\nBlog post check failed:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  console.error("\nPassing checks:\n");
  passes.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nBlog post check passed:\n");
passes.forEach((message) => console.log(`- ${message}`));
