# Trend Intelligence Research

Daily trend and query discovery runs live here.

Use this folder for upstream discovery only. Reddit captures and manual AI prompt exports are never factual evidence. They can help identify questions, objections, and language, but they cannot support claims in public content.

## Daily Folder

```text
research/trend-intelligence/<yyyy-mm-dd>-daily-discovery/
```

Required daily outputs:

- `source-manifest.json`
- `normalized-discovery-queries.csv`
- `dedupe-map.csv`
- `query-clusters.yaml`
- `daily-discovery-rollup.md`
- `brief-handoff-candidates.yaml`
- `review-notes.md`
- `raw/`

Expected raw input names:

- `raw/reddit-<yyyy-mm-dd>.csv`
- `raw/answer-the-public-<seed>-<yyyy-mm-dd>.csv`
- `raw/gsc-emerging-queries-<yyyy-mm-dd>.csv`
- `raw/google-trends-<seed-or-topic>-<yyyy-mm-dd>.csv`
- `raw/ai-prompt-export-<surface>-<yyyy-mm-dd>.md`

Schemas live in `docs/seo-aeo/schemas/`. Operating rules live in `docs/seo-aeo/trend-query-discovery-plan.md`.

## Templates

Use `templates/` for new daily runs:

- `source-manifest.template.json`
- `normalized-discovery-queries.template.csv`
- `dedupe-map.template.csv`
- `query-clusters.template.yaml`
- `daily-discovery-rollup.template.md`
- `brief-handoff-candidates.template.yaml`

Do not write discovery data into `analytics/` CSVs. If GSC or Trends data is exported for discovery, keep that export under the daily run's `raw/` directory.
