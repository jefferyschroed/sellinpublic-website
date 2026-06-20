# Subagent Work Order

Packet: `content-packets/2026-06-20-turn-employee-expertise-into-linkedin-posts/`

## Rule

No subagent owns the whole post. Each task must stay inside this packet, the rendered post path, the slug asset folder, or post-local generated reports.

## Required Checks

- Source checker: verify source URLs, evidence grades, and claim ledger support.
- Draft checker: review `draft.md` and `article.blocks.json` for voice, banned phrases, genericness, and source-policy leakage.
- Foundation checker: run `node scripts/check-blog-post.mjs blog/turn-employee-expertise-into-linkedin-posts/index.html`.
- Public-reader checker: run `node scripts/seo-aeo/public-reader-qa.mjs --packet content-packets/2026-06-20-turn-employee-expertise-into-linkedin-posts --apply`.

## Stop Conditions

- Do not edit shared blog index, sitemap, feed, CSS, JS, scripts, or topic coverage from this child worktree.
- Stop if Anthropic-backed gates cannot run.
- Stop if the public-reader gate finds unresolved AI-ish, instruction-like, rubric-like, source-policy, or internal-process copy.
