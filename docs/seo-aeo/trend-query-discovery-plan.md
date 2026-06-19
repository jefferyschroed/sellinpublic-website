# Trend And Query Discovery Plan

This plan governs upstream topic and query discovery for Sell In Public SEO/AEO work. It turns exports and manual observations into daily research artifacts that can inform topic scoring, briefs, headings, FAQs, refresh decisions, and monitoring.

Discovery data is not factual evidence for public articles. Reddit and manual AI prompt exports are discovery only, never factual evidence. Sanitized manual Reddit captures use the no-API lane at `imports/reddit-manual-captures/*.csv` and must never include usernames, authors, full post bodies, or raw comments.

## Evidence Boundary

All artifacts created by this workflow must use `evidence_use: discovery_only`.

Allowed uses:

- Identify buyer language, objections, comparisons, examples, and emerging content angles.
- Prioritize content packets, refreshes, H2s, FAQs, tables, and internal-link opportunities.
- Flag source gaps and SME questions before a packet opens.
- Track directional movement in query demand or AI-answer behavior.

Disallowed uses:

- Do not cite Reddit posts, comments, subreddit summaries, or forum language as evidence.
- Do not use manual Reddit captures to validate demand, validate facts, or unlock packet intake.
- Do not cite AI answers, prompts, model outputs, or AI-search summaries as evidence.
- Do not treat Google Trends relative interest as search volume.
- Do not cite Google Trends RSS trend labels or linked news cards as factual evidence.
- Do not treat AnswerThePublic-style exports as proof that a claim is true.
- Do not use query discovery artifacts in `citations.json` or claims ledgers.
- Do not edit connector scripts or analytics CSVs as part of this workflow.

If a discovery source suggests a factual claim, open a source gap and find primary or otherwise approved evidence under `source-and-qa-policy.md`. If a manual Reddit capture suggests buyer demand, keep it as discovery language only until separate validated demand and source readiness are available.

## Daily Run Folder

Create one run folder per discovery day:

```text
research/trend-intelligence/<yyyy-mm-dd>-daily-discovery/
```

Local builder:

```sh
node scripts/seo-aeo/build-discovery-run.mjs --date <yyyy-mm-dd>
```

The builder reads approved local inputs from `analytics/search_query_daily.csv`, `analytics/ai_citation_log.csv`, `imports/query-exports/*.csv`, `imports/trends/*.csv`, `imports/ai-query-observations/*.csv`, `imports/serp-observations/*.csv`, `imports/topic-seeds/*.csv`, and existing normalized trend-intelligence rows. Google Trends CSV/UI exports, official Google Trends RSS CSV pulls, and automated public RSS, Atom, and JSON feed headline captures can all enter through `imports/trends/*.csv`, but only non-RSS Google Trends CSV/UI rows count as validated demand. Sanitized manual Reddit captures are documented as a no-API input lane under `imports/reddit-manual-captures/*.csv`; this docs/template lane does not authorize Reddit API use or make manual captures demand-bearing. It writes the trend-intelligence artifacts below, and writes a compatible `research/query-intelligence/<yyyy-mm-dd>-daily-discovery/` handoff only when normalized discovery rows produce at least one non-monitor handoff candidate. No-input and monitor-only days produce a rollup but do not create an empty query-intelligence run.

The daily controller runs this bridge twice when a daily content plan exists. The first pass creates enough discovery context for `plan-content.mjs`; then `scripts/seo-aeo/export-topic-seeds.mjs` writes the plan's topic candidates into `imports/topic-seeds/<yyyy-mm-dd>-daily-plan-topic-seeds.csv`; then the final discovery pass rebuilds with those topic seeds included. These generated topic seeds are discovery-only carry-forward rows. They can improve clustering and gap routing, but they cannot validate demand or unlock packet intake.

