# SEO/AEO Data Pipeline

Research date: 2026-06-18

This file documents the local daily data pipeline for SEO, AEO, trend discovery, analytics scoring, and content planning.

## Core Rule

Data pull scripts collect signals. They do not publish content, approve claims, or create factual evidence by themselves.

Analytics data can support performance decisions. Google Search Console rows are first-party validated demand when they enter discovery as `gsc_emerging_query_export`, but they still do not prove article facts. Article claims require approved source evidence in packet citations. AnswerThePublic, AlsoAsked, People Also Ask, autocomplete, AI answer observations, sanitized AI prompt observations, sanitized manual Reddit captures, manual topic seeds, and public feed captures are discovery-only routing inputs; a separate validated demand source is required to unlock intake. Google Trends CSV/API exports can validate demand for intake; Google Trends RSS rows remain discovery-only feed captures and still cannot support article claims.

## Setup Files

Tracked:

- `.env.example`
- `config/seo-aeo.config.example.json`
- `scripts/seo-aeo/*.mjs`
- `analytics/*.csv`

Local only:

- `.env`
- `config/seo-aeo.config.json`
- `secrets/google-service-account.json`
- `secrets/google-oauth-client.json`
- `secrets/google-oauth.json`
- `automation-runs/`

## Required Values

GA4:

- `GA4_MEASUREMENT_ID`: public Google tag ID. Current value: `G-QCYHK55RCG`.
- `GA4_PROPERTY_ID`: numeric GA4 property ID for the Data API. Current value: `542210968`. This is not the web stream ID.
- `GOOGLE_APPLICATION_CREDENTIALS`: path to a service-account JSON file with access to the GA4 property, only needed for automated pulls when service-account keys are allowed.
- `GOOGLE_OAUTH_CREDENTIALS`: path to an OAuth authorized-user JSON file, used when service-account keys are blocked by Google Cloud policy.

Google Cloud Console is only needed for automated API access. The public Google tag can be installed with the Measurement ID alone.

Google Search Console:

- `GSC_SITE_URL`: property string, such as `sc-domain:sellinpublic.co` or `https://sellinpublic.co/`.
- `GOOGLE_APPLICATION_CREDENTIALS`: service-account JSON file with Search Console read access.
- `GOOGLE_OAUTH_CREDENTIALS`: OAuth authorized-user JSON file with Search Console readonly scope.
- `GSC_VERIFICATION_TOKEN`: optional URL-prefix meta verification token if Jeff chooses that verification method.

Current local state as of 2026-06-18: ignored local OAuth credentials verify GA4 property `542210968` plus Search Console access for `sc-domain:sellinpublic.co` under the approved owner account. Keep that credential local and out of git.

Bing Webmaster Tools, optional:

- Manual Bing Webmaster/Search Performance exports are supported today through `imports/query-exports/`.
- `scripts/seo-aeo/pull-bing-webmaster.mjs` can pull Bing Webmaster `GetQueryStats` rows when `BING_WEBMASTER_API_KEY` and `BING_WEBMASTER_SITE_URL` are configured.
- Treat any Bing API key, OAuth client secret, access token, or refresh token as a secret. Do not commit it.
- Bing query rows can validate demand and support refresh decisions after review. They cannot serve as factual article evidence.

Reddit API, intentionally disabled/not planned:

- `SEO_AEO_REDDIT_ENABLED=false`

Do not request Reddit API credentials, enable Reddit API pulls, or schedule Reddit API discovery in the current operating model.

Manual Reddit captures, if owner-approved, use only the sanitized no-API lane at `imports/reddit-manual-captures/*.csv` and the template `docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv`. Rows must set `source_type=reddit_manual_capture`, `capture_method=manual_capture_no_api`, `evidence_use=discovery_only`, and `allowed_public_use=none`. They must not contain usernames, authors, full post bodies, or raw comments.

ChatGPT and AI answer captures, manual only:

- Do not use unofficial ChatGPT network scraping or browser traffic capture.
- Use only owner-approved manual/sanitized AI observations or official exports where terms allow.
- Treat AI answers as discovery or citation-monitoring inputs, not demand validation or factual evidence.

Google Trends RSS:

