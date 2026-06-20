# QA Report

Packet: `2026-06-20-founder-content-vs-employee-content`

Article: Founder Content Vs Employee Content

Reviewer: Sell In Public editorial

Date: 2026-06-20

Decision: `approved_with_notes`

## Summary

The source gap that previously blocked this topic is resolved. The packet now has direct public examples for founder-led content and employee-generated content, current LinkedIn platform documentation, and a primary Edelman-LinkedIn report for buyer-context claims.

The packet is publish-ready from this child thread after the owner provided the local Anthropic key, the Claude writing pass applied to both public copy artifacts, the rendered post passed model-based public-reader QA, and the structural checker passed.

## Blockers

- None.

## Source And Claim Checks

- Source policy followed: yes for the draft packet.
- Discovery inputs used as evidence: no.
- Claims ledger complete: yes for surfaced factual, platform-status, example, and operating-POV claims.
- Unsupported numeric stats: none identified. The ClickUp follower count is attributed to Chris Cunningham's public post and is not used as proof that the model works broadly.
- Weak sources: Oktopost is included only as context in `citations.json`; it is not used for material public claims in `draft.md` or `article.blocks.json`.
- Named examples used: Dave Gerhardt founder-led post, Chris Cunningham ClickUp employee creator post, and Heike Young Microsoft EGC program post.

## AEO Checks

- Direct answer near top: yes.
- Primary query addressed: yes, `founder content vs employee content`.
- Comparison table: yes.
- Decision guidance: yes.
- FAQ: yes, four complete questions.
- Clear definitions: yes.
- Source list: yes.
- Internal links: yes, EGC hub, EGC vs advocacy post, and blog index in metadata.

## SEO Checks

- Title: complete.
- Meta description: complete and concise.
- Canonical: `https://sellinpublic.co/blog/founder-content-vs-employee-content/`.
- Schema readiness: `BlogPosting`, `BreadcrumbList`, and `FAQPage` are supported by renderer inputs.
- Author: Jeffery Schroeder with LinkedIn URL in generator.
- Topic map blocks included in `brief.yaml`, `publish-meta.yaml`, and `article.blocks.json`.

## Foundation And CMS Checks

- Shared blog CSS and JS used: intended through renderer.
- Stable blog shell preserved: intended through renderer.
- Desktop side rails start beside the intro/hero: not browser-verified.
- Desktop side rails remain sticky on scroll: not browser-verified.
- H1 uses editorial article scale, not landing-page hero scale: inherited from foundation renderer.
- Post-local generated hero: yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: yes, 1897x829 is about 2.29:1.
- Hero dimensions match source file: yes, verified with `sips`.
- Inline media preserves original aspect ratio: no inline media beyond hero.
- Author is Jeffery Schroeder and links to LinkedIn: inherited from generator.
- Copy block uses icon-only clipboard/check button: no copy block used.
- Floating Copy Page and Ask AI states work: not browser-verified.
- CTA links are not underlined: inherited from foundation CSS.
- `node scripts/check-blog-post.mjs blog/founder-content-vs-employee-content/index.html` passed: yes.

## Brand And Voice Checks

- Clear editorial POV: yes.
- Specific buyer: yes, B2B founders, revenue leaders, sales leaders, and marketing leaders.
- Reader value: yes, comparison table and operating model.
- Feature-heavy language in article body: no.
- Commercial CTA separated from article guidance: yes.
- Genericness issues: none identified in packet review.

## Fixes Applied After QA

- Applied the Claude writing pass to `draft.md` and `article.blocks.json`.
- Rerendered `blog/founder-content-vs-employee-content/index.html` from the packet source.
- Replaced the offline public-reader report with a model-based report that passed with zero findings.
- Confirmed the structural checker passes for the rendered HTML.
- Confirmed whitespace checks pass on owned files.

## Final Notes

The article is approved with notes because this child was not allowed to update `blog/index.html`, `sitemap.xml`, `feed.xml`, or shared recent-post rails. Parent integration should decide whether and where to add those global publish surfaces.
