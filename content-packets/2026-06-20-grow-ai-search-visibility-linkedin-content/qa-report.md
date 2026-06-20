# QA Report

Decision: `approved_with_notes`

## Summary

The packet, draft, block JSON, metadata, claim ledger, hero asset, rendered HTML, Claude writing pass, and model-based public-reader report are present for `grow-ai-search-visibility-linkedin-content`. The article is approved with notes for this child scope.

## Notes

- `scripts/seo-aeo/claude-blog-pass.mjs --apply` ran and applied the writing pass to `draft.md` and `article.blocks.json`.
- `node scripts/seo-aeo/public-reader-qa.mjs --packet content-packets/2026-06-20-grow-ai-search-visibility-linkedin-content --apply` ran in model mode and passed with zero findings.
- Shared publish integration files are intentionally not edited in this child because the assignment forbids edits to `blog/index.html`, `sitemap.xml`, `feed.xml`, shared docs, shared scripts, and other posts.

## Source QA

- Material LinkedIn AI-citation claims map to LinkedIn/Meltwater research sources `src-001` and `src-002`.
- Google-owned-page and crawlability claims map to official Google Search Central docs `src-004` and `src-005`.
- The LinkedIn-only caveat maps to Kiplinger `src-006` and is framed as expert commentary, not primary research.
- LinkedIn generic-content filtering maps to LinkedIn Pressroom `src-007`.
- Oktopost `src-008` is retained as context only and is not used for material statistics.

## Claim QA

Every material factual claim in the draft has a claim ID in `claims-ledger.csv`. No customer metrics, quotes, rankings beyond cited studies, or Sell In Public performance outcomes were invented.

## SEO And AEO QA

- H1 matches target intent.
- Short answer appears before the first long body section.
- Article answers the AEO question directly without saying LinkedIn alone is enough.
- FAQ items are complete and non-duplicative.
- Sources are visible in the rendered article blocks.
- Internal links point to the employee-generated content hub and advocacy comparison post.

## Brand And Voice QA

The public body teaches first and keeps Sell In Public service language to the final CTA. No em dashes were intentionally used in public article copy. The Claude writing pass is applied and recorded in `claude-writing-pass.md`.

## Foundation QA

The article uses the existing packet-driven static blog renderer and standard article blocks. The generated hero is a PNG saved under the post-local asset path with honest dimensions.

## Final Decision

Approved with notes for the child-owned scope. Parent integration still needs to handle any shared index, sitemap, feed, topic coverage, and deployment steps because this child was explicitly forbidden from editing those files.