The builder may set `handoff_status: ready` only when it has enough multi-source discovery signal and at least one validated demand source imported from GSC, Bing Webmaster Tools, manual Google Trends CSV/API exports, first-party performance data, or a separately reviewed demand-bearing query/trend export. AnswerThePublic, PAA, autocomplete, ChatGPT, AI-search prompt exports, manual topic seeds, manual SERP/PAA/AEO observations, and approved sanitized AI-query observations can produce a `draft` handoff, but discovery-only data must not unlock packet intake. Ready query handoffs still do not create public evidence; they only allow topic, source, and packet-intake review to proceed.

Required daily output artifact names:

- `source-manifest.json`
- `normalized-discovery-queries.csv`
- `dedupe-map.csv`
- `query-clusters.yaml`
- `daily-discovery-rollup.md`
- `brief-handoff-candidates.yaml`
- `review-notes.md`
- `raw/reddit-<yyyy-mm-dd>.csv`
- `raw/reddit-manual-capture-<source>-<yyyy-mm-dd>.csv`
- `raw/answer-the-public-<seed>-<yyyy-mm-dd>.csv`
- `raw/gsc-emerging-queries-<yyyy-mm-dd>.csv`
- `raw/google-trends-<seed-or-topic>-<yyyy-mm-dd>.csv`
- `raw/trend-export-<yyyy-mm-dd>-google-trends-rss.csv`
- `raw/trend-export-<yyyy-mm-dd>-public-trends.csv`
- `raw/ai-prompt-export-<surface>-<yyyy-mm-dd>.md`
- `raw/ai-query-observation-<source>-<yyyy-mm-dd>.csv`
- `raw/serp-observation-<source>-<yyyy-mm-dd>.csv`
- `raw/topic-seed-<source>-<yyyy-mm-dd>.csv`

Use only the raw files that exist for that day. Missing input lanes should be recorded in `daily-discovery-rollup.md` with a reason.

## Source Manifest

`source-manifest.json` records every raw input file or manual capture used by the run.

Required source fields:

- `source_id`
- `source_type`
- `name`
- `captured_by`
- `captured_at`
- `surface`
- `country`
- `language`
- `path`
- `evidence_use`
- `allowed_public_use`
- `collection_method`
- `license_or_terms_note`
- `sanitization_status`
- `notes`

Allowed `source_type` values:

- `reddit_manual_capture`
- `reddit_api_export`
- `answer_the_public_export`
- `gsc_emerging_query_export`
- `bing_webmaster_query_export`
- `google_trends_api_export`
- `google_trends_csv_export`
- `public_source_trend_export`
- `manual_ai_prompt_export`
- `manual_serp_observation`
- `manual_topic_seed`
- `other_query_tool_export`

`reddit_manual_capture`, `reddit_api_export`, and `manual_ai_prompt_export` must always set:

```json
{
  "evidence_use": "discovery_only",
  "allowed_public_use": "none"
}
```

Manual Reddit capture import rows must also set `capture_method` to `manual_capture_no_api`. Source manifests use `collection_method: manual_capture_no_api` and must record `api_used: false`, `uses_reddit_api: false`, `validates_demand: false`, and `validates_facts: false`.

## Input Lanes

### Reddit

Purpose:

- Find buyer language, objections, confusion, comparison terms, and repeated workflow pain.
- Detect how people describe a problem before they know the category name.

Collection rules:

- Use sanitized manual captures from `imports/reddit-manual-captures/*.csv` or approved compliant API output only. The current manual lane is no-API.
- Start manual capture files from `docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv`.
- Every manual capture row must set `source_type=reddit_manual_capture`, `capture_method=manual_capture_no_api`, `evidence_use=discovery_only`, and `allowed_public_use=none`.
- Record subreddit, thread URL, post/comment type, observed date, and capture path.
- Capture only sanitized topic labels, sanitized summaries, and implied buyer-language queries.
- Do not include usernames, author handles, profile URLs, full post bodies, full thread titles when unnecessary, raw comments, private details, confidential company references, or unnecessary verbatim text.
- Remove usernames, personal details, confidential company references, and unnecessary verbatim text from normalized outputs.
- Keep manual capture rows summary-level and query-level only; do not store raw comment text.
- Do not quote Reddit in public content unless a separate editorial and legal decision explicitly approves it.
- Manual Reddit captures cannot validate demand, validate facts, or unlock packet intake without separate validated demand and source readiness.

