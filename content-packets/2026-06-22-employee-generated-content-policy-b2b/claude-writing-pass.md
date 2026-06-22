# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-22T01:48:31.858Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Audit Notes

### Anti-AIism fixes

- Removed: "The point is not to paste every platform rule into the employee handbook. The point is to turn the rules into a simple publishing prompt." This uses the "X is not Y. The X is Z." binary correction cadence. Replaced with a single direct sentence: "The goal is not to paste every platform rule into the employee handbook. Turning the rules into a simple publishing prompt gives employees a faster, more reliable check:" The second sentence states the operating implication rather than restating the correction.
- Intro paragraph "A useful policy gives employees a clear field to work inside" preserved as-is: it states a direct positive claim without a correction pair.
- No other binary correction pairs, em dashes, banned words, or banned filler phrases were found in the source draft.

### Other changes

- Added "your" to CTA body first sentence ("your team's expertise") and changed "see whether" to "find out whether" to vary wording from the generic template.
- Platform Rules section: added inline href links to LinkedIn Professional Community Policies and Advertising Policies in the article blocks, matching the source draft intent.
- No statistics, quotes, URLs, customer results, or source claims were invented or altered.
- All claim IDs and cite markers retained in draft_md, removed from article_blocks per schema rules.
- All public structural metadata fields preserved exactly from PUBLIC_STRUCTURE input.
