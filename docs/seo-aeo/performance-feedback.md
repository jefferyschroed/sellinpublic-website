# Performance Feedback

Research date: 2026-06-17

This file defines the post-publish feedback loop for Sell In Public SEO, AEO, and distribution performance. The goal is to turn real performance signals into editorial decisions without inventing metrics, overreacting to noise, or letting automation publish changes directly.

## Core Rule

Analytics artifacts are evidence logs, not strategy docs. Keep each row factual, dated, and traceable to a source export, manual capture, or approved reviewer note.

Header-only CSVs prove schema readiness only. They do not prove analytics readiness, score readiness, or decision readiness.

Do not enter placeholder metrics. If a metric is not available, leave the field blank and explain the gap in `notes` only when it affects a decision.

Every imported or manual row needs provenance. Use the structured provenance fields where available:

- `source_export_id`
- `source_file`
- `property_id`
- `timezone`
- `captured_by`
- `reviewed_by`

For `content_decisions.csv`, use `source_export_ids` to list the exports or logs that support the decision.

Signal-bearing rows need identity, a real metric or observation, and provenance. Decision-grade rows also need reviewer attribution.

## Artifacts

| Artifact | Grain | Primary sources | Use |
|---|---|---|---|
| `analytics/page_daily.csv` | One page per day | GA4, Google Search Console, Bing Webmaster Tools exports or optional API, AI citation log, distribution log | Page-level scorecard for traffic, search visibility, engagement, conversions, and citation movement. |
| `analytics/search_query_daily.csv` | One query, page, source, device, and country per day | Google Search Console, Bing Webmaster Tools exports or optional API | Query movement, intent changes, SERP feature notes, and page-level content actions. |
| `analytics/ai_citation_log.csv` | One query capture per AI surface | Manual checks, approved exports, Bing AI Performance when available | Directional answer-engine visibility and answer accuracy tracking. |
| `analytics/distribution_daily.csv` | One distributed post or campaign per day | LinkedIn, email, CRM, analytics UTMs | Promotion performance, buyer engagement, and sales-assisted learning. |
| `analytics/content_decisions.csv` | One editorial decision per page or topic | Weekly scorecards, query data, citation log, distribution data, sales feedback | Approved keep, update, expand, merge, retire, or monitor decisions. |

## Update Cadence

Daily when active promotion is running:

- Update `distribution_daily.csv` for each live post, email, or campaign.
- Add notable comments, sales replies, or source gaps in `notes`.

Weekly:

- Export page metrics into `page_daily.csv`.
- Export query metrics into `search_query_daily.csv`.
- Capture the fixed AI citation query set in `ai_citation_log.csv`.
- Review movement and anomalies before recommending changes.

Monthly:

- Convert repeated weekly signals into rows in `content_decisions.csv`.
- Decide whether each priority page should be kept, updated, expanded, merged, retired, or monitored.
- Carry approved updates back into the relevant content packet or refresh notes before editing a published page.

## Page Daily Rules

Use `analytics/page_daily.csv` for page-level trend monitoring.

Required identifiers:

- `date`
- `page_url`
- `slug`
- `page_type`
- `publish_date`

Metric rules:

- GA4 fields should come from the same property and timezone each week.
- Search fields should use canonical page URLs where possible.
- `ai_citations` should count only confirmed Sell In Public citations from `ai_citation_log.csv`.
- `distribution_clicks` should include only clicks attributable through UTMs or platform exports.
- Use `notes` for anomalies such as deploys, tracking issues, indexing delays, promotion spikes, or missing exports.

Query rows, AI citation observations, and distribution logs affect page scoring only after `scripts/seo-aeo/rollup-feedback-signals.mjs` derives provenance-preserving rows in `analytics/page_daily.csv`. Discovery logs are never factual evidence for public claims, and unreviewed API/source rows must keep `reviewed_by` blank after rollup.

## Scoring

Use scores only after real data is available. Leave score fields blank until the evidence window is sufficient for review.

The scoring script may populate scores for provenance-bearing page rows with real metric values. It must leave header-only files, placeholder rows, and rows without source provenance unscored.

### Content Health Score

`content_health_score` is a 100-point score:

