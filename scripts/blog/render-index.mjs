import fs from "node:fs";
import path from "node:path";
import { renderFaviconLinks } from "../site-head.mjs";
import { renderGoogleTag } from "./google-tag.mjs";
import { assertSafeSlug, listPacketDirs, loadPacket, writeTextAtomic } from "./packet.mjs";
import { validatePacket } from "./validate-packet.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(`${value}T09:00:00-07:00`));
}

function hasPublishedStaticPost(packet, root) {
  const slug = packet.brief.slug;
  if (!slug) return false;

  try {
    assertSafeSlug(slug);
  } catch {
    return false;
  }

  const status = String(packet.brief.status || "").toLowerCase();
  const publishableStatus =
    status.includes("published") || status === "ready_to_publish" || status === "publish_ready";

  return (
    publishableStatus &&
    packet.exists("publish-meta.yaml") &&
    Boolean(packet.publishMeta.canonical_url) &&
    fs.existsSync(path.join(root, "blog", slug, "index.html"))
  );
}

export function collectPublishedPackets(root = process.cwd()) {
  return listPacketDirs(root)
    .map((packetDir) => {
      const packet = loadPacket(packetDir, root);
      return { packet, validation: validatePacket(packetDir, root) };
    })
    .filter(({ packet, validation }) => validation.ok || hasPublishedStaticPost(packet, root))
    .map(({ packet }) => packet)
    .filter((packet) => {
      assertSafeSlug(packet.brief.slug);
      return packet.brief.slug && packet.publishMeta.canonical_url && packet.exists("publish-meta.yaml");
    })
    .sort((a, b) => String(b.publishMeta.publish_date).localeCompare(String(a.publishMeta.publish_date)));
}

function renderCards(packets) {
  return packets
    .map((packet) => {
      const title = packet.articleBlocks?.title || packet.brief.working_title;
      const hero = packet.articleBlocks?.hero || {};
      return `<article class="blog-card card-reveal">
          <a class="blog-card__image" href="/blog/${escapeHtml(packet.brief.slug)}/" aria-label="Read ${escapeHtml(title)}">
            <img
              src="${escapeHtml(hero.src || packet.publishMeta.og_image)}"
              alt="${escapeHtml(hero.alt || packet.publishMeta.og_image_alt || title)}"
              width="${escapeHtml(hero.width || 1600)}"
              height="${escapeHtml(hero.height || 700)}"
              loading="eager"
            />
          </a>
          <div class="blog-card__body">
            <p class="blog-card__meta">${escapeHtml(packet.publishMeta.category)} / ${escapeHtml(formatDate(packet.publishMeta.publish_date))}</p>
            <h2>
              <a href="/blog/${escapeHtml(packet.brief.slug)}/">${escapeHtml(title)}</a>
            </h2>
            <p>${escapeHtml(packet.publishMeta.excerpt)}</p>
            <a class="sip-btn sip-btn--primary" href="/blog/${escapeHtml(packet.brief.slug)}/">Read the article</a>
          </div>
        </article>`;
    })
    .join("\n        ");
}

function renderFooter() {
  return `<section class="final-cta-footer blog-footer-wrap" id="booking" aria-labelledby="final-cta-footer-heading" data-nav-theme="dark">
      <div class="final-cta-footer__panel">
        <div class="final-cta-footer__art" aria-hidden="true">
          <img class="final-cta-footer__art-image" src="/public/assets/hero/hero-cloudspace-garden-draft.png" alt="" width="1672" height="941" loading="lazy" />
          <div class="final-cta-footer__scrim"></div>
        </div>
        <div class="final-cta-footer__inner">
          <div class="final-cta-footer__copy texts-reveal">
            <p class="section-eyebrow">Ready to get started</p>
            <h2 class="final-cta-footer__heading" id="final-cta-footer-heading">
              Find out if Sell In Public is the right fit for your <span class="serif-italic">team.</span>
            </h2>
            <p class="final-cta-footer__lede">
              Book a short working session. We'll look at your ICP, the voices on your team that can create real credibility, and the pipeline motion you're trying to build.
            </p>
            <div class="final-cta-footer__actions">
              <a class="final-cta-footer__button final-cta-footer__button--primary" href="https://calendly.com/jeff-tryquicksetters/30min">Book a Working Session</a>
              <a class="final-cta-footer__button final-cta-footer__button--secondary" href="/">Review the System</a>
            </div>
          </div>
        </div>
        <footer class="site-footer" aria-label="Sell In Public footer">
          <a class="site-footer__brand" href="/" aria-label="Sell In Public home">
            <img src="/public/assets/brand/sellinpubliclight.webp" alt="Sell In Public" width="2151" height="419" loading="lazy" />
          </a>
          <nav class="site-footer__nav" aria-label="Footer navigation">
            <a href="/#services">Services</a>
            <a href="/#system">System</a>
            <a href="/#proof">Proof</a>
            <a href="/blog/">Blog</a>
            <a href="/#faq">FAQ</a>
          </nav>
          <p>&copy; 2026 Sell In Public. Employee-generated content and managed outbound for B2B teams.</p>
        </footer>
      </div>
    </section>`;
}

