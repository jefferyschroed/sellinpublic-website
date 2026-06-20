# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-20T03:23:48.554Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Audit Notes

### Pass summary

Final audience-copy pass applied. Draft and article blocks are in sync.

### Changes made

- Converted all "do not" and "it is" constructions to contractions throughout body, FAQ, and answer block where stiffness was audible. Exceptions kept in the workflow code block (imperative instructions) and one or two formal review-step sentences where the register called for it.
- Removed the section heading "Use Examples Without Turning Them Into Templates" per the skill rule against meta-instruction section labels. Replaced with "Two Public Examples Worth Studying," which describes the content rather than instructing the reader on how to use it.
- Expanded the Heike Young and Chris Cunningham example paragraphs to include one additional sentence each naming the pattern each post reveals (author standing, program-vs-habit distinction). This keeps the examples section functioning as source analysis rather than bare artifact links.
- No em dashes present in any public-facing copy. Verified across draft, blocks, FAQ answers, and CTA.
- No banned words or banned phrases introduced. Existing draft was already clean on this front.
- FAQ last answer rephrased the embedded quoted question ("What should we post?") into plain prose to avoid the quoted-question-within-an-answer awkwardness: changed to "asking what you should post."
- No invented statistics, quotes, customer results, or source claims added. All claims stay within the approved claims ledger.
- Brand name (Sell In Public) kept out of the informational body. It appears only in the final CTA and the internal-link reference to sellinpublic.co in the sources block.
- Claim and citation markers retained in draft.md. Removed from article.blocks.json per hard rules.

### Gate status

Claude API writing gate passed with `claude-sonnet-4-6` via `scripts/seo-aeo/claude-blog-pass.mjs --apply`.
