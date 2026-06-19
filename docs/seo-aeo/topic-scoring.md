# Topic Scoring

Research date: 2026-06-17

This rubric decides whether a discovered question becomes a blog post, a section, an FAQ, a refresh task, or a parked idea. It protects the blog from thin fan-out while still building topical authority.

## Core Rule

Not every question becomes a post. A question becomes the smallest useful asset that can answer the intent with evidence, examples, and Sell In Public's point of view.

## 100-Point Score

| Factor | Points | What To Check |
|---|---:|---|
| Buyer urgency | 20 | The question shows a real buying, operating, or evaluation pain for founders, GTM leaders, sales leaders, or lean marketing leaders. |
| Business relevance | 15 | The topic naturally connects to employee-generated content, LinkedIn-led GTM, public expertise, or content operations. |
| Category authority | 15 | Publishing strengthens Sell In Public's ownership of employee-generated content or a directly adjacent concept. |
| Search and AEO opportunity | 15 | The topic maps to real questions, comparison intent, definition intent, or answer-engine prompts. |
| Source readiness | 15 | Reputable sources, company examples, case studies, or SME notes are available now. |
| POV strength | 10 | Sell In Public has a clear, useful angle beyond summarizing generic advice. |
| Internal link value | 5 | The topic can support or be supported by existing and planned articles. |
| CTA clarity | 5 | The article can end with a simple next step without becoming a sales pitch. |

## Decision Bands

| Score | Decision | Required Action |
|---:|---|---|
| 80-100 | Strategic standalone candidate | Open or refresh a packet only after the packet intake gate is clean. Until then, assign gap-resolution subagents. |
| 65-79 | Resolve gap first | Do not draft. Find sources, SME notes, examples, or a stronger angle before opening a packet. |
| 50-64 | Use inside another asset | Map as an H2, FAQ, comparison table row, checklist item, glossary entry, or refresh note. |
| 0-49 | Park, merge, or retire | Keep only if it fills a known topical coverage gap. Otherwise merge into a stronger idea or drop it. |

## Automation Mapping

`scripts/seo-aeo/plan-content.mjs` must apply topic authority data before guessing.

Score precedence:

1. Use `docs/seo-aeo/topic-coverage.csv` when a candidate matches `topic_id`, `primary_query`, `aeo_question`, or `slug`.
2. Use `docs/seo-aeo/topic-map.yaml` when coverage data is missing but the topic map has a match.
3. Use a heuristic only when no mapped authority score exists.

The planner writes both a compatibility `recommended_asset` and an explicit `asset_decision`.

| Score or mapped decision | `asset_decision` | Meaning |
|---|---|---|
| Existing published or refresh-triggered mapped topic | `refresh` | Update the existing asset, add missing sections, or improve internal links. |
| 80-100 and not already published | `post` | Eligible for a full packet only after source, SME, outline, and QA gates. |
| 65-79 | `gap_resolution` | Do not draft. Resolve source, SME, example, query, or POV gaps first. |
| 50-64 with section depth | `h2` | Add to a parent asset as an H2 or checklist section. |
| 50-64 with short answer depth | `faq` | Add to a parent asset as an FAQ. |
| 50-64 with comparison depth | `comparison_table` | Add to a parent comparison or examples table. |
| 0-49 or explicit low-value decision | `park`, `merge`, or `retire` | Keep out of packet work unless the topic map owner reopens it. |

The queue builder treats `asset_decision`, not a single generic role list, as the lifecycle input.

## Packet Intake Gate

Topic score is not enough to start draft, generator, distribution, or publish work. A topic can be strategically important and still fail packet intake.

Standalone packet work requires:

- `source_readiness: ready`.
- A validated query handoff with `handoff_status: ready`.
- A mapped `topic_id` and `pillar_id`.
- No unresolved parent-topic, cannibalization, or merge risk.
- A clear standalone rationale that explains why the answer should be a URL, not an H2, FAQ, comparison row, or refresh note.

If any of those gates fail, the planner should preserve the strategic decision in `strategic_asset_decision`, set `packet_intake_status: blocked_before_packet`, and route the candidate to gap-resolution subagents only.

## Intent Depth Rules

Use a full article when the topic needs a definition, comparison, framework, examples, measurement method, or operating model.

Use an H2 when the question is one step inside a broader topic.

Use an FAQ when the answer is short, common, and useful for AEO clarity.

Use a table row when the question is best answered through comparison.

Use a refresh task when the question exposes missing detail in an already published article.

## Required Topic Map Fields

Every proposed post must map to:

- A pillar.
- A topic ID.
- A parent topic or hub.
- A target intent.
- One primary AEO question.
- Supporting internal links.
- Source readiness status.
- Current score and decision.

## Review Cadence

Weekly:

- Score new query clusters.
- Move questions into post, H2, FAQ, refresh, or parked status.
- Add approved items to `topic-coverage.csv`.

Monthly:

- Re-score active pillars.
- Look for cannibalization between planned posts.
- Convert performance signals into refresh decisions.
- Retire low-value ideas that no longer support the topic map.
