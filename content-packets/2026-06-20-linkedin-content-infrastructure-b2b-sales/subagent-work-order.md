# Subagent Work Order

## Packet Rule

No subagent owns the whole post. This child orchestrator owns only the assigned scoped paths:

- content-packets/2026-06-20-linkedin-content-infrastructure-b2b-sales/
- blog/linkedin-content-infrastructure-b2b-sales/index.html
- public/assets/blog/linkedin-content-infrastructure-b2b-sales/

## Required Work

1. Build the packet from current, source-backed public evidence.
2. Draft and block-render a practical article for VP Sales, founders, and marketing leaders.
3. Generate a post-local PNG hero after the article exists.
4. Run Claude writing pass using local ignored credentials when available.
5. Render the post through the packet-driven static renderer.
6. Run packet validation, post checker, public-reader pass or explicit manual fallback, banned scan, and git diff check.
7. Commit only owned files if every gate passes.

## Stop Conditions

- Missing Anthropic key and no owner-approved exception.
- Public-reader QA or manual skeptical read finds instruction leakage, source-policy leakage, generic copy, or banned phrasing.
- Any validation requires editing shared aggregate files, which are outside this child scope.
- The hero image cannot be saved as a checked-in PNG.
