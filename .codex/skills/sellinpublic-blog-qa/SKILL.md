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
5. Check source integration. If a source is adjacent rather than directly on-topic, the draft must either cut it or explain its relevance in normal editorial prose. Do not allow public copy that reads like claim-audit reasoning.
6. Check brand neutrality in informational sections. Direct answers, definitions, comparisons, and how-to body copy should not mention Sell In Public, internal operating rules, or service language unless the brand is the topic or the text is the end CTA/author context. The final separated CTA should mention Sell In Public by name and explain the managed LinkedIn content plus outbound offer for the target buyer.
7. Check genericness. Require a specific buyer, workflow, channel, decision, example, source-backed distinction, or operating mechanism.
8. Check AEO and SEO structure: direct answer near the top, clear H1, useful H2/H3s, definitions, internal links, metadata, canonical, schema, source links, and non-padding FAQ.
9. Verify the Claude writing pass was applied before publish. `claude-writing-pass.md` must record `Status: applied`, `Model: claude-sonnet-4-6`, `Applied to draft.md: true`, and `Applied to article.blocks.json: true`, unless QA records an owner-approved exception.
10. For examples posts, reject article bodies that become meta-guidance about making, judging, or quality-testing examples instead of analyzing literal examples. Watch for "Use Examples Without Copying Them," "How to Judge the Examples," "Copyable Example Checklist," repeated "What to borrow:" sections, "Quality test," "quality bar," "What Makes An Example Count," "what makes [anything] example worth studying," Google helpful content guidance, and "if this could have been written by any competitor" unless the user explicitly requested that format.
11. Reject FAQ sections with blank, whitespace-only, duplicate, placeholder, or visually empty question rows. Compare `article.blocks.json`, JSON-LD, and rendered HTML when reviewing FAQ output. If Sources follows FAQ, verify the gap and divider do not look like a phantom final FAQ item.
12. For HTML posts, verify the blog foundation contract: shared shell, post-specific hero, rails, TOC, author metadata, source section, CTA, sitemap/feed/index updates when publishing, and no one-off layout hacks.
13. Report findings by severity with concrete file paths and line references when possible. Separate blockers from notes.
14. If the same QA issue appears across multiple posts, packets, or review cycles, create a learning-candidate note and hand it to `$sellinpublic-skill-steward`. Do not patch writing or foundation skills directly from QA findings.

## Publish Gate

Do not mark work publish-ready unless all of these pass:

- Source policy followed.
- Every material claim is sourced, qualified, rewritten, or removed.
- Genericness and editorial value audits pass.
- Metadata, schema, canonical, image alt text, internal links, and source links are complete.
- Sources are integrated fluidly and no informational answer block exposes internal source reasoning.
- Brand mentions stay out of informational body copy except for author context, brand-subject articles, or the end CTA.
- Article body teaches before it converts and keeps commercial CTA language separated.
- The end CTA names Sell In Public and says what the company does: turns team expertise into LinkedIn content, buyer signals or inbound leads, and outbound to the right ICP without the client managing the process.
- Claude writing pass is applied to `draft.md` and `article.blocks.json`, not only saved as a sidecar, unless there is an owner-approved exception.
- The foundation checker passes for static HTML posts:

```sh
node scripts/check-blog-post.mjs blog/<slug>/index.html
```
