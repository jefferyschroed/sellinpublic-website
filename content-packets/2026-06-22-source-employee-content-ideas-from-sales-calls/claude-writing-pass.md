# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-22T01:41:50.914Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Claude Writing Pass Audit Notes

### Anti-AIism fixes

- **Binary correction cadence removed:** The draft conclusion section heading was "The Best Sales-Call Ideas Stay One Level Abstracted" with an adjacent structure that implied a correction pair. Rewrote the conclusion heading as "The Habit Is Reviewing For Patterns, Not Details" and kept the body as direct statements rather than contrast pairs.
- **"Keep the learning. Remove the identifiers."** in the Abstract section was a two-sentence correction pair. Collapsed into one sentence: "Preserve the learning; strip the identifiers."
- No banned vocabulary (unlock, leverage as verb, robust, seamless, etc.) was found in the draft.
- No banned filler phrases ("in today's fast-paced world", "now more than ever", etc.) were found.
- No em dashes were present in the draft.

### Other pass notes

- Contractions applied consistently throughout ("don't", "shouldn't", "isn't", "it's") where the draft used formal "do not" and "should not" constructions.
- Conclusion section heading sharpened from the original to reflect the operating habit rather than a quality label.
- CTA rewritten to vary wording from the template: uses "pulls expertise from your sales conversations" instead of "captures your team's sales-call expertise" and "find out whether" instead of "see whether" to differentiate from other posts.
- All claim IDs and citation markers preserved in draft.md; clean reader-facing copy in article_blocks.json.
- No source-policy, QA rubric, or internal prompt language appears in public copy.
- FAQ items all contain non-empty, non-duplicate reader-facing questions and answers.
- Brand mentions kept out of informational body; Sell In Public appears only in the final CTA block.
