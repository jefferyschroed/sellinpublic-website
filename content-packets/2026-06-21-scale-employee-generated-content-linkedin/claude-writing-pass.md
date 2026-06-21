# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-21T21:48:31.970Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Audit Notes

### Anti-AIism fixes

- **Binary correction pair removed:** The draft section on the EGC/advocacy distinction ended with "The practical implication is simple: EGC needs central support that protects individual voice. Advocacy needs coordination that makes a company message easier to support." The two sentences were adjacent but did not follow the banned "X isn't Y. It's Z." cadence strictly. Kept as-is because it states two distinct operating implications directly rather than performing a correction rhythm. No rewrite needed.
- **Binary correction pair removed:** The "Turn Expertise Into Profile-Native Posts" section in the draft ended with "That review is not just permission. It is how the post keeps the person's judgment, phrasing, and comfort level." This is a borderline correction-pair cadence. Rewritten to: "That review is how the post keeps the person's actual judgment, phrasing, and comfort level, not just their name." Single sentence, no correction rhythm.
- **"That is enough to learn."** in the weekly workflow section felt like a standalone rhetorical sentence with a correction-pair flavor. Revised to merge the meaning into the follow-on sentence: "If the team can't repeat this with five people, adding 20 more will only create a bigger coordination problem."
- No banned words found (unlock, leverage as verb, supercharge, game-changer, revolutionize, seamless, robust, cutting-edge, transformative, elevate, empower, delve, holistic, synergy, frictionless, impactful, actionable, utilize, facilitate, demonstrate).
- No banned landscape or filler phrases found.
- No em dashes found in source draft. Confirmed clean in output.

### Contractions pass
- Applied natural contractions throughout: "don't," "isn't," "they're," "can't," "doesn't," "there's" in appropriate body and FAQ locations.

### CTA check
- Heading is question-style: "Want This Running Without Managing It Yourself?"
- Body is exactly two sentences. Sentence 1 names Sell In Public and describes the service. Sentence 2 invites a working session. No third sentence added.
- Wording varies from generic template: uses "find out whether" instead of "see whether" to differentiate from a direct copy.

### FAQ check
- All five FAQ items have non-empty, reader-facing questions and answers.
- Questions are varied (not duplicates). None ask what makes an example count or good.
- FAQ question wording slightly varied from draft originals to avoid repetition in question phrasing (e.g., "How often should employees post on LinkedIn?" vs. "How often should employees post?").

### Claim markers
- All [claim:Cxxx] and [cite:src-xxx] markers preserved in draft.md.
- No claim IDs or citation IDs appear in article_blocks.json public copy.

### Source blocks
- Sources block matches citations ledger exactly.
- No invented URLs, stats, or examples added.

### Brand mentions
- Sell In Public does not appear in the informational body sections. Appears only in the closing CTA block.
