# Subagent Work Order

## Packet

- Packet: `content-packets/2026-06-21-founder-posts-low-engagement-linkedin/`
- Slug: `founder-posts-low-engagement-linkedin`
- Post only. Do not edit shared blog index, feed, sitemap, topic coverage, shared CSS, shared JS, renderer scripts, or other posts.

## Work Split

Use narrow lanes only:

- Research lane: verify LinkedIn official docs, LinkedIn-Edelman research, and source fit. Stop at source synthesis.
- Draft lane: write the article from the approved outline and claim IDs only.
- QA lane: check sources, genericness, internal links, CTA sentence count, and banned prose patterns.
- Asset lane: create one post-local PNG hero after the draft or blocks exist.

## Stop Conditions

Stop and report a blocker if:

- The Claude writing pass cannot run with a valid local `ANTHROPIC_API_KEY`.
- Clean public-reader QA flags public prose and the source artifact cannot be rewritten cleanly.
- A required material claim lacks an approved source or approved SME basis.
- Any shared aggregate file must be edited to pass the requested child scope.

## Source Boundary

The Ahrefs prompt is demand evidence only. Reddit, forums, generic listicles, AI answers, and unsourced stat roundups are excluded from factual evidence.
