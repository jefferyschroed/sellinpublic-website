# QA Report

Packet: `2026-06-17-employee-generated-content-infrastructure`

Article: What Is Employee-Generated Content?

Reviewer: Sell In Public editorial

Date: 2026-06-17

Decision: `approved_with_notes`

## Summary

The article answers the definition query near the top, distinguishes employee-generated content from employee advocacy, and uses the existing source set for the statistical and example-based claims. The packet migration added stable source IDs, claim IDs, a formal draft, article blocks, and post-publish tracking placeholders without changing the live article.

## Blockers

- None.

## Source And Claim Checks

- Source policy followed: yes. External evidence comes from industry research, company primary sources, and public company documentation.
- Claims ledger complete: yes for the statistical, example-based, definitional, and editorial claims surfaced in the current article.
- Unsupported claims: none identified in the migrated draft.
- Weak sources: Clay and Lovable are company self-reports, so their claims are used as named examples, not independent proof.
- Named examples, research, or case studies used: Sprout Social, LinkedIn and Edelman, DSMN8, Clay, Lovable, and GitLab.

## AEO Checks

- Direct answer near top: yes.
- Question-led headings: yes, through definition, examples, measurement, checklist, and FAQ sections.
- Clear definitions: yes.
- Evidence blocks: yes, with source markers in `draft.md` and stable IDs in `citations.json`.
- FAQ candidates: included.

## SEO Checks

- Title: complete and consistent with `publish-meta.yaml`.
- Meta description: complete and under normal SERP length limits.
- H1/H2 structure: complete in `outline.md`, `draft.md`, and the existing article.
- Internal links: home and blog index are recorded.
- Canonical: `https://sellinpublic.co/blog/employee-generated-content-infrastructure/`.
- Schema: `BlogPosting`, `BreadcrumbList`, and `FAQPage` are present in the existing article.

## Foundation And CMS Checks

- Shared blog CSS and JS used: yes.
- Stable blog shell preserved: yes.
- Desktop side rails start beside the intro/hero: yes, per prior QA.
- Desktop side rails remain sticky on scroll: yes, per prior QA.
- H1 uses editorial article scale, not landing-page hero scale: yes, per prior QA.
- Post-local generated hero: yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: yes, `1600x700`.
- Hero dimensions match source file: yes.
- Inline media preserves original aspect ratio: yes, `1100x620`.
- Author is Jeffery Schroeder and links to LinkedIn: yes.
- Copy block uses icon-only clipboard/check button: yes.
- Floating Copy Page and Ask AI states work: yes, per prior QA.
- CTA links are not underlined: yes, per prior QA.
- `node scripts/check-blog-post.mjs blog/employee-generated-content-infrastructure/index.html` passed: yes, per prior QA.

## Brand And Voice Checks

- Clear editorial POV: yes.
- Specific buyer: yes, B2B founders, GTM leaders, marketing leaders, sales leaders, and content operators.
- Reader value: yes, definition, examples, measurement, and checklist.
- Feature-heavy language in article body: no.
- Commercial CTA separated from article guidance: yes.
- Genericness issues: none identified in the migrated packet.

## Required Fixes

- None.

## Final Notes

Prior browser QA screenshots remain recorded in the original report context:

- `/Users/jeff/Documents/sellinpublic-website/research/screenshots/blog-foundation-qa/01-article-desktop-top.png`
- `/Users/jeff/Documents/sellinpublic-website/research/screenshots/blog-foundation-qa/02-article-desktop-mid.png`
- `/Users/jeff/Documents/sellinpublic-website/research/screenshots/blog-foundation-qa/03-article-mobile-top.png`
- `/Users/jeff/Documents/sellinpublic-website/research/screenshots/blog-foundation-qa/05-floating-ask-ai-clicked.png`
- `/Users/jeff/Documents/sellinpublic-website/research/screenshots/blog-foundation-qa/06-blog-index-desktop.png`
