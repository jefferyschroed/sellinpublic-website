# QA Report

Packet: `content-packets/2026-06-20-measure-employee-generated-content-beyond-impressions/`

Reviewer: Sell In Public editorial

Date: 2026-06-20

Decision: `approved_with_notes`

## Summary

The packet and rendered post are source-backed, locally structurally valid, and approved with notes. The required Claude writing pass and clean-context public-reader QA both passed after the Anthropic key was provided for transient local use.

## Blockers

- None. Required automated gates passed after rerun.

## Source And Claim Checks

- Source policy followed: Yes.
- Claims ledger complete: Yes.
- Unsupported claims: None found.
- Weak sources: LinkedIn's older employee advocacy guide and measurement blog are used only as first-party category precedent, not current product mechanics or performance proof.
- Named examples, research, or case studies used: No customer examples or case studies are used. The article intentionally avoids invented results.

## AEO Checks

- Direct answer near top: Yes.
- Question-led headings: Yes, framed around measurement decisions.
- Clear definitions: Yes, the article separates reach, buyer proof, pipeline influence, sales reuse, and search visibility.
- Evidence blocks: Yes, tables and copy block support extraction.
- FAQ candidates: Included and non-duplicative.

## SEO Checks

- Title: Complete.
- Meta description: Complete.
- H1/H2 structure: Complete.
- Internal links: Hub, comparison post, and blog index included.
- Canonical: Complete in publish metadata.
- Schema: BlogPosting, BreadcrumbList, and FAQPage expected from renderer.

## Foundation And CMS Checks

- Shared blog CSS and JS used: Expected from renderer.
- Stable blog shell preserved: Expected from renderer.
- Desktop side rails start beside the intro/hero: Expected from renderer.
- Desktop side rails remain sticky on scroll: No shared CSS changes made.
- H1 uses editorial article scale, not landing-page hero scale: No shared CSS changes made.
- Post-local generated hero: Yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: Yes, 1897x829 is about 2.29:1.
- Hero dimensions match source file: Yes.
- Inline media preserves original aspect ratio: No inline media beyond hero.
- Author is Jeffery Schroeder and links to LinkedIn: Expected from renderer.
- Copy block uses icon-only clipboard/check button: Expected from renderer.
- Floating Copy Page and Ask AI states work: No shared JS changes made.
- CTA links are not underlined: Expected from shared CSS.
- `node scripts/check-blog-post.mjs blog/measure-employee-generated-content-beyond-impressions/index.html` passed: Yes.

## Brand And Voice Checks

- Clear editorial POV: Yes.
- Specific buyer: Yes, mid-market B2B revenue and marketing leaders.
- Reader value: Practical measurement board and attribution boundaries.
- Feature-heavy language in article body: No.
- Commercial CTA separated from article guidance: Yes.
- Genericness issues: None found.

## Required Fixes

- None.

## Final Notes

Vendor starting leads were reviewed and excluded from factual evidence where stronger primary sources were available. The article does not invent metrics, benchmarks, quotes, customer examples, or attribution claims.
