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
| `packet-intake.yaml` | Packet intake gate record | `packet_id`, `slug`, `status`, `strategic_asset_decision`, `asset_decision`, `topic_id`, `pillar_id`, `source_readiness`, `standalone_rationale`, `discovery_sources_excluded_from_evidence` | Intake status is `intake_ready`. Source readiness is `ready`. Discovery-only inputs are explicitly excluded from factual evidence. |
| `discovery-exclusions.json` | Discovery source boundary | `evidence_policy`, `excluded_sources`, `rules` | Query exports, trend inputs, AI prompt outputs, Reddit, autocomplete, and PAA are visible to subagents but cannot be cited as factual evidence. |
| `subagent-work-order.md` | Narrow-agent assignment guide | Packet rule, required subagents, first tasks, stop conditions | Makes clear that no subagent owns the whole post. |
| `research.md` | Synthesized research | Summary, audience context, SERP/AEO observations, competitor notes, entity map, common questions, source gaps | Research is summarized, not pasted. Open questions are explicit. |
| `citations.json` | Source registry | Source `id`, `url`, `title`, `publisher`, `author`, `published_date`, `accessed_date`, `source_type`, `reliability`, `notes` | Every cited source has a stable ID. URLs resolve. Source quality is labeled. |
| `sme-notes.md` | Expert input | Session metadata, participants, raw notes, usable insights, quote approvals, unresolved questions | SME claims are attributable and approval-sensitive quotes are marked. |
| `outline.md` | Approved article structure | Search promise, answer-first summary, H1, H2/H3 structure, target questions, internal links, claim IDs, CTA placement | Outline satisfies the brief before drafting starts. Major claims map to sources or SME notes. |
| `draft.md` | Working article draft | Title, meta draft, body copy, citation markers, claim markers, FAQ section if applicable, CTA | Draft uses citation markers like `[cite:src-001]` and claim markers like `[claim:C001]`. No unsupported final claims. Public prose has passed the applied Claude writing gate or QA records an owner-approved exception. |
| `article.blocks.json` | Machine-readable article AST | Version, slug, title, intro fields, `topic_map`, hero object, typed article blocks | Generator can render the static post without guessing from markdown or existing HTML. Blocks match the approved draft because this file is the rendered source of truth, and the applied Claude writing pass wrote the final public copy here. |
| `claims-ledger.csv` | Claim verification log | `claim_id`, `claim_text`, `draft_location`, `support_type`, `source_ids`, `confidence`, `owner`, `status`, `notes` | Every factual claim is logged. Status is one of `supported`, `needs_sme`, `needs_source`, `revised`, `removed`. |
| `qa-report.md` | Readiness review | Summary, blockers, SEO checks, AEO checks, citation checks, brand/voice checks, originality checks, final decision | No critical blockers. QA decision is `approved`, `approved_with_notes`, or `rejected`. |
| `publish-meta.yaml` | Publishing metadata | `title`, `slug`, `canonical_url`, `meta_description`, `og_title`, `og_description`, `og_image`, `author`, `publish_date`, `updated_date`, `category`, `tags`, `excerpt`, `robots`, `schema_type`, `internal_links` | Metadata is complete, unique, and consistent with the draft. |
| `distribution-pack.md` | Promotion assets | LinkedIn post options, email teaser, short social snippets, outreach angle, visual brief, UTM notes | Distribution copy matches the article's claims and CTA. |
| `performance-log.csv` | Post-publish tracking | `date`, `url`, `channel`, `impressions`, `clicks`, `ctr`, `avg_position`, `sessions`, `conversions`, `notes`, `action` | Created before publish. Updated after indexing and promotion windows. |
| `refresh-notes.md` | Future update record | Refresh trigger, stale claims, new sources, performance summary, edits made, next review date | Refresh rationale is documented. Updated claims return to the ledger. |
| `asset-manifest.json` | Post asset registry | Asset ID, type, path, public URL, width, height, alt text, notes | Every generated or selected asset is post-local and has honest dimensions. |

## Staged Acceptance

Packets move through stages. Passing a later stage implies the earlier stages are still true.

