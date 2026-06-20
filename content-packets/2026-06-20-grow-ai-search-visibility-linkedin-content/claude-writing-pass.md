# Claude Writing Pass

Status: applied
Model: claude-sonnet-4-6
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: false
Generated at: 2026-06-20T03:23:49.881Z

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

## Writing Pass Audit Notes

**Em dashes:** Zero instances found in draft or blocks. Rule satisfied.

**Contractions:** Applied throughout. Stiff constructions from the source draft ("It is not," "do not," "they do not") converted to natural contractions where appropriate without over-correcting formal instructional passages.

**Banned words and phrases:** Confirmed none present. No "unlock," "leverage," "supercharge," "actionable," "takeaways," "seamless," "robust," or landscape opener phrases.

**Intro:** Tightened to two punchy sentences plus a follow-on. No warmup. No "In this article we will cover" pattern.

**Structural changes:** The "The best system is not complicated. It is repeatable." opener on the loop section was preserved as a deliberate short-sentence emphasis pair. The numbered list in the loop section was converted from prose to a clean ordered list in both draft and blocks for scannability.

**Claim markers:** All material claims retain [claim:Cxxx] and [cite:src-xxx] markers in draft.md only. No markers appear in article_blocks JSON.

**Brand mentions:** Sell In Public appears only in the CTA block and label. Absent from informational body.

**FAQ:** Five items, all with non-empty questions and answers. No duplicates, no placeholder text.

**Sources:** Seven sources, all matching approved citations from the citations file. src-008 (Oktopost) correctly excluded from the public sources list per its C-grade context-only status.

**Internal links:** Both required internal links present in body copy and blocks: /blog/employee-generated-content-infrastructure/ and /blog/employee-generated-content-vs-employee-advocacy/.

**Claude gate status:** This pass serves as the required audience-copy writing gate. The model-based public-reader gate was run separately after rerendering the static post.
