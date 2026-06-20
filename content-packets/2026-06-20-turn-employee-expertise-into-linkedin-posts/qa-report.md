# QA Report

Packet: `2026-06-20-turn-employee-expertise-into-linkedin-posts`

Article: How To Turn Employee Expertise Into Useful LinkedIn Posts

Reviewer: Sell In Public editorial

Date: 2026-06-20

Decision: `approved_with_notes`

## Summary

The packet, draft, article blocks, post-local hero, and rendered static HTML were prepared inside the assigned child scope. The article answers the workflow query, separates employee-generated content from ghostwritten advocacy, and avoids invented metrics or customer examples.

The packet is approved within the child scope. The required Claude writing pass was applied, the model-backed public-reader QA passed, and the static post passed the blog foundation checker.

## Blockers

- None inside the child-owned packet, post, and asset paths.
- Parent integration is still required for shared publication files because this child assignment forbids edits to `blog/index.html`, `sitemap.xml`, `feed.xml`, shared scripts, shared CSS, and `docs/seo-aeo/topic-coverage.csv`.

## Source And Claim Checks

- Source policy followed: yes, within draft scope.
- Discovery inputs used as evidence: no.
- Unsupported numeric stats: none.
- Public LinkedIn posts: used as example artifacts only, not proof of broad performance.
- Oktopost guide: used only for advocacy mechanics and context.
- Claims ledger complete for surfaced factual, example, definition, and operating-POV claims.

## AEO Checks

- Direct answer near top: yes.
- Primary query addressed: yes.
- Practical capture-to-post workflow: yes.
- Employee-generated content vs ghostwritten advocacy distinction: yes.
- FAQ: yes, with non-empty, non-duplicative questions.
- Internal links: hub, comparison post, and blog index.
- Source list: yes.

## Foundation And Asset Checks

- Shared blog foundation used: yes, generated through `scripts/blog/render-post.mjs`.
- Post-specific hero asset: yes.
- Hero source type: generated PNG.
- Hero dimensions: `1897x829`.
- Hero aspect ratio: 2.29:1, within the foundation range.
- Image distortion risk: low; width and height are declared and match the source file.

## Voice Checks

- No em dashes in packet draft/article public copy.
- No banned AI-ism phrases intentionally used in public article copy.
- Commercial CTA kept separated from the educational body.
- Body copy does not describe Sell In Public service mechanics except in the final CTA.

## Public-Reader QA

- Required model command: passed.
- Offline deterministic scan: passed after one wording fix.
- Report path: `content-packets/2026-06-20-turn-employee-expertise-into-linkedin-posts/public-reader-report.json`.
- Publish gate eligibility: true.

## Parent Integration Note

The parent should integrate the post into `blog/index.html`, `sitemap.xml`, `feed.xml`, and any batch-level topic coverage or publish artifacts.
