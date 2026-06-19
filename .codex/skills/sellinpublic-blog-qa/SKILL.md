---
name: sellinpublic-blog-qa
description: QA Sell In Public SEO/AEO blog work before publication. Use when reviewing content packets, article drafts, claim ledgers, citations, publish metadata, QA reports, or static blog HTML for source quality, claim support, genericness, editorial value, SEO/AEO structure, CMS foundation compliance, and publish readiness.
---

# Sell In Public Blog QA

Use this skill to decide whether a Sell In Public blog packet or post is ready to draft, implement, publish, or refresh.

## Source Material

Read only the files needed for the artifact under review:

- `docs/seo-aeo/source-and-qa-policy.md` for evidence grading, claim audit, genericness, and publish readiness.
- `docs/seo-aeo/content-packet.md` for packet artifacts and handoff gates.
- `docs/seo-aeo/blog-foundation.md` for static post structure and foundation checks.
- `docs/seo-aeo/templates/qa-report.md` when creating or updating a QA report.
- The target `content-packets/<date>-<slug>/` files or `blog/<slug>/index.html`.

Use `$sellinpublic-seo-blog` before drafting, editing, or judging article copy voice.

## QA Workflow

1. Identify whether the target is a content packet, draft, published HTML post, or refresh.
2. Check packet completeness before reviewing prose. Missing required packet artifacts are blockers unless the user explicitly asked for a partial review.
3. Audit material claims against `claims-ledger.csv`, `citations.json`, source URLs, source dates, and evidence grades.
4. Reject unsupported statistics, causal claims, rankings, broad best-practice claims, invented examples, fake quotes, placeholder citations, and banned evidence.
5. Check genericness. Require a specific buyer, workflow, channel, decision, example, source-backed distinction, or operating mechanism.
6. Check AEO and SEO structure: direct answer near the top, clear H1, useful H2/H3s, definitions, internal links, metadata, canonical, schema, source links, and non-padding FAQ.
7. For HTML posts, verify the blog foundation contract: shared shell, post-specific hero, rails, TOC, author metadata, source section, CTA, sitemap/feed/index updates when publishing, and no one-off layout hacks.
8. Report findings by severity with concrete file paths and line references when possible. Separate blockers from notes.
9. If the same QA issue appears across multiple posts, packets, or review cycles, create a learning-candidate note and hand it to `$sellinpublic-skill-steward`. Do not patch writing or foundation skills directly from QA findings.

## Publish Gate

Do not mark work publish-ready unless all of these pass:

- Source policy followed.
- Every material claim is sourced, qualified, rewritten, or removed.
- Genericness and editorial value audits pass.
- Metadata, schema, canonical, image alt text, internal links, and source links are complete.
- Article body teaches before it converts and keeps commercial CTA language separated.
- The foundation checker passes for static HTML posts:

```sh
node scripts/check-blog-post.mjs blog/<slug>/index.html
```
