# QA Report

Packet: `2026-06-21-scale-employee-generated-content-linkedin`
Slug: `scale-employee-generated-content-linkedin`

Decision: `approved_with_notes`

## Summary

The packet is scoped to one practical article about scaling employee-generated content on LinkedIn. The draft answers the assigned prompt near the top, separates employee-generated content from employee advocacy, and gives a weekly workflow with roles, inputs, outputs, and measurement.

## Blockers

- None at packet-writing time. Final publish readiness still requires the generated PNG asset, applied Claude writing pass, static render, clean-context public-reader pass, publish-stage validation, structural checker, scoped hygiene, and commit.

## Evidence Review

- Passed for the draft stage. Platform and disclosure facts use official LinkedIn Help, LinkedIn Marketing guidance, LinkedIn policy, FTC guidance, and Edelman-LinkedIn research.
- Ahrefs demand language is recorded as discovery-only and is not used as factual support.
- No Reddit, forums, generic listicles, scraped-stat pages, or AI answers are used as factual evidence.

## Claim Review

- Passed for the draft stage. Material facts are mapped in `claims-ledger.csv`.
- Operating recommendations are framed as Sell In Public judgment or supported by the cited platform guidance.
- No unsupported performance promise, ranking, or invented customer result is included.

## SEO And AEO Review

- Passed for the draft stage. H1 and answer block match the target query language.
- Internal links are included for infrastructure, advocacy comparison, expertise-to-post workflow, measurement, and LinkedIn advocacy.
- FAQ questions are non-empty, non-duplicate, and reader-facing.

## Brand And Voice Review

- Passed for the draft stage. Informational body copy keeps Sell In Public out of the teaching sections and uses a separated final CTA.
- The closing CTA names Sell In Public and has exactly two body sentences.
- Draft and block copy have been manually checked for banned words, banned phrases, em dashes, and binary correction-pair cadence before model gates.

## Foundation Review

- Pending final gates. Static HTML must be rendered from `article.blocks.json`.
- Hero asset must be saved under `public/assets/blog/scale-employee-generated-content-linkedin/hero-generated.png` with honest dimensions.

## Final Decision

Approved with notes pending the required model, render, asset, and validation gates.
