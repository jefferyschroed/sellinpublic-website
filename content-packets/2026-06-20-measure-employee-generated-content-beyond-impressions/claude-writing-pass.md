# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-20T03:23:46.267Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Audit Notes

### Changes made in this pass

- Converted stiff "do not" and "is not" constructions to contractions throughout body, FAQ answers, and CTA copy per skill rule.
- Removed one residual em dash check: none were present in the source draft.
- Tightened the intro: removed one redundant clause in the second sentence.
- Section heading "Tie Posts To Pipeline Without Pretending Every Deal Has One Source" shortened to "Tie Posts To Pipeline Without Overclaiming" (was over twelve words).
- FAQ question five reworded slightly in article.blocks.json to avoid exact duplication with the draft heading while preserving meaning.
- All claim IDs and citation markers preserved in draft.md only; removed from article.blocks.json public copy per hard rules.
- No statistics, quotes, examples, URLs, or source claims were invented or modified.
- Banned words and phrases checked: none found in final copy.
- CTA body and heading confirmed free of em dashes and banned phrases.
- All public structural metadata fields preserved exactly from PUBLIC_STRUCTURE input.
