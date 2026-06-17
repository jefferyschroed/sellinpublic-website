# Content Packet Schema

A Content Packet is the pre-publication source of truth for one SEO/AEO article. Packets are not blog posts. No publishable page should be created until the packet passes QA.

Suggested path:

```text
content-packets/<yyyy-mm-dd>-<slug>/
```

## Required Artifacts

| Artifact | Purpose | Required fields or sections | Acceptance criteria |
|---|---|---|---|
| `brief.yaml` | Assignment source of truth | `packet_id`, `status`, `working_title`, `slug`, `owner`, `reviewers`, `audience`, `business_goal`, `search_intent`, `aeo_question`, `primary_keyword`, `secondary_keywords`, `entity_targets`, `angle`, `cta`, `word_count_target`, `must_include`, `must_avoid`, `created_at`, `updated_at` | Clear audience, intent, CTA, and search promise. Slug is unique. Status reflects current stage. |
| `research.md` | Synthesized research | Summary, audience context, SERP/AEO observations, competitor notes, entity map, common questions, source gaps | Research is summarized, not pasted. Open questions are explicit. |
| `citations.json` | Source registry | Source `id`, `url`, `title`, `publisher`, `author`, `published_date`, `accessed_date`, `source_type`, `reliability`, `notes` | Every cited source has a stable ID. URLs resolve. Source quality is labeled. |
| `sme-notes.md` | Expert input | Session metadata, participants, raw notes, usable insights, quote approvals, unresolved questions | SME claims are attributable and approval-sensitive quotes are marked. |
| `outline.md` | Approved article structure | Search promise, answer-first summary, H1, H2/H3 structure, target questions, internal links, claim IDs, CTA placement | Outline satisfies the brief before drafting starts. Major claims map to sources or SME notes. |
| `draft.md` | Working article draft | Title, meta draft, body copy, citation markers, claim markers, FAQ section if applicable, CTA | Draft uses citation markers like `[cite:src-001]` and claim markers like `[claim:C001]`. No unsupported final claims. |
| `claims-ledger.csv` | Claim verification log | `claim_id`, `claim_text`, `draft_location`, `support_type`, `source_ids`, `confidence`, `owner`, `status`, `notes` | Every factual claim is logged. Status is one of `supported`, `needs_sme`, `needs_source`, `revised`, `removed`. |
| `qa-report.md` | Readiness review | Summary, blockers, SEO checks, AEO checks, citation checks, brand/voice checks, originality checks, final decision | No critical blockers. QA decision is `approved`, `approved_with_notes`, or `rejected`. |
| `publish-meta.yaml` | Publishing metadata | `title`, `slug`, `canonical_url`, `meta_description`, `og_title`, `og_description`, `og_image`, `author`, `publish_date`, `updated_date`, `category`, `tags`, `excerpt`, `robots`, `schema_type`, `internal_links` | Metadata is complete, unique, and consistent with the draft. |
| `distribution-pack.md` | Promotion assets | LinkedIn post options, email teaser, short social snippets, outreach angle, visual brief, UTM notes | Distribution copy matches the article's claims and CTA. |
| `performance-log.csv` | Post-publish tracking | `date`, `url`, `channel`, `impressions`, `clicks`, `ctr`, `avg_position`, `sessions`, `conversions`, `notes`, `action` | Created before publish. Updated after indexing and promotion windows. |
| `refresh-notes.md` | Future update record | Refresh trigger, stale claims, new sources, performance summary, edits made, next review date | Refresh rationale is documented. Updated claims return to the ledger. |

## Packet Acceptance Criteria

A packet is ready for publish implementation only when:

- `brief.yaml` defines audience, intent, primary query, AEO question, CTA, and owner.
- `research.md`, `citations.json`, and `sme-notes.md` support the outline and draft.
- `outline.md` has been approved before draft completion.
- `draft.md` contains no unresolved TODOs, placeholder claims, or uncited factual assertions.
- `claims-ledger.csv` accounts for every factual, statistical, comparative, or expert claim.
- `qa-report.md` has no critical blockers.
- `publish-meta.yaml` is complete and matches the final draft.
- `distribution-pack.md` is ready for launch promotion.
- `performance-log.csv` and `refresh-notes.md` exist before publication.

## Handoff Contracts

Brief to research:

Strategy owner provides `brief.yaml`. Research may start only after audience, intent, AEO question, and CTA are defined.

Research to outline:

Research owner delivers `research.md`, `citations.json`, and open questions. Outline owner must not invent unsupported claims.

SME to draft:

SME notes must identify which insights are approved, sensitive, or unresolved. Draft owner may use only approved quotes or paraphrased insights.

Outline to draft:

Draft follows the approved structure in `outline.md`. Any structural change must be reflected back in the outline.

Draft to QA:

Draft owner provides `draft.md` plus complete `claims-ledger.csv`. QA can reject the packet for missing claim IDs, missing citations, weak source quality, or metadata gaps.

QA to publish:

Publish work starts only after `qa-report.md` is approved and `publish-meta.yaml` is complete.

Publish to refresh:

After publication, performance tracking moves to `performance-log.csv`. Material updates must be recorded in `refresh-notes.md` and rechecked against the claims ledger.

