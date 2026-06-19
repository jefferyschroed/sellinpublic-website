# QA Report

Packet: `2026-06-19-employee-generated-content-vs-employee-advocacy`

Article: Employee-Generated Content vs Employee Advocacy

Reviewer: Sell In Public editorial

Date: 2026-06-19

Decision: `approved_with_notes`

## Summary

The article answers the comparison query near the top, defines both models, includes a comparison table, gives a decision framework, covers LinkedIn/founder-led/team-led context, and separates the explanatory article body from the CTA.

The packet used narrow subagent review before approval:

- Source QA checked factual claims, source IDs, discovery-source exclusions, vendor-source limits, and unsupported performance claims.
- Voice QA checked the `$sellinpublic-seo-blog` style rules, salesy language, AI-sounding phrasing, intro strength, and CTA placement.
- AEO/SEO QA checked answer-first structure, primary keyword fit, metadata, FAQ usefulness, internal links, image dimensions, and renderer compatibility.

## Blockers

- None.

## Fixes Applied After QA

- Rewrote the intro so the article opens with the real operating tension before the definitions.
- Removed unsupported hybrid-superiority language and reframed hybrid use as a fit for assets that need both reach and role-specific context.
- Added the missing `/blog/` internal link in rendered article blocks.
- Aligned the brief and publish metadata CTA anchor to `#copyable-decision-checklist`.
- Shortened the meta description to a safer SERP length.
- Added `src-010` for internal SME guidance so operating POV claims are not over-attributed to LinkedIn Help or external research.
- Marked measurement guidance as Sell In Public POV supported by SME notes and adjacent source context.
- Renamed label-like headings to stronger skim headings.
- Added the end CTA to `draft.md` so the markdown draft and rendered article blocks stay consistent.
- Removed formulaic "not only" phrasing found in the final scan.

## Source And Claim Checks

- Source policy followed: yes.
- Discovery inputs used as evidence: no.
- Unsupported numeric stats: none identified.
- Claims ledger complete: yes for surfaced factual, statistical, platform-status, and operating-POV claims.
- Weak-source handling: DSMN8 and Sprout are used carefully for category/program language, not independent performance proof.
- Research caveat preserved: the article does not claim employee-generated content outperforms employee advocacy for B2B pipeline.

## AEO Checks

- Direct answer near top: yes.
- Primary query addressed: yes, `employee-generated content vs employee advocacy`.
- Comparison table: yes.
- Decision guide: yes.
- FAQ: yes.
- Clear definitions: yes.
- Source list: yes.
- Internal links: yes, hub and blog index.

## SEO Checks

- Title: complete.
- Meta description: complete and concise.
- Canonical: `https://sellinpublic.co/blog/employee-generated-content-vs-employee-advocacy/`.
- Schema readiness: `BlogPosting`, `BreadcrumbList`, and `FAQPage` are supported by renderer inputs.
- Author: Jeffery Schroeder with LinkedIn URL.
- Topic map blocks included in `brief.yaml`, `publish-meta.yaml`, and `article.blocks.json`.

## Foundation And Asset Checks

- Shared blog foundation used: yes.
- Post-specific hero asset: yes.
- Hero dimensions: `1600x700`.
- Hero aspect ratio: 16:7, within foundation range.
- Image distortion risk: low; width and height are declared and source file matches the manifest.
- Public asset path follows the existing foundation convention: `/public/assets/blog/...`.

## Browser QA

- Local URL checked: `http://127.0.0.1:4173/blog/employee-generated-content-vs-employee-advocacy/`.
- Desktop check: title, hero, sticky side rails, sticky table of contents, FAQ, and sources rendered correctly.
- Desktop hero render: visible image `770x337`, source `1600x700`, complete.
- Mobile viewport checked: `390x844`.
- Mobile check: no horizontal overflow, hero rendered at `354x155`, side rails hidden, mobile TOC visible, FAQ count `6`.
- Lazy footer images were below the fold during the desktop snapshot, so they were not loaded in that initial viewport. Article hero and blog-local assets loaded correctly.

## Voice Checks

- Sales pitch language: no.
- Feature-heavy body copy: no.
- Literal anti-sales overcorrection: no.
- Commercial CTA separated from article guidance: yes.
- Banned words or phrases from the blog-writing skill: no actionable hits in article copy. The only remaining `elevate` text appears inside a LinkedIn PDF URL.

## Remaining Notes

- `src-010` is an internal SME source and is not listed in the public source block.
- The built-in image generation tool was attempted first, but no generated filesystem artifact surfaced under `$CODEX_HOME/generated_images`; the committed hero PNG was created from a repo-local SVG source and logged in `asset-manifest.json`.
