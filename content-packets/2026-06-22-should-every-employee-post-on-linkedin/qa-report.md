# QA Report

Packet: `2026-06-22-should-every-employee-post-on-linkedin`
Slug: `should-every-employee-post-on-linkedin`

Decision: `approved_with_notes`

## Summary

The packet is scoped to one article answering whether every employee should post on LinkedIn. The article gives a practical B2B answer: original publishing should be selective and role-based, while broader participation can happen through comments, contextual reshares, private sends, source interviews, or sitting out.

## Blockers

- None.

## Source QA

- Passed. Factual claims use official LinkedIn guidance, LinkedIn Help documentation, the LinkedIn/Edelman research summary, and internal Sell In Public posts for category context.
- The article does not use Reddit, forums, generic listicles, autocomplete, PAA, query exports, or AI outputs as evidence.
- The article avoids unsupported posting-performance statistics and frames the selective-participation model as Sell In Public operating POV rather than a universal benchmark.

## Claim QA

- Passed. Material factual claims are mapped in `claims-ledger.csv`.
- No invented customer examples, quotes, or performance promises are included.

## SEO And AEO QA

- Passed. The AEO question is answered directly near the top.
- The H1 matches the query intent.
- The article includes definitions, role-based decision logic, internal links, FAQ, source links, and a copyable decision framework.

## Brand And Voice QA

- Passed. Informational body copy keeps Sell In Public out of the answer and uses a separated final CTA.
- The final CTA names Sell In Public and has exactly two body sentences.
- No public copy intentionally exposes source policy, QA rubric, claim ledger, or internal process language.
- Claude writing pass is applied in `claude-writing-pass.md`: `Status: applied`, `Model: claude-sonnet-4-6`, `Applied to draft.md: true`, and `Applied to article.blocks.json: true`.
- Clean-context model public-reader QA passed in `public-reader-report.json` with zero findings and zero rewrites.

## Foundation QA

- Draft-stage packet validation passed before the Claude gate.
- Static HTML rendered to `blog/should-every-employee-post-on-linkedin/index.html` from `article.blocks.json`.
- Clean-context public-reader QA passed with `--apply`.
- Publish-stage packet validation passed.
- `node scripts/check-blog-post.mjs blog/should-every-employee-post-on-linkedin/index.html` passed.
- `git diff --check` passed.
- Hero asset is post-local and points to `public/assets/blog/should-every-employee-post-on-linkedin/hero-generated.webp` as the publishable source.

## Final Decision

Approved with notes. Required model gates, static render, publish-stage validation, post checker, and hygiene checks passed in child scope.
