# Daily Discovery Rollup

Run: `2026-01-01-daily-discovery`

Rule: Discovery data is not factual evidence. Reddit and manual AI prompt exports are discovery only, never factual evidence.

## Inputs

| Source type | Status | Artifact | Notes |
|---|---|---|---|
| Reddit | Missing | `raw/reddit-2026-01-01.csv` |  |
| AnswerThePublic-style export | Missing | `raw/answer-the-public-<seed>-2026-01-01.csv` |  |
| GSC emerging queries | Missing | `raw/gsc-emerging-queries-2026-01-01.csv` |  |
| Google Trends | Missing | `raw/google-trends-<seed-or-topic>-2026-01-01.csv` |  |
| Manual AI prompt export | Missing | `raw/ai-prompt-export-<surface>-2026-01-01.md` |  |

## Summary

- New canonical queries:
- Rising GSC queries:
- Google Trends movement:
- Reddit discovery notes:
- AI prompt discovery notes:

## Cluster Changes

| Cluster | Change | Summary |
|---|---|---|
|  |  |  |

## Packet Candidates

| Candidate | Decision | Reason |
|---|---|---|
|  |  |  |

## Source Gaps

- TBD

## SME Questions

- TBD

## QA

- [ ] Every normalized row uses `evidence_use: discovery_only`.
- [ ] Reddit rows use `allowed_public_use: none`.
- [ ] Manual AI prompt rows use `allowed_public_use: none`.
- [ ] No Reddit, forum, or AI output was moved into `citations.json`.
- [ ] No discovery source was used to support a factual claim.
- [ ] Analytics CSVs were not edited.
- [ ] Connector scripts were not edited.