- `SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED=false`

The Google Trends RSS puller uses the official public RSS endpoint configured under `googleTrendsRss.endpoint`. It does not need Google credentials and must stay disabled until the include/exclude filters are reviewed for the current content lane.

## Commands

Audit local readiness before pulling data or generating from packets:

```sh
node scripts/seo-aeo/audit-readiness.mjs
```

Optional modes:

```sh
node scripts/seo-aeo/audit-readiness.mjs --json
node scripts/seo-aeo/audit-readiness.mjs --skip-packet-validation
node scripts/seo-aeo/audit-readiness.mjs --fail-on-blocker
```

The readiness audit checks sample setup files, optional local config, GA4/GSC/Bing/Reddit environment values, Google credential file existence when configured, blog/sitemap/feed output, analytics and packet directories, and strict packet validation through `scripts/blog-orchestrator.mjs validate`. Missing credentials are reported as `warn`, not hard failures.

When service-account keys are blocked by Google Cloud policy, create a local OAuth client secret at `secrets/google-oauth-client.json`, then initialize the authorized-user credential:

```sh
node scripts/seo-aeo/init-google-oauth.mjs --client secrets/google-oauth-client.json --out secrets/google-oauth.json --expected-email <approved-owner-email>
```

The OAuth flow requests OpenID email only to verify the signed-in Google account, plus Analytics readonly and Search Console readonly scopes for reporting. Pass the approved owner email with `--expected-email`, validate OAuth `state`, write the authorized-user credential to an ignored local path with `0600` permissions, and refuse to write credentials if the authorized Google account does not match. The generated file contains a refresh token and must stay out of git.

After credentials exist, run a live access smoke check:

```sh
node scripts/seo-aeo/check-google-credentials.mjs
```

That check refreshes a token, verifies the required scopes, checks GA4 metadata access for the configured property, and checks Search Console access for the configured property.

Install GA4/GSC tags after IDs exist:

```sh
node scripts/seo-aeo/install-google-tags.mjs --dry-run
node scripts/seo-aeo/install-google-tags.mjs
```

Pull GA4 page metrics:

```sh
node scripts/seo-aeo/pull-ga4.mjs --date 2026-06-14
node scripts/seo-aeo/pull-ga4.mjs --lookback-days 7 --lag-days 3
```

Pull Google Search Console query metrics:

```sh
node scripts/seo-aeo/pull-gsc.mjs --date 2026-06-14
node scripts/seo-aeo/pull-gsc.mjs --lookback-days 7 --lag-days 3
```

This writes normalized first-party Search Console rows to `analytics/search_query_daily.csv`. `build-discovery-run.mjs` reads those rows as `gsc_emerging_query_export`, which can validate actual search demand for prioritization and intake gates. It still cannot replace source evidence for article claims.

Diagnose zero-row GA4/GSC states without writing analytics rows:

```sh
node scripts/seo-aeo/diagnose-measurement-signals.mjs --run-date 2026-06-17 --lookback-days 7 --lag-days 3
```

This writes `automation-runs/<date>/measurement-diagnostics.json` and `.md`. Use it to distinguish verified-empty windows from wider-window issues, recent Search Console finalization lag, and measurement configuration risk.

Pull optional Bing Webmaster query metrics after a verified site URL and API key are configured:

```sh
node scripts/seo-aeo/pull-bing-webmaster.mjs --date 2026-06-14
node scripts/seo-aeo/pull-bing-webmaster.mjs --lookback-days 7 --lag-days 3
```

If Bing API credentials are not configured, use manual Bing Webmaster/Search Performance exports with `docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv` and place reviewed files under `imports/query-exports/`.

The daily runner includes the official Google Trends RSS lane after the disabled Reddit lane and before broader public-feed discovery. The local config keeps `googleTrendsRss.enabled` false by default, so the controller records a clean skipped step unless a reviewed config change or one-off env var enables it.

Dry-run the official Google Trends RSS discovery pull, only after reviewing `googleTrendsRss` filters:

```sh
SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED=true node scripts/seo-aeo/pull-google-trends-rss.mjs --date 2026-06-17 --dry-run
```

