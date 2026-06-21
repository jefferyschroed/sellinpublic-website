# QA Report

Packet: `2026-06-21-linkedin-employee-advocacy`
Slug: `linkedin-employee-advocacy`

Decision: `approved_with_notes`

## Summary

The packet is scoped to one LinkedIn employee advocacy article and keeps the public copy focused on definition, B2B revenue-team operation, measurement, and the employee advocacy versus employee-generated content distinction.

## Blockers

- None at packet QA time.

## Source QA

- Passed. Factual claims use official LinkedIn guidance, official LinkedIn Help documentation, LinkedIn/Edelman research summary, and internal Sell In Public posts only for internal category context.
- Ahrefs demand inputs are recorded as discovery-only and are not cited as factual evidence.
- No public examples are used as proof or case studies. The post uses operating scenarios because the assignment is definition/how-to, not an examples article.

## Claim QA

- Passed. All material factual claims in `draft.md` are mapped to `claims-ledger.csv`.
- No unsupported performance promises, rankings, or invented customer results are included.

## SEO And AEO QA

- Passed. The article answers the AEO question near the top and includes definition, launch, differentiation, measurement, and FAQ sections.
- Internal links point to the EGC hub, EGC comparison page, and LinkedIn content infrastructure page.

## Brand And Voice QA

- Passed. Informational body copy keeps Sell In Public out of the answer and uses a separated final CTA.
- Claude writing pass is applied in `claude-writing-pass.md`: `Status: applied`, `Model: claude-sonnet-4-6`, `Applied to draft.md: true`, and `Applied to article.blocks.json: true`.
- Clean-context model public-reader QA passed in `public-reader-report.json` with zero findings and zero rewrites.

## Foundation QA

- Passed. Static HTML rendered to `blog/linkedin-employee-advocacy/index.html` from `article.blocks.json`.
- Publish-stage packet validation passed for `content-packets/2026-06-21-linkedin-employee-advocacy/`.
- `node scripts/check-blog-post.mjs blog/linkedin-employee-advocacy/index.html` passed.
- Hero asset `public/assets/blog/linkedin-employee-advocacy/hero-generated.png` is a post-local PNG with final dimensions `1600x700`.
- Scoped hygiene passed on owned paths.

## Final Decision

Approved with notes. Required model gates, static render, structural checker, publish-stage packet validation, hero dimension check, and scoped hygiene checks have passed.
