# QA Report

Packet: `2026-06-22-source-employee-content-ideas-from-sales-calls`

Article: How To Source Employee Content Ideas From Sales Calls

Reviewer: Sell In Public editorial

Date: 2026-06-22

Decision: `approved_with_notes`

## Summary

The packet, draft, article blocks, and post-local hero were prepared inside the assigned child scope. The article answers the AEO question directly, stays narrower than the broader employee-expertise post, and focuses on sales-call inputs, consent, privacy-safe abstraction, CRM notes, and routing ideas to the employee with standing.

The packet is approved within the child scope. The required Claude writing pass was applied, the model-backed public-reader QA passed, and the rendered static post is ready for structural validation.

## Blockers

- None inside the child-owned packet, post, and asset paths at packet QA time.
- Parent integration is still required for shared publication files because this child assignment forbids edits to `blog/index.html`, `sitemap.xml`, `feed.xml`, shared scripts, shared CSS, and `docs/seo-aeo/topic-coverage.csv`.

## Source And Claim Checks

- Source policy followed: yes.
- Discovery inputs used as factual evidence: no.
- Unsupported numeric statistics: none.
- Customer examples or quotes: none invented or used.
- Legal advice: avoided. The article frames recording and consent as company-policy and counsel-dependent operational boundaries.
- Claims ledger complete for material factual, recommendation, platform, and operating-POV claims.

## AEO Checks

- Direct answer near top: yes.
- Primary query addressed: yes.
- AEO question answered: yes.
- Narrow sales-call workflow: yes.
- Privacy-safe abstraction and permission boundaries: yes.
- CRM notes and call summaries covered: yes.
- Internal link to broader article: yes.
- FAQ: yes, with non-empty, non-duplicative questions.
- Source list: yes.

## Foundation And Asset Checks

- Shared blog foundation target: yes, rendered through `scripts/blog/render-post.mjs`.
- Post-specific hero asset: yes.
- Hero source type: generated PNG with WebP derivative.
- Hero dimensions: `1896x830`.
- Hero aspect ratio: 2.28:1, within the foundation range.
- Hero alt text matches `article.blocks.json`, `publish-meta.yaml`, and `asset-manifest.json`.

## Voice Checks

- No em dashes intentionally used in packet draft or article blocks.
- No banned public-copy phrases intentionally used.
- Commercial CTA is separated from the educational body.
- Body copy does not describe Sell In Public service mechanics except in the final CTA.
- Final CTA names Sell In Public and has exactly two body sentences.

## Public-Reader QA

- Required command: passed.
- Mode: model.
- Findings: 0.
- Rewrites on final run: 0.
- Report path: `content-packets/2026-06-22-source-employee-content-ideas-from-sales-calls/public-reader-report.json`.
- Publish gate eligibility: true.

## Parent Integration Note

The parent should integrate the post into `blog/index.html`, `sitemap.xml`, `feed.xml`, and any batch-level topic coverage or publish artifacts.
