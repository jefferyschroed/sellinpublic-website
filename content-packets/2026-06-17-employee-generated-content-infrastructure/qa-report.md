# QA Report

Packet: `2026-06-17-employee-generated-content-infrastructure`

Article: What Is Employee-Generated Content?

Reviewer: Sell In Public editorial

Date: 2026-06-19

Decision: `approved_with_notes`

## Summary

The refreshed article answers the definition query near the top, distinguishes employee-generated content from employee advocacy, uses source-backed examples from Clay, Lovable, GitLab, and Shopify, and keeps the informational body focused on reader value rather than service language.

Owner feedback from the first reviewed post was applied to the packet and QA rules:

- Adjacent sources must be integrated in normal editorial prose instead of exposing claim-audit reasoning.
- Direct answers and educational body sections should not reference internal operating rules or make the article feel self-referential.
- Brand and conversion language remain acceptable in author, footer, and CTA contexts.

## Blockers

- None.

## Source And Claim Checks

- Source policy followed: yes. External evidence comes from industry research, official search guidance, first-party company sources, and public company documentation.
- Discovery-only inputs cited as evidence: no.
- Claims ledger complete: yes for the statistical, example-based, definitional, quality, and editorial claims surfaced in the current article.
- Unsupported claims: none identified in the refreshed draft.
- Weak sources: Clay and Lovable are company self-reports, so their claims are used as named examples, not independent proof of category performance.
- Removed from active claims: DSMN8 employee LinkedIn post sample claim, because it did not add enough value to this definition hub.
- Named examples, research, or case studies used: Sprout Social, LinkedIn and Edelman, Google Search Central, Clay, Lovable, GitLab, and Shopify Engineering.

## AEO Checks

- Direct answer near top: yes.
- Employee advocacy distinction appears before the first H2: yes.
- Question-led or answerable headings: yes.
- Definitions: clear.
- Evidence blocks: yes, with stable claim IDs in `draft.md` and matching source IDs in `citations.json`.
- FAQ candidates: included and expanded beyond repeated body copy.
- Source section: includes context for how sources are grouped and why they are relevant.

## SEO Checks

- Title: complete and consistent with `publish-meta.yaml`.
- Meta description: complete and under normal SERP length limits.
- H1/H2 structure: complete in `outline.md`, `draft.md`, and `article.blocks.json`.
- Internal links: home, blog index, and the employee advocacy comparison post are recorded.
- Canonical: `https://sellinpublic.co/blog/employee-generated-content-infrastructure/`.
- Schema: `BlogPosting`, `BreadcrumbList`, and `FAQPage` expected after generation.

## Foundation And CMS Checks

- Shared blog CSS and JS used: yes.
- Stable blog shell preserved: yes.
- Desktop side rails start beside the intro/hero: expected from shared renderer.
- Desktop side rails remain sticky on scroll: expected from shared renderer.
- H1 uses editorial article scale, not landing-page hero scale: expected from shared renderer.
- Post-local generated hero: yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: yes, `1600x700`.
- Inline media preserves original aspect ratio: yes, `1100x620`.
- Author is Jeffery Schroeder and links to LinkedIn: expected from shared renderer and metadata.
- Copy block uses icon-only clipboard/check button: expected from shared renderer.
- Floating Copy Page and Ask AI states work: expected from shared renderer.
- CTA links are not underlined: expected from shared renderer.

## Brand And Voice Checks

- Clear editorial POV: yes.
- Specific buyer: yes, B2B founders, GTM leaders, marketing leaders, sales leaders, and content operators.
- Reader value: yes, definition, examples, workflow, measurement, and checklist.
- Feature-heavy language in article body: no.
- Internal operating rules in informational body copy: no.
- Commercial CTA separated from article guidance: yes.
- Genericness issues: none identified in the refreshed packet.

## Required Fixes

- None before generation.

## Final Notes

Run packet validation, generator dry-run, governed generation, static checks, and browser QA before committing the refreshed output.
