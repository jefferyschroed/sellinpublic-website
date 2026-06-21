# Subagent Work Order

Packet: `2026-06-21-linkedin-employee-advocacy`
Slug: `linkedin-employee-advocacy`

## Rule

One post only. Do not start another packet, blog post, asset folder, or shared integration file.

## Owned Paths

- `content-packets/2026-06-21-linkedin-employee-advocacy/`
- `blog/linkedin-employee-advocacy/index.html`
- `public/assets/blog/linkedin-employee-advocacy/`

## Assignment

Write and validate the LinkedIn employee advocacy article for B2B revenue teams. The post must answer: what is LinkedIn employee advocacy, and how should a B2B revenue team run it?

## Stop Conditions

- Stop if the Claude writing gate cannot run because `ANTHROPIC_API_KEY` is missing.
- Stop if clean-context public-reader QA flags public copy after one rewrite loop and the root cause is not clear.
- Stop if passing the static generator would require editing shared index, feed, sitemap, CSS, JS, scripts, topic coverage, other posts, or other packets.
