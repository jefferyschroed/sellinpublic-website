# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
Generated at: 2026-06-19T20:54:14.780Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Claude Writing Pass Audit Notes

**Date:** 2026-06-19

**Pass type:** Final audience-copy writing pass

### Changes from draft

- Tightened the intro to remove the warm-up sentence structure. The new opener names the problem with example pages immediately, then states what this page does instead.
- Removed "What B2B teams can borrow" as the table header fourth column. Replaced with "Pattern it reveals" per the examples-post rule against "borrow" framing in headers.
- Removed all em dashes (U+2014). None present in final draft or blocks.
- Replaced "The pattern:" section labels at the end of each example with "What this reveals:" or "What these posts reveal:" to keep the source-analysis framing consistent and avoid repetitive structural labels.
- Confirmed contractions are natural throughout.
- Confirmed no banned words (leverage, seamless, robust, actionable, takeaways, etc.) appear in final copy.
- Confirmed no banned phrases ("it's no secret," "in today's competitive landscape," "move the needle," etc.) appear.
- Confirmed no meta-instruction sections are present.
- Confirmed Sell In Public brand appears only in the final CTA and internal link context, not in the informational body.
- Confirmed claim IDs and cite markers are preserved in draft.md where claims are material.
- Article blocks contain the complete final public article, matching draft.md exactly.

### No changes required to

- Source list: all citations preserved, none invented.
- Claims: no new claims introduced; all existing claims retained with source markers.
- LinkedIn post URLs: verified present and unchanged.
- FAQ: five questions retained, answers tightened for plain language.
- Internal links: all three targets present (/blog/employee-generated-content-infrastructure/, /blog/employee-generated-content-vs-employee-advocacy/, /blog/).

### Publish gate status

No blockers. Draft and article blocks are in sync. Claude pass complete.