export function renderBlogIndexHtml(packets) {
  const primaryImage = packets[0]?.publishMeta.og_image || "https://sellinpublic.co/public/assets/brand/hashtagiconlight.webp";
  const primaryImageAlt = packets[0]?.publishMeta.og_image_alt || "Sell In Public blog";
  const cards = renderCards(packets);

  return `<!doctype html>
<html lang="en">
  <head>
    ${renderGoogleTag()}
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index, follow" />
    <meta name="author" content="Jeffery Schroeder" />
    <title>Sell In Public Blog - Employee-generated content research and examples</title>
    <meta name="description" content="Research-backed notes on employee-generated content, B2B social strategy, examples, source-backed statistics, and useful editorial checklists." />
    ${renderFaviconLinks()}
    <link rel="canonical" href="https://sellinpublic.co/blog/" />
    <meta property="og:title" content="Sell In Public Blog" />
    <meta property="og:description" content="Research-backed notes on employee-generated content, B2B social strategy, examples, and useful editorial checklists." />
    <meta property="og:site_name" content="Sell In Public" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://sellinpublic.co/blog/" />
    <meta property="og:image" content="${escapeHtml(primaryImage)}" />
    <meta property="og:image:alt" content="${escapeHtml(primaryImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Sell In Public Blog" />
    <meta name="twitter:description" content="Definitions, examples, and practical notes on employee-generated content." />
    <meta name="twitter:image" content="${escapeHtml(primaryImage)}" />
    <meta name="theme-color" content="#f3eeee" />
    <link rel="stylesheet" href="/styles.css?v=nav-operating-desk-3" />
    <link rel="stylesheet" href="/blog/blog.css?v=foundation-6" />
  </head>
  <body class="blog-page">
    <a class="blog-skip-link" href="#main">Skip to articles</a>

    <nav class="sip-nav glass-surface" aria-label="Primary navigation" data-theme="light">
      <a class="sip-brand" href="/" aria-label="Sell In Public home">
        <span class="sip-brand__logo-wrap" aria-hidden="true">
          <img class="sip-brand__logo sip-brand__logo--light" src="/public/assets/brand/hashtagiconlight.webp" alt="" width="262" height="263" />
          <img class="sip-brand__logo sip-brand__logo--dark" src="/public/assets/brand/hashtagicondark.webp" alt="" width="262" height="263" />
        </span>
      </a>
      <button class="sip-nav__toggle" type="button" aria-expanded="false" aria-controls="primary-nav-menu" aria-label="Open navigation menu" title="Open navigation menu">
        <span class="sip-nav__toggle-box" aria-hidden="true">
          <span class="sip-nav__toggle-line"></span>
          <span class="sip-nav__toggle-line"></span>
          <span class="sip-nav__toggle-line"></span>
        </span>
      </button>
      <div class="sip-nav__menu t-dropdown" id="primary-nav-menu" data-origin="top-right" aria-hidden="true">
        <div class="sip-nav__links" aria-label="Page sections">
          <a href="/#services">Services</a>
          <a href="/#system">System</a>
          <a href="/#proof">Proof</a>
          <a href="/blog/">Blog</a>
          <a href="/#faq">FAQ</a>
        </div>
        <a class="sip-nav__cta sip-btn sip-btn--primary" href="https://calendly.com/jeff-tryquicksetters/30min">
          <span class="sip-nav__cta-full">Book a Discovery Call</span>
          <span class="sip-nav__cta-short">Book call</span>
        </a>
      </div>
    </nav>

    <main class="blog-index" id="main" data-nav-theme="light">
      <section class="blog-intro texts-reveal" aria-labelledby="blog-index-title">
        <p class="blog-kicker">Sell In Public Blog</p>
        <h1 class="blog-title" id="blog-index-title">
          Research-backed notes on employee-generated <span class="serif-italic">content.</span>
        </h1>
        <p class="blog-dek">
          Definitions, examples, statistics, and practical checklists for B2B teams that want useful employee-led content from real expertise.
        </p>
      </section>

      <section class="blog-index-grid" aria-label="Latest articles">
        ${cards}
      </section>
    </main>

    ${renderFooter()}
    <script src="/script.js?v=nav-theme-2"></script>
    <script src="/blog/blog.js?v=foundation-5"></script>
  </body>
</html>
`;
}

export function renderIndex(root = process.cwd(), { dryRun = false } = {}) {
  const packets = collectPublishedPackets(root);
  const html = renderBlogIndexHtml(packets);
  const outputPath = path.join(root, "blog", "index.html");
  const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (!dryRun) {
    writeTextAtomic(outputPath, html);
  }
  return { path: outputPath, bytes: Buffer.byteLength(html), dryRun, postCount: packets.length, changed: previous !== html };
}