Write a Google Trends RSS import CSV after the dry run looks relevant, either with `googleTrendsRss.enabled=true` in local config or with an explicit one-off env enable:

```sh
SEO_AEO_GOOGLE_TRENDS_RSS_ENABLED=true node scripts/seo-aeo/pull-google-trends-rss.mjs --date 2026-06-17
```

Reddit API discovery is not part of the current pipeline. Do not run `scripts/seo-aeo/pull-reddit-trends.mjs` or request Reddit credentials.

For manual Reddit discovery, place only sanitized no-API CSV captures under `imports/reddit-manual-captures/` using `docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv`. This docs/template lane is for discovery language only. It cannot validate demand, validate facts, create citations, or unlock packet intake unless the same candidate also has separate validated demand and source readiness.

Drop manually reviewed query exports directly into `imports/query-exports/` only when they are already owner-reviewed and not part of an active demand-import pack. Use this folder for Search Console-style exports, Bing Webmaster query exports, and separately validated query-tool exports. Set Search Console export rows to a clear GSC source such as `google_search_console`; after import they land in `analytics/search_query_daily.csv` and are read by discovery as `gsc_emerging_query_export`. The Bing API pull writes normalized Bing query rows separately, but this manual export path stays supported. AnswerThePublic, AlsoAsked, PAA, autocomplete, approved manual/sanitized AI observations, and similar question-expansion exports can also be imported for discovery, but they remain discovery-only; separate GSC, Bing, Trends, or reviewed demand data must carry demand validation. The old `import-query-export.mjs` helper is for ad hoc normalization experiments; it is not part of the daily runner and should not be used as the daily handoff source.

For active demand-import packs, do not manually move reviewed files into `imports/`. Put raw reviewed exports under `imports/` or `research/`, normalize them into the matching staging CSV, then let the promotion runner copy valid rows into `imports/`:

```sh
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --apply
```

Current demand-import packs support first-party GSC demand as `gsc_search_query_export`, plus `google_trends_csv_export`, `bing_webmaster_query_export`, and reviewed generic query tools. Use `gsc_search_query_export` for reviewed Search Console exports staged through the active demand pack. Search Console OAuth pulls already present in `analytics/search_query_daily.csv` and promoted `gsc_search_query_export` files both enter discovery as `gsc_emerging_query_export`. Use `reviewed_generic_query_tool_export` only for non-first-party query tools whose rows have a separate validation source and reviewer.

The daily discovery bridge and documented manual discovery lanes use approved CSVs from repo-local import folders. Use the templates in `docs/seo-aeo/templates/imports/` and place files under:

- `imports/query-exports/*.csv`
- `imports/trends/*.csv`
- `imports/reddit-manual-captures/*.csv`
- `imports/ai-query-observations/*.csv`
- `imports/serp-observations/*.csv`
- `imports/topic-seeds/*.csv`

Manual topic seeds, manual SERP/PAA/AEO observations, autocomplete captures, AnswerThePublic/AlsoAsked-style question expansion, approved sanitized AI-query observations, and sanitized manual Reddit captures are discovery-only by default. They can route subagents and source-gap work, but the separate validated demand signal must come from GSC (`gsc_emerging_query_export`), Bing Webmaster Tools, manual Google Trends CSV/API exports, first-party performance data, or a separately reviewed query/trend export.

Manual Reddit capture files must use `source_type=reddit_manual_capture`, `capture_method=manual_capture_no_api`, `evidence_use=discovery_only`, and `allowed_public_use=none`. Do not include usernames, authors, full post bodies, raw comments, private details, or confidential company references. Keep only sanitized summaries and implied buyer-language queries needed for discovery.

The official Google Trends RSS pull writes `imports/trends/<date>-google-trends-rss.csv` with `source: google_trends_rss`. `build-discovery-run.mjs` imports it as `public_source_trend_export`, not validated demand. The RSS trend label and linked news cards remain discovery-only and must not be cited as factual evidence.

Build the daily trend/query discovery bridge from approved exports and analytics rows:

```sh
node scripts/seo-aeo/build-discovery-run.mjs --date 2026-06-17
```

