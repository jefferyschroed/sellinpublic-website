# QA Report

Packet: `content-packets/2026-06-22-clay-lovable-gitlab-public-content-loops/`

Reviewer: Sell In Public editorial

Date: 2026-06-22

Decision: `approved`

## Summary

The packet is source-backed and scoped to a deeper analysis of public content loops behind Clay, Lovable, and GitLab. It does not duplicate the existing employee-generated content examples page and uses that article only for cluster context. The Claude writing pass, clean-context public-reader QA, packet validation, post checker, and diff hygiene passed.

## Blockers

- None.

## Source And Claim Checks

- Source policy followed: Yes. Sources are first-party public pages, official docs, public handbooks, and internal cluster links.
- Claims ledger complete: Yes.
- Unsupported claims: None intentionally included.
- Weak sources: Internal Sell In Public links are used only for cluster context and operating-model links.
- Named examples, research, or case studies used: Claybooks, Clay systems post, Lovable Launched, Lovable docs, Lovable incident post, GitLab TeamOps, GitLab handbook development, and GitLab communication guidance.
- Source limitations: Direct public LinkedIn examples were not used. No social metrics, performance claims, or quotes were invented.

## AEO Checks

- Direct answer near top: Yes.
- Question-led headings: Mostly statement-led, with direct extraction in short answer and FAQ.
- Clear definitions: Yes, public content loop is defined in the short answer and FAQ.
- Evidence blocks: Yes, source-backed sections and a comparison table.
- FAQ candidates: Included and non-duplicative.

## SEO Checks

- Title fields 60 characters or fewer, 45-58 target checked: Yes.
- Meta description 110-155 characters, 130-150 target checked: Yes.
- OG/Twitter descriptions 155 characters or fewer: Yes.
- Metadata promise matches article and supported claims: Yes.
- H1/H2 structure: Yes.
- Internal links: Examples page, employee-generated content infrastructure, and LinkedIn content infrastructure included.
- Canonical: Complete in publish metadata.
- Schema: Expected from renderer.

## Foundation And CMS Checks

- Shared blog CSS and JS used: Expected from renderer.
- Stable blog shell preserved: Expected from renderer.
- Desktop side rails start beside the intro/hero: Expected from renderer.
- Desktop side rails remain sticky on scroll: No shared CSS changes made.
- H1 uses editorial article scale, not landing-page hero scale: No shared CSS changes made.
- Post-local generated hero original PNG exists: Yes.
- Hero WebP exists and is the publishable source: Yes.
- Hero source fields agree across article.blocks, asset manifest, publish-meta, rendered HTML, and blog index: Article blocks, asset manifest, and publish metadata currently agree. Shared blog index is out of scope for this child.
- Hero alt fields agree and describe the visible image: Yes.
- No rendered blog image has missing alt text or `alt=""`: Yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: Yes, 1896x830 is about 2.28:1.
- Hero dimensions match source file: Yes.
- Inline media preserves original aspect ratio: No inline media planned.
- Author is Jeffery Schroeder and links to LinkedIn: Expected from renderer.
- Copy block uses icon-only clipboard/check button: No copy block used.
- Floating Copy Page and Ask AI states work: No shared JS changes made.
- CTA links are not underlined: Expected from shared CSS.
- `node scripts/check-blog-post.mjs blog/clay-lovable-gitlab-public-content-loops/index.html` passed: Yes.

## Brand And Voice Checks

- Clear editorial POV: Yes.
- Specific buyer: Yes, B2B revenue leaders and founders.
- Reader value: The article explains concrete public loop mechanics rather than generic content advice.
- Feature-heavy language in article body: No.
- Commercial CTA separated from article guidance: Yes.
- End CTA names Sell In Public and explains the managed LinkedIn content plus outbound offer: Yes.
- Genericness issues: None found in editorial review.

## Required Fixes

- None.

## Final Notes

The hard boundary for this child forbids updates to shared aggregate files such as `blog/index.html`, `sitemap.xml`, and `feed.xml`. The public-reader report at `public-reader-report.json` passed with zero findings after two source-level rewrites to remove public-link instruction phrasing.