| Stage | Required evidence |
|---|---|
| `intake_ready` | Topic score and standalone rationale are recorded, `topic_id` and `pillar_id` are mapped, query handoff is `ready`, source readiness is `ready`, and discovery-only inputs are excluded from factual evidence. |
| `research_ready` | Source registry, citations, source grades, and SME gaps are resolved enough to support the planned claims. |
| `outline_ready` | Outline maps each section to approved sources, target AEO question, internal links, and unresolved claims. |
| `draft_ready` | Outline is approved, claim boundaries are clear, and the Draft Agent has only scoped writing work left. |
| `publish_ready` | Claim ledger, metadata/schema, assets, QA report, generated page, index, feed, sitemap, and publish governor gates pass. |

Query exports, trend inputs, Reddit data, autocomplete, People Also Ask, and AI prompt outputs can shape language and routing, but they do not count as factual evidence for any stage.

For examples, case-study, LinkedIn content, founder-led content, and team-led content posts, the packet must also document the real public examples used. Prefer first-party URLs and public LinkedIn profile posts from founders, executives, team leads, or practitioners. Record the example URL, author or team, role, source date when visible, capture method, and any API/tool limitations in `research.md`, `citations.json`, or `qa-report.md`.

For examples posts, research and QA may use quality rubrics, helpful-content guidance, source policy, or selection criteria internally, but those rubrics should not become public article sections or callouts. The publishable article should analyze named examples, not teach the reader how to evaluate whether an example counts unless the user explicitly asked for that separate article type.

## Packet Acceptance Criteria

A packet is ready for publish implementation only when:

- `brief.yaml` defines audience, intent, primary query, AEO question, CTA, and owner.
- `research.md`, `citations.json`, and `sme-notes.md` support the outline and draft.
- `outline.md` has been approved before draft completion.
- `draft.md` contains no unresolved TODOs, placeholder claims, or uncited factual assertions.
- `draft.md` and `article.blocks.json` have passed a final audience-copy review. Use `scripts/seo-aeo/claude-blog-pass.mjs --packet content-packets/<packet>/ --apply` with `ANTHROPIC_API_KEY` set locally, or record an owner-approved exception in `qa-report.md`.
- `claude-writing-pass.md` records `Status: applied`, `Model: claude-sonnet-4-6`, `Applied to draft.md: true`, and `Applied to article.blocks.json: true`, unless QA records an owner-approved exception.
- `article.blocks.json` exists and matches the approved outline and draft. Do not approve a packet where the Markdown draft is good but the blocks still read as instructions, notes, or a different article.
- `claims-ledger.csv` accounts for every factual, statistical, comparative, or expert claim.
- `qa-report.md` has no critical blockers.
- `publish-meta.yaml` is complete and matches the final draft.
- `distribution-pack.md` is ready for launch promotion.
- `performance-log.csv` and `refresh-notes.md` exist before publication.
- `asset-manifest.json` records every post asset used by the generated HTML.

## Governed Generation Commands

Strict packet mode is the default, but static publishing writes should go through the publish governor. The governor checks strict packet validation, packet status, topic score, query handoff readiness, source readiness, QA gates, republish blocking, and daily limits before calling the generator.

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd>
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd> --generate-approved
```

Use direct generator commands for validation, dry-runs, and debugging only. The generator blocks direct non-dry-run writes; static output must be written through the publish governor. If a real run selects more than one packet, use `--allow-multi-post` only after explicit human approval.

```sh
node scripts/blog-orchestrator.mjs validate content-packets/<packet>/
node scripts/blog-orchestrator.mjs generate --dry-run content-packets/<packet>/
node scripts/blog-orchestrator.mjs check-all
```

Generated output:

- `blog/<slug>/index.html`
- `blog/index.html`
- `sitemap.xml`
- `feed.xml`
- `content-packets/<packet>/publish-report.json`

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

Draft owner also provides the applied Claude writing-pass output or records why it was not available. QA must compare `draft.md` with `article.blocks.json` because the generator publishes the block file, not the Markdown draft.

QA to publish:

Publish work starts only after `qa-report.md` is approved and `publish-meta.yaml` is complete.

Publish to refresh:

After publication, performance tracking moves to `performance-log.csv`. Material updates must be recorded in `refresh-notes.md` and rechecked against the claims ledger.