Normalization:

- Convert a complaint or discussion into the implied query only when the intent is clear.
- Mark manual rows as `source_type=reddit_manual_capture`.
- Mark API rows, if that lane is separately approved later, as `source_type=reddit_api_export`.
- For manual rows, preserve `capture_method=manual_capture_no_api` in the import row and use `collection_method: manual_capture_no_api` in `source-manifest.json`.
- Set `evidence_use` to `discovery_only`.
- Set `allowed_public_use` to `none`.
- Leave demand metrics blank unless they come from a separate validated demand source. Do not copy volume, impressions, clicks, difficulty, or trend values from Reddit.
- Set `confidence` lower when the query is inferred from a discussion rather than explicitly stated.

Example normalized query:

```text
how do we get sales reps to share useful linkedin content without sounding scripted
```

### AnswerThePublic-Style Exports

Purpose:

- Expand seed topics into questions, comparisons, prepositions, and adjacent terms.
- Find FAQ candidates and section-level angles.
- Provide discovery language only unless a reviewer validates demand through GSC, Bing Webmaster Tools, manual Google Trends CSV/API exports, first-party performance data, or another approved demand source.

Collection rules:

- Export by seed topic, locale, and language.
- Keep the original export filename in `raw/`.
- Record seed, country, language, export date, and tool name in `source-manifest.json`.

Normalization:

- Preserve the exact question in `query`.
- Store lowercase, trimmed, punctuation-normalized text in `normalized_query`.
- Classify intent as `definition`, `comparison`, `how_to`, `examples`, `measurement`, `objection`, `vendor_evaluation`, or `other`.
- Leave volume blank unless the export includes a clear metric.

### GSC Emerging Queries

Purpose:

- Find queries that are newly appearing, rising, or underperforming for existing Sell In Public pages.
- Prioritize refreshes and internal links from actual site visibility.

Collection rules:

- Export from Google Search Console or an approved read-only pull.
- Compare the latest 7 or 28 days against the prior matched period.
- Write discovery exports under `research/trend-intelligence/.../raw/`.
- Do not edit `analytics/search_query_daily.csv` or connector scripts.

Emerging query flags:

- `new_query`: impressions in the current period and none in the comparison period.
- `rising_query`: impressions up at least 50 percent and current impressions above the daily threshold.
- `low_ctr_opportunity`: above-threshold impressions with below-baseline CTR.
- `striking_distance`: average position between 5 and 20 with relevant page match.
- `wrong_page_ranking`: query intent does not match the ranking page.

Normalization:

- Preserve GSC metrics in dedicated fields: `impressions`, `clicks`, `ctr`, `avg_position`, `page_url`, `device`, and `country`.
- Use GSC data for prioritization and internal performance diagnosis only.
- Do not use GSC query rows as factual evidence for claims in public articles.

### Google Trends API Or Exports

Purpose:

- Detect directional demand changes, seasonality, breakout adjacent topics, and regional interest.
- Compare topic phrasing before choosing a primary query.

Collection rules:

- Use Google Trends API output where available, or CSV exports from the Trends UI.
- Record search terms, topic IDs when available, geography, category, timeframe, property, and collection date.
- Capture `interest_over_time`, `related_queries`, `rising_queries`, `related_topics`, and `interest_by_region` when available.

Normalization:

- Treat all values as relative interest, not absolute volume.
- Store `trend_delta`, `trend_window`, `trend_geo`, and `trend_property`.
- Mark breakout/rising labels in `notes` without implying exact demand size.
- Split ambiguous terms unless the Google Trends topic ID disambiguates them.

