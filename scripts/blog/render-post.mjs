import fs from "node:fs";
import path from "node:path";
import { renderFaviconLinks } from "../site-head.mjs";
import { buildArticleAst } from "./article-ast.mjs";
import { renderGoogleTag } from "./google-tag.mjs";
import { assertSafeSlug, safeOutputPath, writeTextAtomic } from "./packet.mjs";
import { escapeHtml, renderBlogRail } from "./shared-shell.mjs";

const AUTHOR_NAME = "Jeffery Schroeder";
const AUTHOR_URL = "https://www.linkedin.com/in/jeffery-schroeder-957b98337/";

function jsonLd(value) {
  return JSON.stringify(value, null, 8).replaceAll("</", "<\\/");
}

function renderCopyIcon() {
  return `<span class="copy-button__icon copy-button__icon--copy" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <rect x="8" y="8" width="10" height="12" rx="2"></rect>
                    <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </span>
                <span class="copy-button__icon copy-button__icon--check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                </span>`;
}

function renderBlock(block) {
  switch (block.type) {
    case "answer":
      return `<section class="blog-answer" aria-labelledby="${escapeHtml(block.id)}">
            <span class="blog-block-label">${escapeHtml(block.label || "Short answer")}</span>
            ${block.paragraphs
              .map((paragraph, index) => `<p${index === 0 && block.id ? ` id="${escapeHtml(block.id)}"` : ""}>${escapeHtml(paragraph)}</p>`)
              .join("\n            ")}
          </section>`;
    case "paragraph":
      return `<p>${block.html}</p>`;
    case "heading":
      return `<h${block.level} id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h${block.level}>`;
    case "callout":
      return `<div class="blog-callout">
            <span class="blog-block-label">${escapeHtml(block.label)}</span>
            ${block.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n            ")}
          </div>`;
    case "table":
      return `<div class="blog-table-wrap">
            <table class="blog-table">
              <thead>
                <tr>${block.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${block.rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
                  .join("\n                ")}
              </tbody>
            </table>
          </div>`;
    case "list":
      return `<ul>
            ${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n            ")}
          </ul>`;
    case "media":
      return `<figure class="blog-media">
            <img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" width="${escapeHtml(block.width)}" height="${escapeHtml(block.height)}" loading="lazy" />
            <figcaption>${escapeHtml(block.caption)}</figcaption>
          </figure>`;
    case "copy_block":
      return `<div class="copy-block" data-copy-block>
            <div class="copy-block__top">
              <span class="copy-block__title">${escapeHtml(block.title)}</span>
              <button class="copy-button" type="button" data-copy-block-button aria-label="Copy editorial checklist" title="Copy editorial checklist">
                ${renderCopyIcon()}
              </button>
            </div>
            <pre><code>${escapeHtml(block.code)}</code></pre>
          </div>`;
    case "faq":
      return `<section class="blog-faq" aria-labelledby="${escapeHtml(block.id || "faq")}">
            <h2 id="${escapeHtml(block.id || "faq")}">FAQ</h2>
            ${block.items
              .map(
                (item) => `<details>
              <summary>${escapeHtml(item.question)}</summary>
              <p>${escapeHtml(item.answer)}</p>
            </details>`
              )
              .join("\n            ")}
          </section>`;
    case "sources":
      return `<section class="blog-sources" aria-labelledby="${escapeHtml(block.id || "sources")}">
            <h2 id="${escapeHtml(block.id || "sources")}">Sources</h2>
            <ol>
              ${block.items.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>.</li>`).join("\n              ")}
            </ol>
          </section>`;
    case "cta":
      return `<section class="blog-cta" aria-labelledby="article-cta">
            <span class="blog-block-label">${escapeHtml(block.label)}</span>
            <h2 id="article-cta">${escapeHtml(block.heading)}</h2>
            <p>${escapeHtml(block.body)}</p>
            <div class="blog-cta__actions">
              ${block.actions
                .map((action) => `<a class="sip-btn sip-btn--${action.style === "secondary" ? "secondary" : "primary"}" href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a>`)
                .join("\n              ")}
            </div>
          </section>`;
    default:
      throw new Error(`Unsupported article block type: ${block.type}`);
  }
}

function renderFaqJsonLd(faqItems) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function renderPostHtml(packet) {
  const ast = buildArticleAst(packet);
  const meta = packet.publishMeta;
  const canonical = meta.canonical_url;
  const publishedIso = `${meta.publish_date}T09:00:00-07:00`;
  const modifiedIso = `${meta.updated_date}T09:00:00-07:00`;

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": meta.schema_type || "BlogPosting",
    headline: ast.title,
    description: meta.meta_description,
    image: meta.og_image,
    author: {
      "@type": "Person",
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Sell In Public",
      logo: {
        "@type": "ImageObject",
        url: "https://sellinpublic.co/public/assets/brand/hashtagiconlight.webp",
      },
    },
    datePublished: meta.publish_date,
    dateModified: meta.updated_date,
    mainEntityOfPage: canonical,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://sellinpublic.co/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://sellinpublic.co/blog/" },
      { "@type": "ListItem", position: 3, name: ast.title, item: canonical },
    ],
  };

  const body = ast.blocks.map(renderBlock).join("\n\n          ");

  return `<!doctype html>
