# Subagent Work Order

Packet: `2026-06-22-source-employee-content-ideas-from-sales-calls`

Owned slug: `source-employee-content-ideas-from-sales-calls`

## Scope

Create one complete content packet, one rendered static blog post, and one post-local hero asset for the assigned topic: how to source employee content ideas from sales calls.

## Boundaries

Only these paths are owned:

- `content-packets/2026-06-22-source-employee-content-ideas-from-sales-calls/`
- `blog/source-employee-content-ideas-from-sales-calls/index.html`
- `public/assets/blog/source-employee-content-ideas-from-sales-calls/`

Do not edit `blog/index.html`, `sitemap.xml`, `feed.xml`, shared CSS, shared JS, renderer scripts, topic coverage files, or any other packet.

## Stop Conditions

- Claude writing pass cannot run or does not apply to both `draft.md` and `article.blocks.json`.
- Public-reader QA flags AI-ish prose, internal instruction leakage, source-policy leakage, or example drift after rerun.
- The static checker fails on a post issue inside the owned file and cannot be repaired without touching shared files.
- Parent reports that the slug is already covered.