### Official Google Trends RSS

Purpose:

- Pull the official Google Trends RSS feed without scraping the Trends UI.
- Add dated source-discovery and topic-direction signals to the existing `imports/trends` lane.
- Keep broad consumer trends out of the Sell In Public discovery system through explicit include/exclude filters.

Collection rules:

- Use `node scripts/seo-aeo/pull-google-trends-rss.mjs --date <yyyy-mm-dd>` only after enabling `googleTrendsRss` in config or setting `SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED=true` for a deliberate run.
- Use `--dry-run` before scheduled or first-time runs to confirm feed access, row count, filter count, and parsing errors without writing a CSV.
- Configure the official endpoint under `googleTrendsRss.endpoint`, for example `https://trends.google.com/trending/rss?geo=US`. The puller rejects non-`https://trends.google.com/trending/rss` URLs.
- Configure optional `includeKeywords`, `includePatterns`, `excludeKeywords`, and `excludePatterns` globally under `googleTrendsRss` and/or on individual `googleTrendsRss.sources` entries. Filters are case-insensitive and evaluate the trend query, topic, RSS link, linked news titles, linked news URLs, linked news sources, surface, country, and language. Include filters keep only matching rows when present, and exclude filters always remove matching rows.
- Write output to `imports/trends/<yyyy-mm-dd>-google-trends-rss.csv` unless config overrides the repo-local output directory.

Normalization:

- Preserve RSS `<title>` in `query`, `term`, and `topic`.
- Store `ht:approx_traffic` as `approx_traffic`, and store its parsed rounded number in `volume` when parsing is possible.
- Store RSS `pubDate` as the row `date` and `observed_at`; keep the raw date string in `published_at`.
- Preserve the RSS item `link`, and store `ht:news_item_url`, `ht:news_item_source`, and `ht:news_item_title` values in pipe-delimited news columns when present.
- Set `source` to `google_trends_rss` and `surface` to `google_trends_rss`, so `build-discovery-run.mjs` imports the file as `public_source_trend_export`.
- Treat every row as `discovery_only`. Google Trends RSS does not validate demand for packet intake, does not support article claims, and linked news cards are source leads that require separate Source Registry verification.

### Public RSS, Atom, Or JSON Feeds

Purpose:

- Pull current public headlines from approved industry, company, standards, or product feeds for topic-direction discovery.
- Spot emerging language, launch themes, comparisons, workflow questions, and source gaps.

Collection rules:

- Use `node scripts/seo-aeo/pull-public-trends.mjs --date <yyyy-mm-dd>` after enabling approved sources under `publicTrendSources` in config.
- Use `--dry-run` before scheduled or first-time runs to confirm source count, row count, and parsing errors without writing a CSV.
- Do not configure Reddit, `reddit.com`, or `redd.it` URLs. The fetcher skips Reddit source URLs and drops Reddit item URLs.
- Configure optional `includeKeywords`, `includePatterns`, `excludeKeywords`, and `excludePatterns` globally under `publicTrendSources` and/or on individual sources. Filters are case-insensitive and evaluate title, topic, URL, and source fields; global and per-source lists are combined. Include filters keep only matching rows when present, and exclude filters always remove matching rows.
- Respect feed terms. Capture headline, URL, source, and date metadata only; do not copy article bodies into discovery rows.
- Write output to `imports/trends/<yyyy-mm-dd>-public-trends.csv` unless config overrides the repo-local output directory.

Normalization:

- Preserve the public headline in `query`, `term`, and `title` so `build-discovery-run.mjs` can import it through the existing trends lane.
- Set `evidence_use` to `discovery_only`.
- Set `allowed_public_use` to `none` or `topic_direction`.
- Treat every row as a source lead and topic direction only. Filter public feed rows to the employee-generated content, AEO/AI-search, and GTM domain before using them for discovery. Do not cite headlines or feed text as proof that a claim is true.
- Validate any factual claim, product announcement, regulation, benchmark, or recommendation against approved sources before drafting.

