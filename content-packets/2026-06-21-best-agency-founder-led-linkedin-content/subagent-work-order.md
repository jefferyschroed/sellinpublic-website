# Subagent Work Order

Packet: `content-packets/2026-06-21-best-agency-founder-led-linkedin-content/`

Slug: `best-agency-founder-led-linkedin-content`

## Rule

Work on this post only. Do not edit shared aggregate files, other posts, shared CSS, shared JS, or renderer scripts.

## Narrow Work Areas

- Research support: verify official LinkedIn guidance, primary research, and official provider pages.
- Draft support: write a fit-based buying guide that answers the agency-selection question without publishing a ranked list.
- QA support: audit source strength, unsupported claims, banned phrases, CTA sentence count, FAQ completeness, and public-reader risks.
- Asset support: after the draft or article blocks exist, create one post-local PNG hero and record the final prompt.

## Stop Conditions

- Stop if a required model gate cannot run because the local Anthropic key is missing or invalid.
- Stop if public-reader QA flags public copy and source artifacts have not been rewritten.
- Stop if a requested edit would touch shared aggregate files owned by the parent thread.

## Required Final Checks

- Claude writing pass applied to `draft.md` and `article.blocks.json`.
- Static HTML generated for only this slug if possible.
- Public-reader QA passed with zero findings.
- `node scripts/blog-orchestrator.mjs validate --stage publish content-packets/2026-06-21-best-agency-founder-led-linkedin-content`
- `node scripts/check-blog-post.mjs blog/best-agency-founder-led-linkedin-content/index.html`
- Scoped hygiene checks on owned paths.