| Component | Points | Inputs |
|---|---:|---|
| SEO | 30 | Search clicks, impressions, CTR, average position, query fit, and indexing status. |
| AEO | 25 | AI citations, answer accuracy, citation quality, competitor citation gaps, and branded/source mentions. |
| Engagement | 20 | Engaged sessions, average engagement time, return visits, saves, shares, and useful comments. |
| Conversion or buyer signal | 15 | Qualified replies, leads, meetings, sales-assisted usage, or repeated buyer questions. |
| Freshness | 10 | Source recency, updated examples, stale claims, and last material refresh. |

Score each component on its point range using the evidence window and the page's job. A new page can receive a blank score until it has enough data.

Use this component scale:

- Full points: the signal is strong for the page's age, intent, and promotion level.
- About two-thirds: the signal is positive but uneven or narrow.
- About one-third: the signal exists but is weak, declining, or mismatched.
- Zero: the signal is absent, unverifiable, or negative.

Record the reasoning in `notes` or in the monthly decision row. Do not let one channel override all others without reviewer explanation.

### Refresh Priority Score

`refresh_priority_score` is a 100-point directional score. Use it to rank review work, not to auto-edit pages.

Add up to:

- Traffic opportunity: 25.
- Citation gap: 20.
- CTR gap: 20.
- Source staleness: 20.
- Conversion potential: 15.

Then subtract:

- Recent update penalty: 0 to 20.

Clamp the final value between 0 and 100.

Use this action guidance:

- `80-100`: investigate for refresh this week.
- `60-79`: queue for monthly review.
- `40-59`: monitor unless another business signal raises urgency.
- `<40`: no refresh action unless a source or accuracy issue exists.

Do not hard-code universal thresholds into writing skills. Thresholds can live in analytics review notes and should change as the site collects data.

## Search Query Rules

Use `analytics/search_query_daily.csv` to understand why a page is gaining or losing search visibility.

Use `docs/seo-aeo/templates/imports/search-query-export.csv` for normalized Search Console-style rows and `docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv` for Bing Webmaster/Search Performance exports before running the manual analytics importer.

Bing Webmaster API pulls are optional and run through `scripts/seo-aeo/pull-bing-webmaster.mjs` when configured. API-derived rows should use the same `source: bing_webmaster_tools` value, retain export/provenance fields, and never expose API keys or OAuth credentials in CSVs, packets, logs, or docs.

Recommended values:

- `source`: `google_search_console` or `bing_webmaster_tools`.
- `search_intent`: `definition`, `comparison`, `how_to`, `example`, `measurement`, `brand`, or `unknown`.
- `content_action`: `none`, `monitor`, `refresh`, `expand`, `merge`, `retire`, or `needs_review`.

Action-worthy query movement includes:

- A priority query crossing positions 20, 10, or 3.
- Rising impressions with weak CTR.
- Ranking on an unintended page.
- Queries that expose missing definitions, examples, comparisons, or FAQs.
- Queries that bring traffic but no qualified engagement.

## AI Citation Rules

Use `analytics/ai_citation_log.csv` as a directional visibility record. AI citation checks are volatile, so do not treat one capture as proof of durable visibility.

Capture the same query packet consistently across approved surfaces. Do not scrape or automate surfaces in ways that violate platform terms.

Recommended values:

- `surface`: `chatgpt`, `perplexity`, `gemini`, `google_ai_overview`, `bing_copilot`, `claude`, or the approved export name.
- `answer_accuracy`: `accurate`, `partly_accurate`, `inaccurate`, `not_applicable`, or `needs_review`.
- `is_sell_in_public`: `true` when the cited URL is a Sell In Public page, otherwise `false`.

Escalate when:

- Sell In Public is cited but the answer misstates the category, offer, or recommendation.
- Competitors are cited for a query the site should own.
- The answer uses an angle that the current page does not address.
- A page is cited for a risky or unsupported claim.

## Distribution Rules

Use `analytics/distribution_daily.csv` to connect content promotion to qualified learning, not just reach.

Recommended values:

- `channel`: `linkedin`, `email`, `sales_outreach`, `community`, `partner`, `organic_social`, or `other`.
- UTM fields should match the published link.
- `leads` and `meetings_booked` should be entered only when attribution is visible in CRM or manually approved.
- `next_action` should stay practical: follow up, reuse angle, update CTA, answer objection, create follow-up, or monitor.

## Content Decision Rules

Use `analytics/content_decisions.csv` only after there is enough evidence to justify an editorial decision.

Daily automation also runs `scripts/seo-aeo/check-analytics-feedback.mjs`. That script creates a temporary workspace with synthetic reviewed rows and proves the scoring/decision machinery can produce `keep`, `refresh`, and `expand` recommendations without writing fake rows into production analytics. Treat it as a process health check only; it does not replace real GA4, Search Console, Bing, AI citation, or distribution evidence.

Minimum automation gate before generating a proposed decision:

- At least two reviewed, provenance-bearing, signal-bearing rows for the page.
- At least two distinct evidence dates in the window.
- At least one `source_export_id` or `source_file` across the supporting rows.
- A populated `reviewed_by` value on each supporting page row.
- A content health score or refresh priority score from the eligible evidence.

Do not generate a proposed decision from header-only analytics files, a single sparse row, unreviewed rows, or rows that only contain placeholders.

Allowed decisions:

- `keep`: The page is performing its job and needs no material change.
- `update`: The page needs revised claims, examples, sources, CTA, structure, or metadata.
- `refresh`: The page needs a material refresh based on search, citation, engagement, source, or buyer-signal movement.
- `expand`: The page deserves more depth or supporting sections.
- `merge`: The page overlaps with another page and should be consolidated.
- `retire`: The page no longer fits the strategy or creates risk.
- `investigate`: The evidence is strong enough to assign a review, but the exact edit is not yet known.
- `monitor`: Evidence is directional but not strong enough for a material change.

Every decision needs:

- A stable `decision_id`.
- An evidence window.
- Source provenance.
- Reviewer attribution.
- `content_health_score` when available.
- `refresh_priority_score` when available.
- A primary signal.
- A reason.
- A recommended action.
- An owner.

Decision lifecycle fields:

- `decision_id` is the stable key for a page plus decision type. Repeated runs update that lifecycle row instead of creating disconnected daily recommendations.
- `first_seen_date` is the first date the recommendation appeared and should not move.
- `last_seen_date` updates when the same recommendation is seen again.
- `evidence_signature` records the supporting evidence shape. A materially changed signature needs owner review before an old approval is treated as still valid.
- `status` is the approval state: `proposed`, `approved`, `accepted`, or `owner_approved` can be active; rejected or superseded statuses are not active.
- `outcome` is execution state: blank means open, while `completed`, `closed`, `superseded`, `rejected`, or `no_action` removes the row from active routing.
- `supersedes_decision_id` links a newer recommendation to the prior decision it replaces. The generator may add the link, but it must not silently approve the newer recommendation.

Skill or SOP learning from performance data must use the `learning_candidate` format in `daily-operating-system.md` and pass:

```sh
node scripts/seo-aeo/check-skill-learning.mjs --file <candidate-file>
```

Do not send a skill-learning candidate for a single volatile QA finding, one AI citation capture, one distribution spike, or a threshold preference. Route those as `monitor` or a no-action note unless repeated evidence shows a reusable process gap.

Manual approval is required before published content, redirects, canonical tags, or metadata are changed.

## Weekly Review Checklist

- Confirm exports are from the expected date range.
- Check for deploys, outages, tracking changes, and indexing delays before interpreting movement.
- Separate page performance from query performance.
- Compare distribution spikes against search and engagement data.
- Review AI citation captures for accuracy before chasing visibility.
- Log only action-worthy recommendations in `content_decisions.csv`.
- Before approval, compare `evidence_signature`, `first_seen_date`, `last_seen_date`, `source_export_ids`, and `reviewed_by`; preserved approvals must not silently approve materially changed evidence.

## Monthly Retro Checklist

- Identify pages with durable growth, durable decline, or repeated buyer signal.
- Check whether search demand, AI citation behavior, and distribution response point to the same lesson.
- Approve keep, update, expand, merge, retire, or monitor decisions.
- Assign owners and due dates for approved changes.
- Send approved refresh work back through the source, QA, and publish gates.