<html lang="en">
  <head>
    ${renderGoogleTag()}
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="${escapeHtml(meta.robots || "index, follow")}" />
    <meta name="author" content="${AUTHOR_NAME}" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.meta_description)}" />
    ${renderFaviconLinks()}
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(meta.og_title)}" />
    <meta property="og:description" content="${escapeHtml(meta.og_description)}" />
    <meta property="og:site_name" content="Sell In Public" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(meta.og_image)}" />
    <meta property="og:image:alt" content="${escapeHtml(meta.og_image_alt || ast.hero.alt)}" />
    <meta property="article:published_time" content="${escapeHtml(publishedIso)}" />
    <meta property="article:modified_time" content="${escapeHtml(modifiedIso)}" />
    <meta property="article:author" content="${AUTHOR_NAME}" />
    <meta property="article:section" content="${escapeHtml(meta.category)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.twitter_title || meta.og_title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.twitter_description || meta.og_description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.og_image)}" />
    <meta name="theme-color" content="#f3eeee" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Figtree:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css?v=nav-operating-desk-3" />
    <link rel="stylesheet" href="/blog/blog.css?v=foundation-6" />
    <script type="application/ld+json">
      ${jsonLd(blogPosting)}
    </script>
    <script type="application/ld+json">
      ${jsonLd(breadcrumb)}
    </script>
    <script type="application/ld+json">
      ${jsonLd(renderFaqJsonLd(ast.faqItems))}
    </script>
  </head>
  <body class="blog-page">
    <a class="blog-skip-link" href="#article">Skip to article</a>

    <nav class="sip-nav glass-surface" aria-label="Primary navigation" data-theme="light">
      <a class="sip-brand" href="/" aria-label="Sell In Public home">
        <span class="sip-brand__logo-wrap" aria-hidden="true">
          <img class="sip-brand__logo sip-brand__logo--light" src="/public/assets/brand/hashtagiconlight.webp" alt="Light Sell In Public hashtag logo" width="262" height="263" />
          <img class="sip-brand__logo sip-brand__logo--dark" src="/public/assets/brand/hashtagicondark.webp" alt="Dark Sell In Public hashtag logo" width="262" height="263" />
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

    <main class="blog-shell" data-nav-theme="light">
      <div class="blog-layout">
        ${renderBlogRail({ recentHref: `/blog/${ast.slug}/`, recentTitle: ast.title })}

        <div class="blog-main">
          <header class="blog-intro texts-reveal">
            <p class="blog-kicker">${escapeHtml(ast.kicker)}</p>
            <h1 class="blog-title">${escapeHtml(ast.title)}</h1>
            <p class="blog-dek">${escapeHtml(ast.dek)}</p>
            <div class="blog-meta" aria-label="Article metadata">
              <span>${escapeHtml(ast.publishDateLabel)}</span>
              <span><a class="blog-author" href="${AUTHOR_URL}" target="_blank" rel="noreferrer">${AUTHOR_NAME}</a></span>
              <span>${escapeHtml(ast.readTime)}</span>
              <span>${escapeHtml(ast.updatedDateLabel)}</span>
            </div>
          </header>

          <figure class="blog-hero">
            <img src="${escapeHtml(ast.hero.src)}" alt="${escapeHtml(ast.hero.alt)}" width="${escapeHtml(ast.hero.width)}" height="${escapeHtml(ast.hero.height)}" fetchpriority="high" />
            <figcaption>${escapeHtml(ast.hero.caption)}</figcaption>
          </figure>

          <details class="blog-mobile-toc">
            <summary>On this page</summary>
            <nav class="blog-mobile-toc__list" data-toc-list aria-label="Mobile table of contents"></nav>
          </details>

          <article class="blog-article" id="article" data-blog-article>
          ${body}
          </article>
        </div>

        <aside class="blog-toc" aria-label="Table of contents">
          <span class="blog-toc__eyebrow">On this page</span>
          <nav class="blog-toc__list" data-toc-list></nav>
        </aside>
      </div>
    </main>

    <div class="blog-floating-tools" aria-label="Article actions">
      <button class="blog-floating-button" type="button" data-copy-page aria-label="Copy page URL">
        <span data-label>Copy Page</span>
        <span class="blog-floating-button__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>
        </span>
      </button>
      <button class="blog-floating-button" type="button" data-ask-ai aria-label="Copy Ask AI prompt">
        <span data-label>Ask AI</span>
        <span class="blog-floating-button__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>
        </span>
      </button>
    </div>

    <section class="final-cta-footer blog-footer-wrap" id="booking" aria-labelledby="final-cta-footer-heading" data-nav-theme="dark">
      <div class="final-cta-footer__panel">
        <div class="final-cta-footer__art" aria-hidden="true">
          <img class="final-cta-footer__art-image" src="/public/assets/hero/hero-cloudspace-garden-draft.webp" alt="Cloud garden artwork for Sell In Public" width="1672" height="941" loading="lazy" />
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
    </section>

    <script src="/script.js?v=nav-theme-2"></script>
    <script src="/blog/blog.js?v=foundation-5"></script>
  </body>
</html>
`;
}

export function renderPost(packet, { dryRun = false } = {}) {
  const html = renderPostHtml(packet);
  const slug = assertSafeSlug(packet.brief.slug);
  const outputPath = safeOutputPath(packet.root, "blog", slug, "index.html");
  const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (!dryRun) {
    writeTextAtomic(outputPath, html);
  }
  return { path: outputPath, bytes: Buffer.byteLength(html), dryRun, changed: previous !== html };
}
