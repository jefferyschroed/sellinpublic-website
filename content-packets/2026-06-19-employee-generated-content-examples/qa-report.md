# QA Report

Packet: `2026-06-19-employee-generated-content-examples`

Article: Employee-Generated Content Examples From B2B Companies

Reviewer: Sell In Public editorial

Date: 2026-06-19

Decision: `approved_with_notes`

## Summary

The refreshed article now behaves like a literal examples page. It links to inspectable public posts and source assets from Clay, Lovable, GitLab, and Shopify Engineering, distinguishes LinkedIn posts from durable source assets, includes a comparison table focused on what each artifact shows, and keeps the commercial CTA separated from the educational body.

## Root Cause And Prevention

- Root cause: `article.blocks.json` is the publish source, and a valid `callout` block carried internal QA/source-policy rubric language into the public article. The prior outline and claim ledger also contained example-selection language, so the writing pass had enough source material to reproduce a "Quality test" section even though the article needed literal examples.
- Why it reached the site: the validator checked block schema and required publish artifacts, but it did not yet reject examples posts that read like evaluation criteria or instructions for making examples.
- Prevention now in place: the SEO writing skill, blog foundation skill, blog QA skill, content packet SOP, draft subagent SOP, QA subagent SOP, `scripts/blog/validate-packet.mjs`, and `scripts/seo-aeo/claude-blog-pass.mjs` now ban public examples-post rubric language such as "Quality test," "quality bar," "selection criteria," "What Makes An Example Count," and criteria-style FAQ questions.
- Generator fix: `scripts/seo-aeo/claude-blog-pass.mjs` now supports `--from-scratch`, omits contaminated public copy from the prompt, requires full renderer-valid `article.blocks.json` metadata and block schemas, and rejects unsafe Claude output before writing.

## Blockers

- None.

## Source And Claim Checks

- Source policy followed: yes.
- Discovery inputs used as evidence: no.
- Apollo/account-intel used for profile discovery: yes, no email enrichment.
- Apify LinkedIn profile-post capture used: yes, public profile posts only, `maxPosts=3`, no comments or reaction-list scraping.
- Unsupported numeric stats: none.
- Claims ledger complete: yes for surfaced factual, example, definition, and operating-POV claims.
- LinkedIn posts: used as example artifacts only, not proof of broad performance or revenue.
- Weak-source handling: Farhan Thawar's LinkedIn post is framed as a lightweight heuristic, while Shopify Engineering's first-party articles remain the primary evidence.

## AEO Checks

- Direct answer near top: yes.
- Primary query addressed: yes, `employee generated content examples`.
- Specific examples and public URLs: yes.
- Comparison table: yes.
- Examples-as-instructions drift removed: yes. The final public source files no longer include "Quality test," "What Makes An Example Count," "Use Examples Without Copying Them," "Copyable Example Checklist," repeated "What to borrow:" paragraphs, or "What B2B teams can borrow" table framing.
- FAQ: yes.
- Clear definitions: yes.
- Source list: yes.
- Internal links: hub, comparison post, and blog index.

## SEO Checks

- Title: complete.
- Meta description: complete.
- Canonical: `https://sellinpublic.co/blog/employee-generated-content-examples/`.
- Schema readiness: `BlogPosting`, `BreadcrumbList`, and `FAQPage` are supported by renderer inputs.
- Author: Jeffery Schroeder with LinkedIn URL.

## Foundation And Asset Checks

- Shared blog foundation used: yes.
- Post-specific hero asset: yes.
- Hero source type: generated PNG, no SVG stand-in.
- Hero visual: one clear mock social-post card, restrained warm palette, no flow map or random icon cloud.
- Hero dimensions: `1896x830`.
- Hero aspect ratio: 2.28:1, within foundation range.
- Image distortion risk: low; width and height are declared and source file matches the manifest.

## Writing Gate

- Claude writing pass: completed with `claude-sonnet-4-6`.
- Output file: `content-packets/2026-06-19-employee-generated-content-examples/claude-writing-pass.md`.
- Applied status: `claude-writing-pass.md` records `Status: applied`, `Applied to draft.md: true`, and `Applied to article.blocks.json: true`.
- Renderer source: final public prose is in `article.blocks.json`, which is the generator source of truth.

## Voice Checks

- Sales pitch language: no.
- Feature-heavy body copy: no.
- Commercial CTA separated from article guidance: yes.
- Banned words or em dashes in final article copy: no actionable hits found in the final packet scan.
- Contractions: present and natural.

## Remaining Notes

- This article intentionally avoids claiming that named examples created pipeline or revenue.
- GitLab is intentionally anchored to the public handbook because the captured current LinkedIn posts were weaker examples than the durable company knowledge asset.
