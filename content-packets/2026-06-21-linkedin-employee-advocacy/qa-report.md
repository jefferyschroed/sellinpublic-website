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

- Passed with notes. Informational body copy keeps Sell In Public out of the answer and uses a separated final CTA.
- Claude writing pass is required before publish and must record applied status in `claude-writing-pass.md`.
- Clean-context public-reader QA is required after static HTML renders.

## Foundation QA

- Pending render. `article.blocks.json` follows the current block schema and points to a post-local hero asset under `public/assets/blog/linkedin-employee-advocacy/`.

## Final Decision

Approved with notes for model gates, static render, structural checker, public-reader QA, and scoped hygiene checks.
