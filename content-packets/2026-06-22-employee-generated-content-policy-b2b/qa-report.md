# QA Report

Packet: `2026-06-22-employee-generated-content-policy-b2b`
Slug: `employee-generated-content-policy-b2b`

Decision: `approved_with_notes`

## Summary

The packet is scoped to a B2B employee-generated content policy article. It answers the assigned AEO question near the top, frames the article as operating guidance rather than legal advice, and gives a practical policy model for disclosure, confidential information, customer names, claims, review lanes, employee rights, workplace conduct, and LinkedIn platform rules.

## Blockers

- None in the owned packet/post/assets. Parent still needs to create the clean branch/commit and decide whether shared aggregate files are handled outside this child scope.

## Source And Claim Checks

- Source policy followed: yes. Evidence uses FTC, LinkedIn, NLRB, SEC, EEOC, Intel, Stanford, and Coca-Cola HBC primary or first-party sources.
- Claims ledger complete: yes. Material factual claims are mapped to `claims-ledger.csv`.
- Unsupported claims: none identified.
- Weak sources: none used as factual evidence.
- Named examples, research, or case studies used: Intel, Stanford, and Coca-Cola HBC are used as public policy examples, not as legal authority.

## AEO Checks

- Direct answer near top: yes.
- Question-led headings: yes, headings follow the policy decisions a B2B reader needs to make.
- Clear definitions: yes, the article defines policy scope, disclosure, information lanes, claim support, review lanes, and platform workflow.
- Evidence blocks: yes, source links are included in the relevant sections and repeated in the sources block.
- FAQ candidates: yes, five non-empty reader-facing FAQ items are included.

## SEO Checks

- Title fields 60 characters or fewer, 45-58 target checked: yes.
- Meta description 110-155 characters, 130-150 target checked: yes.
- OG/Twitter descriptions 155 characters or fewer: yes.
- Metadata promise matches article and supported claims: yes.
- H1/H2 structure: yes.
- Internal links: yes, links to the EGC infrastructure, advocacy comparison, and scaling posts.
- Canonical: yes, set in `publish-meta.yaml`.
- Schema: BlogPosting plus FAQPage and BreadcrumbList through the renderer.

## Foundation And CMS Checks

- Shared blog CSS and JS used: yes, no post-local CSS or JS added.
- Stable blog shell preserved: yes, static HTML rendered from `article.blocks.json`.
- Desktop side rails start beside the intro/hero: renderer-owned.
- Desktop side rails remain sticky on scroll: renderer-owned.
- H1 uses editorial article scale, not landing-page hero scale: renderer-owned.
- Post-local generated hero original PNG exists: yes.
- Hero WebP exists and is the publishable source: yes.
- Hero source fields agree across article.blocks, asset manifest, publish-meta, and rendered HTML: yes.
- Hero alt fields agree and describe the visible image: yes.
- No rendered blog image has missing alt text or `alt=""`: yes.
- Hero aspect ratio between 2.0:1 and 2.6:1: yes, 1897x829.
- Hero dimensions match source file: yes.
- Inline media preserves original aspect ratio: no inline media.
- Author is Jeffery Schroeder and links to LinkedIn: renderer-owned.
- Copy block uses icon-only clipboard/check button: renderer-owned.
- Floating Copy Page and Ask AI states work: renderer-owned.
- CTA links are not underlined: renderer-owned.
- `node scripts/check-blog-post.mjs blog/employee-generated-content-policy-b2b/index.html` passed: yes.

## Brand And Voice Checks

- Clear editorial POV: yes, policy as a decision system.
- Specific buyer: yes, B2B revenue, marketing, HR, and legal stakeholders.
- Reader value: yes, practical checklist and review-lane model.
- Feature-heavy language in article body: no.
- Commercial CTA separated from article guidance: yes.
- End CTA names Sell In Public and explains the managed LinkedIn content plus outbound offer: yes.
- Genericness issues: none identified.

## Required Fixes

- None in the owned child scope.

## Final Notes

Claude writing pass applied to both `draft.md` and `article.blocks.json`. Static HTML rendered for the assigned slug only. Public-reader QA passed in model mode with zero findings. Packet validation, post checker, and scoped diff hygiene passed.