This writes `research/trend-intelligence/<date>-daily-discovery/` every day. It writes a compatible `research/query-intelligence/<date>-daily-discovery/` run only when normalized discovery rows produce at least one non-monitor handoff candidate. Empty-input and monitor-only days do not create a new query-intelligence run, so they cannot accidentally unlock packet intake from a previous handoff.

The daily runner validates only the current date's `research/query-intelligence/<date>-daily-discovery/` folder. If no current folder exists, it records the current `brief-handoff-candidates.yaml` status and intentionally ignores historical query-intelligence folders for packet intake.

Validate a query-intelligence run folder before packet intake:

```sh
node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/2026-06-17-employee-generated-content
node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/2026-06-17-employee-generated-content --json
node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/2026-06-17-employee-generated-content --require-handoff-ready
```

Validate packet stages:

```sh
node scripts/blog-orchestrator.mjs validate --stage intake content-packets/<packet>/
node scripts/blog-orchestrator.mjs validate --stage research content-packets/<packet>/
node scripts/blog-orchestrator.mjs validate --stage outline content-packets/<packet>/
node scripts/blog-orchestrator.mjs validate --stage draft content-packets/<packet>/
node scripts/blog-orchestrator.mjs validate --stage publish content-packets/<packet>/
```

Import manual analytics, Search Console-style query rows, AI citation logs, and distribution exports:

```sh
node scripts/seo-aeo/import-analytics-exports.mjs --date 2026-06-17
```

Accepted folders:

- `imports/analytics/*.csv`
- `imports/query-exports/*.csv`
- `imports/ai-citations/*.csv`
- `imports/distribution/*.csv`

For query imports, start from `docs/seo-aeo/templates/imports/search-query-export.csv` for normalized Search Console-style rows or `docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv` for Bing Webmaster/Search Performance rows. For GSC, use `source=google_search_console` or another clear Search Console source label so the discovery bridge treats the imported rows as `gsc_emerging_query_export`. Use `docs/seo-aeo/templates/imports/generic-query-tool-export.csv` for reviewed non-first-party query-tool exports and `docs/seo-aeo/templates/imports/google-trends-export.csv` for manually normalized Google Trends CSV rows.

Discovery-only folders such as `imports/trends/*.csv`, `imports/reddit-manual-captures/*.csv`, `imports/ai-query-observations/*.csv`, `imports/serp-observations/*.csv`, and `imports/topic-seeds/*.csv` belong to the discovery workflow, not `import-analytics-exports.mjs`.

Roll up query, AI citation, and distribution lanes into page-level feedback:

The fixed AI citation denominator lives at `docs/seo-aeo/ai-citation-query-set.json`. After importing reviewed AI/search citation observations, run:

```sh
node scripts/seo-aeo/check-ai-citation-query-set.mjs --date 2026-06-17
node scripts/seo-aeo/write-ai-citation-capture-pack.mjs --date 2026-06-17
```

This writes `automation-runs/<date>/ai-citation-query-set-check.json` and `.md`, including expected captures, reviewed captures, missing captures, extra observations, and coverage percentage. It also writes `ai-citation-capture-pack.csv`, `ai-citation-capture-pack.md`, and `ai-citation-import-skeleton.csv` so the missing/stale/unreviewed query-surface pairs can be completed without guessing. Citation rows are visibility/accuracy monitoring inputs; they do not validate demand or support factual article claims.

```sh
node scripts/seo-aeo/rollup-feedback-signals.mjs --date 2026-06-17
node scripts/seo-aeo/check-feedback-rollup.mjs
```

This writes derived rows to `analytics/page_daily.csv` from real existing source rows only. Reviewed source rows can become page-level reviewed evidence; unreviewed API or imported rows keep `reviewed_by` blank so they cannot become decision-grade content evidence by accident.

Score analytics rows:

```sh
node scripts/seo-aeo/score-analytics.mjs
```

Check packet source URLs:

```sh
node scripts/seo-aeo/check-sources.mjs --date 2026-06-17
```

Sync analytics into packet-local `performance-log.csv` files:

```sh
node scripts/seo-aeo/sync-packet-performance.mjs
```

Generate proposed content decisions:

```sh
node scripts/seo-aeo/generate-content-decisions.mjs
node scripts/seo-aeo/check-content-decision-lifecycle.mjs
```

