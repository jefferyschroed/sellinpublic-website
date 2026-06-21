# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-21T22:01:17.957Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Audit Notes

### Anti-AIism fixes

- Removed one instance of stiff phrasing "That is the reason" and rewrote as "A generic content calendar is a weak buying signal for this reason" to avoid the setup-then-label cadence.
- Removed the implicit binary correction rhythm in the original draft sentence "Founder-led content needs to sound like a person with judgment instead of an organization wearing a founder's face" by rewriting it as "needs to sound like a person with genuine judgment, not an organization that borrowed a founder's name for the byline" to make the contrast concrete and avoid the "X wearing Y's face" shorthand that echoes a binary correction pair.
- No em dashes were present in the incoming draft. None added.
- No banned words (unlock, leverage as verb, supercharge, etc.) were present. None added.
- No banned filler phrases ("in today's fast-paced world," "it's no secret that," "move the needle," etc.) were present. None added.
- No binary correction pairs of the exact banned forms ("X isn't Y. It's Z.") were present in the draft. None added.
- Contraction pass applied throughout: "you're," "there's," "can't," "it's" used where the draft used full forms that read stiffly.

### Structural checks

- All FAQ items contain non-empty, reader-facing questions and answers. FAQ question text made more specific (e.g., "How often should a founder post on LinkedIn?" and "What should a founder-led LinkedIn content agency measure?") to avoid generic labels.
- CTA body is exactly two sentences. Sentence 1 names Sell In Public and states the service. Sentence 2 invites a working session. No third sentence added.
- No public-facing rubric or process language (quality test, selection criteria, helpful content guidance, etc.) appears in article copy.
- Claim IDs and citation markers retained in draft_md. Removed from article_blocks as required.
- Internal links preserved in both draft and article_blocks.
- All metadata fields from PUBLIC STRUCTURAL METADATA TO PRESERVE carried forward without modification.
- Sources block matches citations exactly, with no invented URLs or labels.
