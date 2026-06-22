# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-22T01:43:53.708Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Writing Pass Audit Notes

### Anti-AIism fixes

- Removed implicit binary correction cadence from the intro paragraph that read as two-sentence contrast rhythm ("public authority comes from making real work inspectable" into the next sentence). Collapsed into a single direct opening that states the lesson, then the definition of a public content loop follows as its own sentence in the second paragraph.
- Removed "That matters for revenue teams because..." opener in the loop section, which echoed a setup-then-reveal cadence. Rewritten as a direct declarative.
- Removed "That is the clearest lesson in the group:" in the GitLab section, which was filler-framed summary setup. Replaced with a plain conditional sentence that states the operating implication directly.
- Replaced "The important part is connecting the artifact to a revenue motion." with "Connecting the artifact to a revenue motion is what makes it worth publishing." to avoid the "The important part is X" AI-cadence opener.
- No em dashes were present in the draft. Confirmed clean.
- No banned words found (unlock, leverage as verb, seamless, robust, etc.).
- No banned filler phrases found (in today's competitive landscape, now more than ever, etc.).
- No binary correction pairs of the form "X isn't Y. It's Z." were present after the intro rewrite.

### CTA

- Heading rewritten from "Turn team expertise into revenue motion" to a question-style heading per CTA rules.
- Body is exactly two sentences. Sentence 1 names what Sell In Public does. Sentence 2 invites a working session.
- Wording varied from the brief template: "so your public loop turns into real sales conversations" and "find out whether" instead of "see whether".

### Other notes

- Claim IDs and cite markers preserved in draft.md, removed from article_blocks as required.
- All internal links preserved and accurate.
- No invented metrics, quotes, or performance claims added.
- Source boundaries respected throughout.
