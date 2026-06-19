# Manual imports

Drop local CSV exports into these folders before running:

- `imports/analytics/` for page-level analytics exports.
- `imports/query-exports/` for search query exports.
- `imports/ai-query-observations/` for approved sanitized AI-query observations.
- `imports/serp-observations/` for manual SERP/PAA/AEO observations.
- `imports/topic-seeds/` for editorial topic seeds that still need demand validation.
- `imports/ai-citations/` for manual AI citation checks.
- `imports/distribution/` for channel and campaign distribution exports.
- `imports/trends/` for Google Trends or other trend CSV exports, including automated public RSS/Atom/JSON headline captures from `pull-public-trends.mjs`.

Public feed captures are source leads only. Use `publicTrendSources.includeKeywords`, `includePatterns`, `excludeKeywords`, and `excludePatterns` globally or per source to keep headline rows scoped to employee-generated content, AEO/AI-search, and GTM discovery.

The daily discovery bridge normalizes approved query and trend exports into:

- `research/trend-intelligence/<date>-daily-discovery/`
- `research/query-intelligence/<date>-daily-discovery/`

These discovery artifacts can guide topics, H2s, FAQs, source gaps, and refreshes. They cannot support factual claims in public articles.

Manual-only inputs and public feed headline captures can create discovery artifacts, but they do not unlock packet intake by themselves. A ready handoff needs current validated demand signal from Search Console, Bing Webmaster, AnswerThePublic/Ahrefs/Semrush/AlsoAsked-style exports, Google Trends CSV/API exports, or a similar approved query/trend source.

Run the analytics importer from the repository root for analytics, Search Console-style query rows, AI citation logs, and distribution rows:

```sh
node scripts/seo-aeo/import-analytics-exports.mjs --date YYYY-MM-DD
```

Validate without writing:

```sh
node scripts/seo-aeo/import-analytics-exports.mjs --date YYYY-MM-DD --dry-run --strict
```

Rows missing identity fields, date formats, URL formats, numeric formats, or at least one signal field are reported under `invalid` and skipped. `--strict` exits non-zero when invalid rows are present.

Run the daily discovery bridge after adding query, trend, AI-query observation, SERP observation, or topic-seed files:

```sh
node scripts/seo-aeo/build-discovery-run.mjs --date YYYY-MM-DD
```

The script is safe to run when these folders are empty. Raw import CSVs are local artifacts and should not be committed; use `docs/seo-aeo/templates/imports/*.csv` for shareable header templates.
