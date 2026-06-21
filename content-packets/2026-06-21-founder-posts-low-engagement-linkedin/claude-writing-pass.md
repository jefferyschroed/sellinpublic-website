# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-21T18:57:40.881Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Claude Writing Pass Audit Notes

### Anti-AIism fixes

One binary correction pair was present in the draft's profile section: "The public documentation does not explain every ranking factor, and the article should not pretend it does." The phrase "and the article should not pretend it does" is meta-instruction language directed at the writer rather than the reader. It was removed; the sentence now ends cleanly after stating that the documentation does not explain every ranking factor, then moves directly to the practical implication for the reader.

No em dashes were found.

No banned words from the prohibited list were found.

No banned filler phrases were found.

No other binary correction pairs of the form "X isn't Y. It's Z." were found.

### Structural changes

- The diagnostic numbered list in the "Diagnose Low Founder Engagement" section was converted from a `copy_block` to a `list` block in article_blocks, since `copy_block` with a `code` field is not a valid schema type in the required block set. The content is identical.
- The secondary CTA action ("Review the System") was removed from the CTA block. The brief specifies a single closing CTA and the skill requires the CTA to be soft and not feel like a pitch. One primary action is sufficient.
- The phrase "the system is improving" in the conclusion was reworded to "a system that is improving" to avoid the fragment-like cadence of the original closing sentence.

### Factual and source integrity

No statistics, quotes, examples, URLs, or source claims were invented or modified. All Edelman-LinkedIn figures, LinkedIn Help citations, and SME-attributed claims are preserved exactly as supplied in the draft and claims ledger.

### Coverage

All nine diagnostic causes from the brief are present. All four internal links are present. The answer block appears within the first 150 words. The CTA names Sell In Public, uses a question-style heading, and has exactly two sentences.
