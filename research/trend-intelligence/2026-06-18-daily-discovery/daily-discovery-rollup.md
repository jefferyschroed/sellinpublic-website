# Daily Discovery Rollup

Run: `2026-06-18-daily-discovery`

Rule: Discovery data is not factual evidence. Reddit, public feeds, Google Trends RSS, manual AI prompt exports, autocomplete, PAA, and query exports are discovery only unless a separate validated-demand import explicitly qualifies them for planning gates.

## Inputs

| Source type | Status | Artifact | Notes |
|---|---|---|---|
| gsc_emerging_query_export | missing | `analytics/search_query_daily.csv; imports/query-exports/*gsc*.csv` | Automated when GSC credentials are configured; normalized manual GSC imports can also flow here. |
| manual_ai_prompt_export | present | `analytics/ai_citation_log.csv; imports/ai-query-observations/*.csv` | Manual AI citation and approved sanitized AI-query observations only. |
| manual_serp_observation | missing | `imports/serp-observations/*.csv` | Manual SERP/PAA/AEO observations; discovery only. |
| manual_topic_seed | present | `imports/topic-seeds/*.csv` | Editorial topic seeds; cannot validate demand alone. |
| reddit_manual_capture | missing | `imports/reddit-manual-captures/*.csv` | Manual sanitized Reddit observations only; no API use, no usernames or raw comments, and no demand/factual validation. |
| answer_the_public_export | missing | `imports/query-exports/*answer-the-public*.csv` | AnswerThePublic query exports are discovery-only by default and cannot unlock ready handoff alone. |
| bing_webmaster_query_export | missing | `analytics/search_query_daily.csv; imports/query-exports/*bing*.csv` | Bing Webmaster API rows or reviewed query exports; validated demand for discovery and refresh prioritization only. |
| other_query_tool_export | missing | `imports/query-exports/*.csv` | Ahrefs, Semrush, AlsoAsked, or similar query-tool exports count as validated demand only when explicitly reviewed. |
| public_source_trend_export | present | `imports/trends/*public-trends*.csv; imports/trends/*rss*.csv` | Automated public RSS/Atom/JSON feed headline captures, including Google Trends RSS; source leads only, not validated demand. |
| google_trends_csv_export | present | `imports/trends/*.csv; imports/query-exports/*google-trends*.csv` | Google Trends CSV/UI exports only; RSS/feed captures stay public_source_trend_export. |

## Summary

- Normalized discovery rows: 372
- Unique source types: 4
- Clusters: 47
- Handoff status: ready

## Cluster Changes

| Cluster | Decision | Summary |
|---|---|---|
| cluster-001-topic-egc-definition | monitor | what is employee-generated content |
| cluster-002-topic-measure-egc-beyond-impressions | monitor | measure employee-generated content beyond impressions |
| cluster-003-topic-egc-vs-advocacy | monitor | employee-generated content vs employee advocacy |
| cluster-004-topic-turn-employee-expertise-into-p | map_as_section | How do you turn employee expertise into useful LinkedIn posts? |
| cluster-005-topic-egc-examples | monitor | What are good examples of employee-generated content in B2B? |
| cluster-006-topic-clay-lovable-gitlab | monitor | What can B2B teams learn from Clay, Lovable, and GitLab's public content loops? |
| cluster-007-topic-linkedin-content-infrastructur | monitor | How should B2B sales teams build LinkedIn content infrastructure? |
| cluster-008-pillar-employee-generated-content-ve | monitor | sales outreach tools that integrate with your crm our favorite picks for 2026 |
| cluster-009-pillar-employee-generated-content-ot | monitor | future of ai in customer relationship management what s coming next |
| cluster-010-pillar-employee-generated-content-ot | monitor | real ai crm use cases driving revenue growth in 2025 |
| cluster-011-pillar-employee-generated-content-ve | monitor | 5 best ai crms for real estate agents the 2026 roundup |
| cluster-012-pillar-employee-generated-content-de | monitor | what is an ai agent a plain-english guide |
| cluster-013-pillar-employee-generated-content-ot | monitor | 10 seo trends i ve seen firsthand in 2026 with data |
| cluster-014-pillar-employee-generated-content-ot | monitor | why category entry points belong in every ai search strategy |
| cluster-015-pillar-linkedin-led-gtm-how-to-prove | monitor | how to prove incremental marketing impact with linkedin s new tools |
| cluster-016-pillar-employee-generated-content-ot | monitor | automated seo what it is and how it works in 2026 |
| cluster-017-topic-content-review-without-killing | monitor | How should teams review employee-generated content without making it generic? |
| cluster-018-topic-should-every-employee-post | monitor | Should every employee post on LinkedIn? |
| cluster-019-pillar-measurement-learning-measurem | monitor | 9 ways to improve seo rankings and traffic |
| cluster-020-pillar-employee-generated-content-ho | monitor | a new guide how to prove the value of b2b marketing |

## Source Gaps

- Every candidate requires approved factual sources before drafting public claims.

## QA

- [x] Every normalized row uses `evidence_use: discovery_only`.
- [x] Reddit rows use `allowed_public_use: none`.
- [x] Manual AI prompt rows use `allowed_public_use: none`.
- [ ] Downstream claim ledgers and `citations.json` still require separate Source Registry and Claim Ledger QA before drafting or publishing.
- [ ] This rollup does not prove that discovery sources were excluded from future factual claims; it only records discovery-lane boundaries for this run.
- [x] Analytics CSVs were read but not edited.