### Manual AI Prompt Exports

Purpose:

- Observe how answer surfaces frame a buyer question.
- Find missing angles, cited competitors, unclear definitions, and answer patterns.

Collection rules:

- Use approved, sanitized manual exports only.
- Capture prompt, surface, displayed model/version when available, date, country or account context, cited URLs, answer angle, and manual notes.
- Do not automate unofficial ChatGPT network scraping.
- Do not include private customer data, account data, or confidential prompts.
- Do not treat the answer as true because an AI system produced it.

Normalization:

- Each prompt becomes one `manual_ai_prompt_export` source record.
- Each observed buyer question or cited-answer angle becomes a normalized query row.
- Set `evidence_use` to `discovery_only`.
- Set `allowed_public_use` to `none`.
- Add `source_gaps` for every factual claim, competitor mention, or recommendation that would need verification before drafting.

## Normalized Query CSV

`normalized-discovery-queries.csv` should include one row per query, prompt observation, or inferred buyer question.

Required columns:

```text
query_id,source_id,source_type,source_record_id,query,normalized_query,canonical_query_key,intent,funnel_stage,audience,pillar_id,topic_id,surface,country,language,observed_at,page_url,device,volume,difficulty,impressions,clicks,ctr,avg_position,trend_delta,trend_window,confidence,evidence_use,allowed_public_use,raw_path,notes
```

Column rules:

- `query` preserves the source wording when possible.
- `normalized_query` is lowercase, trimmed, whitespace-normalized, and stripped of trailing punctuation.
- `canonical_query_key` removes stopwords only when doing so does not change meaning.
- `intent` describes the job behind the query, not just the wording.
- `confidence` is `high`, `medium`, or `low`.
- `evidence_use` must be `discovery_only`.
- `allowed_public_use` must be `none`, `topic_direction`, `section_direction`, or `refresh_direction`.
- Reddit and manual AI prompt rows must use `allowed_public_use: none`.
- Manual Reddit capture rows must use `source_type: reddit_manual_capture`, must come from sanitized `imports/reddit-manual-captures/*.csv` files, and must not contain usernames, authors, full post bodies, or raw comments.

## Dedupe Rules

Create `dedupe-map.csv` after normalization and before clustering.

Required columns:

```text
duplicate_id,canonical_query_id,duplicate_query_id,match_type,match_confidence,merge_decision,reason,reviewer,reviewed_at
```

Exact duplicate:

- Same `normalized_query`, `country`, `language`, and materially same intent.
- Merge into the earliest canonical row.
- Preserve source diversity through `source_ids` in the cluster, not by keeping duplicate query rows active.

Near duplicate:

- Same answer would satisfy at least 80 percent of the searcher need.
- Minor grammar, singular/plural, stopword, or word-order differences.
- Merge only if intent, audience, and funnel stage match.

Semantic duplicate:

- Different wording but same job-to-be-done and same expected answer format.
- Merge after manual review.
- Keep the clearest, most natural buyer wording as canonical.

Do not dedupe when:

- One query is a definition and the other is a how-to.
- One query asks for examples and the other asks for a framework.
- One query is brand-specific and the other is category-level.
- One query asks for a comparison and the other asks for a recommendation.
- One query has a different buyer, team, channel, metric, or workflow.
- The merge would hide a source gap, legal risk, or important objection.

Tie breakers for canonical query:

1. Direct GSC query for an existing relevant page.
2. Clear buyer language from a compliant export.
3. Multi-source support across at least two source types.
4. Stronger match to an existing pillar or packet.
5. Clearest phrasing for a human H2 or FAQ.

## Cluster Rules

Create `query-clusters.yaml` from canonical query rows only. Retain deduped source support in each cluster.