Generated decisions use stable `decision_id` lifecycle rows. Automation may update `last_seen_date` and evidence fields, but human-controlled approval fields, due dates, outcome fields, packet paths, refresh-note paths, and notes must be preserved. A changed `evidence_signature` needs owner review before an existing approval is treated as still valid.

Plan daily content candidates and subagent assignments:

```sh
node scripts/seo-aeo/plan-content.mjs --date 2026-06-17
```

Build the demand import worklist for candidates blocked by query-handoff or validated-demand gaps:

```sh
node scripts/seo-aeo/build-demand-import-worklist.mjs --date 2026-06-17
```

This writes `research/daily-content-plan/<date>/demand-import-worklist.csv`, `.json`, and `.md`. The file tells the Query Intelligence Agent which validated-demand imports are needed before packet intake can become ready. Each request includes `import_rank`, `primary_recommended_import`, and `priority_reason` so the agent starts with the best available source instead of treating every import option equally. It does not create evidence, claims, packets, drafts, or posts.

Demand acquisition is source-first. Exact-query workers should use the requested reviewed export or verified first-party row set; they must not invent queries when no reviewed export exists. If GSC is the selected source, use existing OAuth-pulled `analytics/search_query_daily.csv` rows or stage a reviewed Search Console export as `gsc_search_query_export`.

Prepare header-only staging files for those requested imports:

```sh
node scripts/seo-aeo/prepare-demand-import-pack.mjs --date 2026-06-17
```

This writes `research/daily-content-plan/<date>/demand-import-pack/` with a README, manifest, review checklist, and header-only draft CSVs. These files stay outside `imports/` and are not evidence. Start with the row marked `primary_recommended_import: yes`; fill lower-ranked rows only when the primary source is unavailable, empty, or needs corroboration. Fill staging CSVs only with real reviewed export rows, preferably through `stage-reviewed-demand-export.mjs`, then let marker-approved `run-demand-promotion.mjs --apply` promote valid rows to the worklist's final `imports/` destinations.

Normalize a raw reviewed export into the target staging file:

```sh
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date 2026-06-17 --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date 2026-06-17 --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --apply
```

Dry-run validate the filled staging files before promotion:

```sh
node scripts/seo-aeo/run-demand-promotion.mjs --date 2026-06-17 --dry-run
```

Audit whether staged and already-promoted rows satisfy the hard prerequisites for a current query handoff:

```sh
node scripts/seo-aeo/audit-demand-readiness.mjs --date 2026-06-17
```

This writes `research/daily-content-plan/<date>/demand-readiness-preflight.json`, `.csv`, and `.md`. It checks projected row count, source-type diversity, and validated-demand rows before promotion. It does not promote files and does not prove the handoff will be ready; `build-discovery-run.mjs` must still rebuild clusters and produce at least one non-monitor handoff candidate.

Build the source-acquisition brief for the next exact export to fill:

```sh
node scripts/seo-aeo/build-demand-acquisition-brief.mjs --date 2026-06-17
```

This writes `research/daily-content-plan/<date>/demand-acquisition-brief.json` and `.md`. The brief is a handoff artifact for the Query Intelligence Agent or human operator: it names the selected candidate, staging CSV, final destination, allowed/disallowed sources, and strict demand-promotion commands. It does not create demand data or approve packet intake.

Only after the dry-run report has no blocked rows, promote valid non-empty staging files into their final `imports/` destinations, rebuild discovery, and validate the current handoff:

```sh
node scripts/seo-aeo/run-demand-promotion.mjs --date 2026-06-17 --apply --approval-marker DEMAND-PROMOTION-APPROVED:2026-06-17
```

The promotion runner writes `automation-runs/<date>/demand-promotion-report.json` and `.md`, and the underlying validator still writes `validation-report.json`, `.csv`, and `.md` inside the demand import pack. It does not create demand data, scaffold packets, generate pages, or publish content in plain apply mode. Header-only files remain `empty_staging`, and marker-approved `--apply` only copies rows that pass the source-specific checks.

Run scaffolded apply only after reviewing the plain apply report and receiving packet approval:

```sh
node scripts/seo-aeo/run-demand-promotion.mjs --date 2026-06-17 --apply --scaffold-limit 1
```

The lower-level validator remains available for debugging and supports strict gate flags:

- `--fail-on-blocked`
- `--fail-on-empty-staging`
- `--fail-on-none-valid`

Use these flags before promotion or generation so placeholder or header-only files cannot quietly pass as ready inputs.

Build a launchable subagent queue:

```sh
node scripts/seo-aeo/build-subagent-queue.mjs --date 2026-06-17
```

Build the next dependency-ready subagent dispatch batch:

```sh
node scripts/seo-aeo/build-subagent-dispatch.mjs --date 2026-06-17
node scripts/seo-aeo/build-subagent-dispatch.mjs --date 2026-06-17 --max 6 --candidate query-002
```

Check completed subagent handoff artifacts before depending on them:

```sh
node scripts/seo-aeo/check-subagent-artifacts.mjs --date 2026-06-17
```

This role/candidate check catches empty, unsafe, too-thin, or obviously mismatched handoffs. It is not a source, claim, draft, QA, generation, or publishing approval.

Build the daily gap ledger after candidate, worklist, and subagent artifacts change:

```sh
node scripts/seo-aeo/build-gap-ledger.mjs --date 2026-06-17
```

This writes `research/daily-content-plan/<date>/gap-ledger.csv`, `.json`, and `.md`. It aggregates candidate gates, demand-import requests, and blocker language from subagent artifacts. It is a routing ledger only; it does not approve evidence, unlock packet intake, or authorize drafting.

Run `node scripts/seo-aeo/resolve-refresh-targets.mjs --date <run-date>` before building or dispatching refresh work. This writes `refresh-targets.csv`, `.json`, and `.md`, mapping each refresh candidate to exactly one existing packet path or blocking it as ambiguous. Do not scaffold a replacement packet for a blocked refresh target. Gap-ledger artifact rows are lineage-aware: stale or mismatched filename/topic/topic_id artifacts are separated from active blockers and must be reconciled before subagent routing.

Operate the subagent task ledger:

```sh
node scripts/seo-aeo/subagent-queue.mjs list-ready --date 2026-06-17 --max 10
node scripts/seo-aeo/subagent-queue.mjs write-prompt query-002-00_orchestration-orchestrator --date 2026-06-17
node scripts/seo-aeo/subagent-queue.mjs claim query-002-00_orchestration-orchestrator --date 2026-06-17 --operator codex
node scripts/seo-aeo/subagent-queue.mjs complete query-002-00_orchestration-orchestrator --date 2026-06-17 --artifact research/daily-content-plan/2026-06-17/orchestrator-orchestration-query-002.md
node scripts/seo-aeo/subagent-queue.mjs block query-002-01_topic_authority-topic-cartographer --date 2026-06-17 --reason "Needs owner approval"
```

Write the daily Skill Steward closeout:

```sh
node scripts/seo-aeo/write-skill-steward-closeout.mjs --date 2026-06-17
```

Scaffold approved packet candidates for subagents:

```sh
node scripts/seo-aeo/scaffold-packets.mjs --from research/daily-content-plan/2026-06-17/topic-candidates.csv --limit 3
```

Run the full daily local pipeline:

Without a metrics override, the daily runner pulls a rolling seven-day finalized metrics window ending three days before the run.

```sh
node scripts/seo-aeo/daily-runner.mjs --date 2026-06-17
node scripts/seo-aeo/daily-runner.mjs --date 2026-06-17 --metrics-lookback-days 14 --metrics-lag-days 3
node scripts/seo-aeo/daily-runner.mjs --date 2026-06-17 --metrics-date 2026-06-14
node scripts/seo-aeo/daily-runner.mjs --date 2026-06-17 --metrics-start 2026-06-08 --metrics-end 2026-06-14
node scripts/seo-aeo/daily-runner.mjs --date 2026-06-17 --start 2026-06-08 --end 2026-06-14
```

For `daily-runner.mjs` and `content-runner.mjs`, `--start` and `--end` are aliases for `--metrics-start` and `--metrics-end`. The `--date` flag remains the run folder date.

