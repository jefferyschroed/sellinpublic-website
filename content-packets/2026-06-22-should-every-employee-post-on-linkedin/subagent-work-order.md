# Subagent Work Order

Packet: `2026-06-22-should-every-employee-post-on-linkedin`
Slug: `should-every-employee-post-on-linkedin`

## Assignment

Create one scoped Sell In Public blog packet and rendered static post answering: "Should every employee post on LinkedIn?"

## Required Work

- Build packet artifacts only under `content-packets/2026-06-22-should-every-employee-post-on-linkedin/`.
- Render the static post only at `blog/should-every-employee-post-on-linkedin/index.html`.
- Save post-local hero assets only under `public/assets/blog/should-every-employee-post-on-linkedin/`.
- Keep shared aggregate files locked: no `blog/index.html`, `sitemap.xml`, `feed.xml`, topic coverage, shared CSS, shared JS, or renderer edits.

## Source Rules

- Use official LinkedIn documentation, LinkedIn/Edelman research, and internal Sell In Public posts for category context.
- Do not use Reddit, forums, generic listicles, AI answers, autocomplete, or PAA as factual evidence.
- Do not invent statistics, examples, or quotes.

## Stop Conditions

- Stop and report a blocker if Claude writing pass cannot run with `--apply`.
- Stop and report a blocker if public-reader QA cannot run model-backed with `--apply`.
- Stop and report a blocker if validators require edits outside the owned post scope.
- Stop duplicate work if a parent says this slug is already covered.