Cluster by semantic intent, not keyword overlap.

One cluster should have:

- A single buyer job-to-be-done.
- One dominant intent.
- One recommended answer format.
- One primary audience.
- A clear pillar and topic mapping.
- A source-readiness status.
- A decision: `create_packet`, `refresh_packet`, `map_as_section`, `map_as_faq`, `monitor`, or `reject`.

Split clusters when:

- The best answer needs a different page type.
- The buyer is different.
- The funnel stage is different.
- The query requires different evidence.
- The query points to a different product, channel, competitor, or metric.
- A cluster contains more than one primary decision.

Merge clusters when:

- The same article section would answer both.
- The same source gaps and SME questions apply.
- The same primary query could represent the cluster without losing intent.

Cluster confidence:

- `high`: supported by GSC or at least two independent discovery source types, with clear business relevance.
- `medium`: supported by one strong source type or multiple weak observations.
- `low`: inferred from Reddit or AI prompt data only, or missing source diversity.

Discovery-only clusters cannot be promoted directly to a content packet. They must be validated through GSC, Bing Webmaster Tools, manual Google Trends CSV/API exports, customer-safe first-party performance data, or another approved demand source before packet intake. Manual Reddit captures, AnswerThePublic, PAA, autocomplete, ChatGPT, AI-search prompts, and generic question-expansion exports remain discovery only unless a reviewer separately validates demand through an approved demand source. SERP observations can shape source gaps and answer format, but they still need a validated demand source before drafting.

## Daily Rollup

`daily-discovery-rollup.md` should summarize:

- Inputs collected and missing lanes.
- New canonical queries.
- Rising GSC queries.
- Notable Google Trends movement.
- Repeated Reddit pain language, marked discovery only.
- Manual AI prompt observations, marked discovery only.
- Clusters created, changed, merged, split, monitored, or rejected.
- Packet candidates and why they passed or failed handoff.
- Source gaps and SME questions.
- QA notes confirming discovery-only data was not moved into evidence artifacts.

## Brief Handoff Candidates

`brief-handoff-candidates.yaml` is the only daily artifact that can feed topic triage.

Each candidate must include:

- `candidate_id`
- `cluster_id`
- `recommended_title`
- `slug_candidate`
- `primary_query`
- `secondary_queries`
- `aeo_question`
- `pillar_id`
- `topic_id`
- `recommended_asset`
- `decision`
- `cluster_confidence`
- `discovery_sources`
- `excluded_sources_for_evidence`
- `source_gaps`
- `sme_questions`
- `internal_links`
- `reason_to_create_or_refresh`
- `reason_to_wait`

Every candidate must explicitly list Reddit and manual AI prompt sources under `excluded_sources_for_evidence` when those sources influenced the cluster.

## QA Checklist

Before closing a daily run:

- `source-manifest.json` validates against `docs/seo-aeo/schemas/discovery-source-manifest.schema.json`.
- `normalized-discovery-queries.csv` follows `docs/seo-aeo/schemas/normalized-discovery-query.schema.json` field rules.
- `query-clusters.yaml` follows `docs/seo-aeo/schemas/query-clusters.schema.json`.
- `daily-discovery-rollup.md` follows `docs/seo-aeo/schemas/daily-discovery-rollup.schema.json` content expectations.
- Every row has `evidence_use: discovery_only`.
- Reddit and manual AI prompt rows have `allowed_public_use: none`.
- Manual Reddit capture imports, when present, come only from `imports/reddit-manual-captures/*.csv`, use `capture_method=manual_capture_no_api`, and contain no usernames, authors, full post bodies, or raw comments.
- Manual Reddit capture rows did not validate demand, validate facts, or unlock packet intake without separate validated demand and source readiness.
- No Reddit, forum, or AI output was copied into `citations.json`.
- No discovery row was used to support a factual claim.
- No analytics CSVs or connector scripts were modified.
- Missing input lanes are documented.