Run the top-level daily controller. This is the preferred single local command for daily operation because it wraps the daily pipeline and also writes the content-run report:

```sh
node scripts/seo-aeo/content-runner.mjs --date 2026-06-17
node scripts/seo-aeo/content-runner.mjs --date 2026-06-17 --metrics-date 2026-06-14
```

Scaffold up to three candidate packets only after candidate review, plain demand-promotion report review when demand promotion was involved, and packet-scaffolding approval:

```sh
node scripts/seo-aeo/content-runner.mjs --date 2026-06-17 --scaffold-limit 3
```

Demand promotion apply is guarded by live deployment state. If `automation-runs/<date>/live-deployment-check.json` or `run-status.json` shows a blocked live deployment, `run-demand-promotion.mjs --apply` stops before copying import rows or rebuilding discovery. Resolve deployment first. If the owner explicitly defers the deployment blocker, include the exact marker shown by the dry-run/report:

```sh
node scripts/seo-aeo/run-demand-promotion.mjs --date 2026-06-17 --apply --approval-marker DEMAND-PROMOTION-APPROVED:2026-06-17 --live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:2026-06-17
```

Review the publish-governor plan:

```sh
node scripts/seo-aeo/publish-governor.mjs --date 2026-06-17
```

Write static output only for packets selected by the publish governor:

```sh
node scripts/seo-aeo/publish-governor.mjs --date 2026-06-17 --generate-approved
```

## Daily Runner Behavior

The daily runner executes:

1. GA4 page metric pull.
2. Search Console query pull.
3. Measurement diagnostics.
4. Search Console fallback query pull only when diagnostics prove wider finalized GSC rows exist.
5. Reddit discovery step, normally skipped because the Reddit API lane is disabled.
6. Public source discovery trend pull.
7. Manual export import.
8. Daily trend/query discovery bridge.
9. Query-intelligence validation for the current date's run folder.
10. Source URL checks.
11. Analytics scoring.
12. Packet performance-log sync.
13. Proposed content decision generation.
14. Daily content candidate planning.
15. Demand import worklist generation.
16. Demand import prep-pack generation.
17. Subagent queue generation.
18. Ready subagent dispatch batch generation.
19. Daily gap ledger generation.
20. Skill Steward closeout.
21. Blog foundation checks.
22. Live deployment route and GA4 tag check.
23. Deployment readiness handoff, including Netlify config validation that blocks repo-root publishing and requires `outputs/netlify-publish`.
24. Publish-governor dry-run planning.
25. Deploy-review packet generation for explicit approval; `deployment-readiness.md` is not deploy approval by itself.
26. Machine-readable run status and next-action summary.
27. SEO/AEO system-completion audit.
28. Daily run-gate report.

`run-status.json` includes `analytics.feedback_input_state`. `healthy_empty` means GA4/GSC access and diagnostics are valid, the rollup and analytics fixtures pass, and there are no real input rows yet. That state proves the feedback loop machinery is operational but waiting for real evidence; it must not unlock generation or cause placeholder analytics rows.

`system-completion-audit.json` separates system readiness from current-run readiness. `operational_with_run_blockers` means the infrastructure is present and working, but a current-run gate such as query handoff readiness, validated demand, or packet selection is still blocking generation. Treat this as a working system waiting for approved inputs, not permission to publish or invent data.

The GSC fallback step never invents demand. It reads `measurement-diagnostics.json`; if the target finalized window is empty but the 28-day or 90-day finalized diagnostic window has rows, it reruns `pull-gsc.mjs` for that wider finalized range. If diagnostics show zero rows across all finalized windows, the step records `skipped_no_fallback_rows`. Any rows it finds validate search demand only; factual claims still need approved source evidence.

If credentials are missing, the relevant step is marked `skipped_missing_setup`, and the report lists the required manual action. Other steps still run.

Outputs:

- `analytics/page_daily.csv`
- `analytics/search_query_daily.csv`
- `research/trend-intelligence/<date>-daily-discovery/`
- `research/query-intelligence/<date>-daily-discovery/`, only when discovery rows produce at least one non-monitor handoff candidate
- `research/daily-content-plan/<date>/`
- `research/daily-content-plan/<date>/demand-import-worklist.csv`
- `research/daily-content-plan/<date>/demand-import-worklist.json`
- `research/daily-content-plan/<date>/demand-import-worklist.md`
- `research/daily-content-plan/<date>/demand-import-pack/`
- `research/daily-content-plan/<date>/demand-acquisition-brief.json`
- `research/daily-content-plan/<date>/demand-acquisition-brief.md`
- `research/daily-content-plan/<date>/gap-ledger.csv`
- `research/daily-content-plan/<date>/gap-ledger.json`
- `research/daily-content-plan/<date>/gap-ledger.md`
- `research/source-checks/<date>/source-checks.csv`
- packet-local `performance-log.csv`
- `analytics/content_decisions.csv`
- `automation-runs/<date>/daily-report.json`
- `automation-runs/<date>/daily-report.md`
- `automation-runs/<date>/subagent-queue.json`
- `automation-runs/<date>/subagent-queue.md`
- `automation-runs/<date>/subagent-dispatch/ready-batch.json`
- `automation-runs/<date>/subagent-dispatch/ready-batch.md`
- `automation-runs/<date>/subagent-dispatch/prompts/*.prompt.md`
- `automation-runs/<date>/subagent-status.json`
- `automation-runs/<date>/subagent-prompts/*.prompt.md`
- `automation-runs/<date>/skill-steward-closeout.json`
- `automation-runs/<date>/skill-steward-closeout.md`
- `automation-runs/<date>/publish-plan.json`
- `automation-runs/<date>/publish-plan.md`
- `automation-runs/<date>/live-deployment-check.json`
- `automation-runs/<date>/live-deployment-check.md`
- `automation-runs/<date>/deployment-readiness.json`
- `automation-runs/<date>/deployment-readiness.md`
- `automation-runs/<date>/deploy-review-packet.json`
- `automation-runs/<date>/deploy-review-packet.md`
- `automation-runs/<date>/run-status.json`
- `automation-runs/<date>/run-status.md`
- `automation-runs/<date>/next-actions.json`
- `automation-runs/<date>/system-completion-audit.json`
- `automation-runs/<date>/system-completion-audit.md`
- `automation-runs/<date>/run-gates-daily.json`
- `automation-runs/<date>/run-gates-daily.md`

The top-level content runner also writes:

- `automation-runs/<date>/content-run-report.json`
- `automation-runs/<date>/content-run-report.md`

Packet scaffolding is intentionally separate from the daily runner. The orchestrator should run it only after reviewing the daily candidates, confirming any plain demand-promotion report, and receiving packet-scaffolding approval because incomplete packets are not publishable.

## Subagent Consumption

The orchestrator should read `automation-runs/<date>/subagent-dispatch/ready-batch.md` and launch one narrow subagent per selected prompt file. Do not collapse multiple ready prompts into one broad assignment.

The orchestrator should read `automation-runs/<date>/run-status.json` before deciding the next action. That file is the compact automation-facing summary of Google credential status, GA4/GSC row counts, current query handoff status, demand import requests, candidate intake counts, ready subagent prompts, publish-governor blockers, and the next action queue. Use it instead of scraping `daily-report.md` or `content-run-report.md`.

Subagents must not turn a candidate directly into a blog. The required sequence is:

1. Topic Cartographer scores the candidate.
2. Query Intelligence Agent clusters search and prompt language.
3. Source Registry Agent finds approved evidence.
4. Research Synthesis Agent writes research notes only.
5. Outline Agent creates the structure.
6. Draft Agent uses `$sellinpublic-seo-blog`.
7. Claim Ledger Agent audits every factual claim.
8. Metadata/Schema Agent prepares publish metadata.
9. Blog Generator Agent renders only approved strict packets.
10. QA agents review source, AEO/SEO, voice, schema, browser, link, feed, and sitemap checks.

Role contracts live in `docs/seo-aeo/subagents/`.

## Official References

- Google tag setup: https://developers.google.com/tag-platform/gtagjs
- GA4 Data API overview: https://developers.google.com/analytics/devguides/reporting/data/v1
- GA4 `runReport`: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Search Console API overview: https://developers.google.com/webmaster-tools
- Search Analytics `query`: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Analytics data guide: https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data
