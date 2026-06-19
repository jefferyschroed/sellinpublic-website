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
2. Work one post at a time. Do not start the next post's packet, draft, generation, or publishing work until the current post has passed QA, generated cleanly, passed validation, and been committed and pushed for Netlify deployment.
3. Use an existing post such as `blog/employee-generated-content-infrastructure/index.html` as the structural reference.
4. Keep the full article body in static HTML. Do not make article content depend on JavaScript rendering.
5. Preserve the shared shell: intro, metadata, hero, mobile TOC, left rail, center article, right TOC, CTA, floating actions, and shared footer.
6. Put global visual changes in `blog/blog.css` and global interactions in `blog/blog.js`. Avoid per-post inline styles and one-off scripts.
7. Use standard blocks from the foundation docs: `.blog-answer`, `.blog-callout`, `.blog-media`, `.blog-table-wrap`, `.copy-block`, `.blog-faq`, and `.blog-cta`.
8. Run the Claude audience-copy pass for public article prose using `scripts/seo-aeo/claude-blog-pass.mjs --apply` with `ANTHROPIC_API_KEY` set locally. The pass must write the final public copy into both `draft.md` and `article.blocks.json`; a sidecar output alone is not publish-ready. Do not publish without either an applied pass result or an owner-approved exception recorded in QA.
9. Store post assets under `public/assets/blog/<slug>/`. Use a generated PNG landscape hero from `$sellinpublic-image-style`, honest `width` and `height` attributes, useful alt text, and natural image aspect ratios. Do not ship SVG-drawn stand-ins for blog heroes unless the user explicitly asks for vector output.
10. For examples, case-study, LinkedIn, founder-led, or team-led content posts, use approved tools and browser research to find literal public examples. Prefer first-party pages and public LinkedIn posts from founders, executives, team leads, or practitioners; record the URL, author role, capture method, and source limits in the packet.
11. Keep examples posts focused on public artifacts. Do not publish source-policy or QA rubric language such as "Quality test," "quality bar," "selection criteria," "What Makes An Example Count," "what makes [anything] example worth studying," Google helpful content guidance, or "if this could have been written by any competitor" unless the user explicitly requested an evaluation/checklist article.
12. FAQ blocks must contain only complete reader-facing question/answer pairs. Reject blank, whitespace-only, placeholder, duplicate, or visually empty FAQ rows before rendering and after static HTML generation.
13. When publishing, update `blog/index.html`, recent-post rail links as needed, `sitemap.xml`, and `feed.xml`.
14. Remember the deployment boundary: Netlify deploys `sellinpublic.co` from GitHub, so a local blog publish is not live until the scoped blog diff is committed and pushed to the GitHub remote.
15. Preserve unrelated work. Keep edits scoped to the requested post or foundation files.
16. If a repeated foundation miss appears across multiple posts, packets, or browser QA cycles, capture a learning-candidate note and hand it to `$sellinpublic-skill-steward`. Do not promote skill changes without the steward gates and human approval.

## Validation

Always run the structural checker for changed posts:

```sh
node scripts/check-blog-post.mjs blog/<slug>/index.html
```

When layout, CSS, JavaScript, or interaction behavior changes, also run local browser QA on desktop and mobile. Verify the first screen, side rails, mobile TOC, copy-block buttons, floating Copy Page and Ask AI actions, FAQ transitions, source links, and responsive media.

For publish requests that should be visible on the website, commit and push the scoped blog changes to GitHub after validation so Netlify can auto deploy them.
