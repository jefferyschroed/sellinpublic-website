---
name: sellinpublic-blog-foundation
description: Maintain and verify the Sell In Public static blog foundation. Use when implementing, updating, or QAing static blog posts, `blog/blog.css`, `blog/blog.js`, blog index links, post assets, article shell markup, TOC behavior, copy interactions, sitemap/feed entries, or foundation-level responsive layout for sellinpublic.co blog pages.
---

# Sell In Public Blog Foundation

Use this skill to preserve the shared static blog shell while implementing or validating individual posts.

## Source Material

Read the relevant repo docs before editing:

- `docs/seo-aeo/blog-foundation.md` for the foundation contract, required post structure, article blocks, media rules, interactions, and publishing checklist.
- `docs/seo-aeo/content-packet.md` when deciding whether publish implementation may start.
- `docs/seo-aeo/source-and-qa-policy.md` when touching claims, sources, QA status, or publish readiness.

Use `$sellinpublic-seo-blog` before drafting, editing, or reviewing article copy.

## Implementation Workflow

1. Confirm the target slug, content packet, and publication status. Do not create a publishable post unless the packet has passed QA, unless the user explicitly asks for a draft or prototype.
2. Use an existing post such as `blog/employee-generated-content-infrastructure/index.html` as the structural reference.
3. Keep the full article body in static HTML. Do not make article content depend on JavaScript rendering.
4. Preserve the shared shell: intro, metadata, hero, mobile TOC, left rail, center article, right TOC, CTA, floating actions, and shared footer.
5. Put global visual changes in `blog/blog.css` and global interactions in `blog/blog.js`. Avoid per-post inline styles and one-off scripts.
6. Use standard blocks from the foundation docs: `.blog-answer`, `.blog-callout`, `.blog-media`, `.blog-table-wrap`, `.copy-block`, `.blog-faq`, and `.blog-cta`.
7. Store post assets under `public/assets/blog/<slug>/`. Use a post-specific landscape hero, honest `width` and `height` attributes, useful alt text, and natural image aspect ratios.
8. When publishing, update `blog/index.html`, recent-post rail links as needed, `sitemap.xml`, and `feed.xml`.
9. Preserve unrelated work. Keep edits scoped to the requested post or foundation files.
10. If a repeated foundation miss appears across multiple posts, packets, or browser QA cycles, capture a learning-candidate note and hand it to `$sellinpublic-skill-steward`. Do not promote skill changes without the steward gates and human approval.

## Validation

Always run the structural checker for changed posts:

```sh
node scripts/check-blog-post.mjs blog/<slug>/index.html
```

When layout, CSS, JavaScript, or interaction behavior changes, also run local browser QA on desktop and mobile. Verify the first screen, side rails, mobile TOC, copy-block buttons, floating Copy Page and Ask AI actions, FAQ transitions, source links, and responsive media.
