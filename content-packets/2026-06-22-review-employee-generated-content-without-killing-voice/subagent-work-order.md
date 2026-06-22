# Subagent Work Order

Packet: `2026-06-22-review-employee-generated-content-without-killing-voice`

Role: child orchestrator 2 of 5.

## Assignment

Build one complete Sell In Public SEO/AEO blog packet, rendered static post, and post-local hero asset for the slug `review-employee-generated-content-without-killing-voice`.

## Owned Scope

- `content-packets/2026-06-22-review-employee-generated-content-without-killing-voice/`
- `blog/review-employee-generated-content-without-killing-voice/index.html`
- `public/assets/blog/review-employee-generated-content-without-killing-voice/`

## Stop Conditions

- Do not edit shared aggregate files.
- Do not continue if the Claude writing pass cannot run, unless the parent approves an exception.
- Do not publish unsupported legal, compliance, statistical, or performance claims.
- Do not use Reddit, forums, or generic listicles as evidence.

## Required Gates

1. Build packet artifacts.
2. Generate post-local hero assets.
3. Run `node scripts/seo-aeo/claude-blog-pass.mjs --packet content-packets/2026-06-22-review-employee-generated-content-without-killing-voice/ --apply`.
4. Render static HTML.
5. Run `node scripts/seo-aeo/public-reader-qa.mjs --packet content-packets/2026-06-22-review-employee-generated-content-without-killing-voice/ --apply`.
6. Run packet validation, post checker, and `git diff --check`.
7. Commit owned files only if all required gates pass.
