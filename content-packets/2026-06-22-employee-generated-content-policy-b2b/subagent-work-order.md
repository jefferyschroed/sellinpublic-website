# Subagent Work Order

Packet: `2026-06-22-employee-generated-content-policy-b2b`
Slug: `employee-generated-content-policy-b2b`
Child role: 4 of 5

## Scope

Own only this packet, `blog/employee-generated-content-policy-b2b/index.html`, and `public/assets/blog/employee-generated-content-policy-b2b/`.

Do not edit shared aggregate files such as `blog/index.html`, `sitemap.xml`, `feed.xml`, topic coverage, shared CSS, shared JS, or other packets.

## Required Work

1. Build the content packet from primary and first-party sources.
2. Draft the article with a direct answer, policy sections, and a copyable checklist.
3. Record citations and claim support.
4. Generate post-local hero assets.
5. Run the Claude writing pass with `--apply`.
6. Render static HTML for this post only.
7. Run public-reader QA with `--apply`.
8. Run packet validation, post checker, and scoped git hygiene.
9. Commit only owned files if all gates pass.

## Stop Conditions

- Stop if the Claude writing pass cannot run because the Anthropic key is missing or invalid.
- Stop if public-reader QA fails after a reasonable source-artifact fix.
- Stop if validation would require shared aggregate edits outside the assigned scope.
- Stop if unrelated work appears in owned files and cannot be separated safely.
