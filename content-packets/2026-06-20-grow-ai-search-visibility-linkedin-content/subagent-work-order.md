# Subagent Work Order

## Packet Rule

Own only this one post:

- Slug: `grow-ai-search-visibility-linkedin-content`
- Packet: `content-packets/2026-06-20-grow-ai-search-visibility-linkedin-content/`
- Post: `blog/grow-ai-search-visibility-linkedin-content/index.html`
- Assets: `public/assets/blog/grow-ai-search-visibility-linkedin-content/`

Do not edit shared index, sitemap, feed, shared CSS/JS, shared scripts, other packets, or other posts.

## Required Work

1. Verify the source leads against current web sources.
2. Separate source-backed facts from Sell In Public interpretation.
3. Draft a practical how-to article that treats LinkedIn as one signal surface, not the whole AI visibility system.
4. Render static HTML from `article.blocks.json`.
5. Run the post checker and clean public-reader gate when credentials allow.

## Stop Conditions

- Stop before claiming publish-ready if `ANTHROPIC_API_KEY` is missing for the Claude writing pass or public-reader model gate.
- Stop before commit if any required gate fails.
- Do not broaden into shared publish integration files in this child worktree.
