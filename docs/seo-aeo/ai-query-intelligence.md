# AI/AEO Query Intelligence

Research date: 2026-06-17

This process finds the language buyers and answer engines use before a content packet is opened. It is an upstream discovery layer, not an evidence layer.

## Core Rule

Query data can shape topics, H2s, FAQs, comparison angles, and refresh tasks. Query data cannot support factual claims.

Do not cite AnswerThePublic, ChatGPT answers, autocomplete, People Also Ask, query-tool exports, or similar discovery sources as evidence inside public articles.

## Approved Inputs

Validated demand inputs:

- Google Search Console exports or approved read-only pulls.
- Bing Webmaster Tools query exports.
- Google Trends CSV/API exports.
- First-party performance data.
- Query-tool exports only when separately reviewed as demand-bearing imports.

Discovery-only inputs unless separately validated:

- AnswerThePublic-style exports.
- Ahrefs, Semrush, AlsoAsked, and similar query-expansion exports.
- Autocomplete captures.
- Manual SERP observations.
- Manual People Also Ask observations.
- Approved, sanitized customer prompts.
- Approved, sanitized ChatGPT or AI-search prompt exports when they are captured compliantly.
- Sales and support questions aggregated without personal or confidential details.

## Prohibited Automation

Do not automate brittle ChatGPT network scraping. The network-inspection tactic may change, may expose sensitive data, and is not an official SEO interface.

The durable strategy is still valid: learn which questions AI tools and buyers appear to investigate, then publish useful, source-backed content that answers those questions clearly.

## Per-Run Folder

Use this path:

```text
research/query-intelligence/<yyyy-mm-dd>-<seed>/
```

Required artifacts:

- `source-manifest.json`
- `normalized-queries.csv`
- `query-clusters.yaml`
- `query-decisions.md`
- `brief-handoff.yaml`
- `raw/` for approved exports or manual capture notes

## Validation Gate

Before a query-intelligence run feeds packet intake, validate the run folder:

```sh
node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed>
```

The validator fails missing required artifacts, invalid source or query lineage, unclustered query rows, and any attempt to use discovery data as factual evidence. It warns when the run is thin, manual-only, missing dedupe review where duplicates appear, or still uses legacy starter shapes.

## Normalization Rules

Each row in `normalized-queries.csv` should represent one query or prompt observation.

Required fields:

- `query_id`
- `source_id`
- `source_type`
- `query`
- `normalized_query`
- `intent`
- `funnel_stage`
- `pillar_id`
- `topic_id`
- `surface`
- `country`
- `language`
- `observed_at`
- `volume`
- `difficulty`
- `evidence_use`
- `notes`

Use `evidence_use: discovery_only` unless the source is a real factual source, which should usually live in `citations.json` instead.

## Clustering Rules

Cluster by semantic intent, not keyword overlap.

A cluster should answer:

- What does the searcher want to know?
- Is the answer broad enough for a standalone page?
- Which pillar and topic does it support?
- Does it need a post, H2, FAQ, table, or refresh?
- What sources or SME notes are missing?

## Brief Handoff

`brief-handoff.yaml` is the only query-intelligence artifact that should feed a packet. It should include:

- Recommended packet title.
- Slug candidate.
- Primary query.
- AEO question.
- Secondary queries.
- Related questions.
- Topic score.
- Recommended asset type.
- Source gaps.
- SME questions.
- Internal links.

The integrator must still check `topic-scoring.md` before opening a packet.

## Subagent Pattern

- Query Intelligence Agent imports and normalizes query data.
- Topic Cartographer maps clusters to pillars and scores them.
- Source Registry Agent determines whether the topic has enough reputable evidence.
- Packet Intake Agent creates or rejects the packet based on the handoff.
- QA Agent verifies query data is not cited as factual evidence.
