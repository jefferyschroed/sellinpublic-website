# Automation Cadence

Research date: 2026-06-17

Automation prepares analysis, drafts briefs, and monitors signals. Humans approve topics, claims, voice, source use, publishing, redirects, and metadata changes.

## Operating Principles

- Treat AEO as SEO with clearer answers, stronger source hygiene, and better first-party expertise.
- Publish non-commodity content: operator POV, buyer objections, teardown notes, customer-approved proof, and practical GTM workflows.
- Every material claim needs an approved source: first-party data, customer-approved proof, named SME input, or reliable public evidence.
- AI citation visibility is directional. Track trends by query, surface, cited URL, competitors cited, and answer accuracy.

## Recommended Schedule

| Cadence | Workflow | Output | Manual gate |
|---|---|---|---|
| Daily AM | Data pull and discovery | `automation-runs/<date>/daily-report.md`, `run-status.json`, `measurement-diagnostics.md`, analytics CSVs, trend/query artifacts | Owner reviews setup skips, zero-row diagnostics, and anomalies |
| Daily AM | Query-intelligence validation | Current-date `research/query-intelligence/<date>-daily-discovery/` validation or explicit no-current-run status | Orchestrator accepts only current clean validation before packet intake |
| Daily AM | Topic candidate planning | `research/daily-content-plan/<date>/topic-candidates.csv` and `subagent-assignments.md` | GTM owner approves candidate packets |
| Daily AM | Subagent dispatch planning | `automation-runs/<date>/subagent-dispatch/ready-batch.md` and prompt files | Orchestrator launches one subagent per selected task |
| Daily PM | Packet or refresh work | Strict packet artifacts or refresh notes | Source, editorial, and publish gates remain manual |
| Daily PM | Publish governor | `automation-runs/<date>/publish-plan.md` and `publish-plan.json`; refresh `run-status.json` with `node scripts/seo-aeo/write-run-status.mjs --date <date>` after standalone governor runs | Founder/GTM lead approves any `--generate-approved` write |
| Before approved deploy | Clean publish preflight and deploy review | `automation-runs/<date>/netlify-publish-check.md`, `deployment-readiness.md`, and `deploy-review-packet.md` | Deploy owner approves only from `deploy-review-packet.md`; `deployment-readiness.md` is not approval by itself |
| Monday AM weekly | Topic triage | Prioritized topic backlog | GTM owner approves top 1-3 topics |
| Tuesday AM weekly | Source refresh | Updated source register for active topics | SME approves claims and proof |
| Thursday AM weekly | AI citation checks | `analytics/ai_citation_log.csv` | Operator reviews accuracy and risk |
| Friday AM weekly | Performance monitoring | `measurement-diagnostics.md`, `analytics/page_daily.csv`, `analytics/search_query_daily.csv`, `analytics/distribution_daily.csv` | Owner chooses actions |
| First Friday monthly | Content retro | `analytics/content_decisions.csv` with `decision_id`, `evidence_signature`, approval `status`, and execution `outcome` | Founder/GTM lead approves next month and closes completed/superseded decisions |
| One-time before publishing | First-blog launch checklist | Blog launch readiness | Final editorial and technical QA |

Performance feedback schemas and review rules live in `performance-feedback.md`.
The short local runbook lives in `local-automation-runbook.md`.
Daily command and setup notes live in `data-pipeline.md`.

## Local Command Boundary

Use the top-level controller as the single daily local command:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

It covers the daily data pipeline, current-date query handoff validation, source checks, feedback signal rollup, analytics scoring, packet performance sync, content decisions, candidate planning, subagent queue and dispatch generation, completed subagent artifact checks, Skill Steward closeout, blog foundation checks, publish-governor dry-run planning, run status, system audit, and content-run report.

The controller creates a local run lock under `automation-runs/.locks/`. A second overlapping controller run exits before writing shared artifacts. Treat stale locks as crash recovery: remove one only after confirming no active Codex run is using the workspace.

Use the lower-level runner only when you need the daily pipeline without the content-run report:

```sh
node scripts/seo-aeo/daily-runner.mjs --date <yyyy-mm-dd>
```

No npm wrapper was added because this repository has no `package.json` script pattern. No OS-level launch agent or external cron should be created unless the repo later adopts that convention.

## After Data Arrives

When new exports or observations arrive after the daily run:

1. Put files under the matching `imports/` folder.
2. For analytics, query, AI citation, or distribution rows, validate then import:

```sh
node scripts/seo-aeo/import-analytics-exports.mjs --date <yyyy-mm-dd> --dry-run --strict
node scripts/seo-aeo/import-analytics-exports.mjs --date <yyyy-mm-dd>
```

3. Rerun the top-level controller:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

4. Dispatch only from `automation-runs/<date>/subagent-dispatch/ready-batch.md`, one subagent per prompt file. Complete each ledger task only after its listed artifact exists. If multiple agents wrote artifacts, first run `node scripts/seo-aeo/subagent-queue.mjs sync-completions --date <yyyy-mm-dd>`, then rerun `node scripts/seo-aeo/build-subagent-dispatch.mjs --date <yyyy-mm-dd>`.

If an approved packet becomes publish-ready after the daily run, run the publish governor dry-run first. Use `--generate-approved` only after human approval and only for governor-selected packets.

## Recurring Automations

The Codex app currently owns the recurring schedule. The expected automation inventory is validated by:

```sh
node scripts/seo-aeo/audit-codex-automations.mjs --date <yyyy-mm-dd>
```

The daily controller runs this audit and writes `automation-runs/<date>/codex-automation-audit.json` and `.md`. If the audit reports `needs_update`, update the Codex automation before treating the operating system as fully wired.

Every active SEO/AEO automation must preserve the deployment-first guard: if live deployment is blocked, it must not run demand promotion, demand acquisition, packet scaffolding, generation, publishing, or distribution unless the owner explicitly defers that blocker with `LIVE-DEPLOY-BLOCKER-DEFERRED:<date>`. It should report the blocker and the `owner-actions.md` next step instead.

Expected active Codex automations:

| Automation ID | Cadence | Purpose |
|---|---|---|
| `sell-in-public-seo-aeo-daily-pipeline` | Daily | Run the local controller, validate demand import pack, update run status, and report blockers without auto-publishing. |
| `seo-aeo-weekly-topic-triage` | Weekly | Review topic authority and next topic candidates. |
| `seo-aeo-weekly-source-refresh` | Weekly | Refresh source quality and unsupported-claim gaps. |
| `seo-aeo-weekly-ai-citation-check` | Weekly | Review directional AI citation/answer visibility. |
| `seo-aeo-weekly-performance-monitor` | Weekly | Review GA4/GSC/distribution performance signals. |
| `seo-aeo-monthly-content-retro` | Monthly | Roll performance and learnings into keep/refresh/expand/merge/retire decisions. |

### Weekly Topic Triage

Automate:

Pull Search Console, Bing Webmaster Tools, analytics, CRM objections, LinkedIn performance, sales-call notes, and competitor/public SERP notes into a topic scoring table.

Inputs:

- ICP and offer.
- Target accounts.
- Sales objections.
- Keyword/query list.
- Content inventory.
- Last 30/90 day performance.

Output:

Topic backlog with score, intent, funnel stage, source readiness, business fit, and recommended next action.

Prompt:

```text
Using the provided ICP, offer, content inventory, search data, buyer objections, and recent sales/LinkedIn signals, prioritize next week's SEO/AEO content topics.

Score each topic on buyer urgency, business relevance, source readiness, differentiation, search/AEO opportunity, and conversion path.

Return a table with: topic, target reader, search intent, AEO question, source gaps, recommended format, internal CTA, score, and reason.
```

### Source Refresh

Automate:

Check active content briefs against the approved source library and flag stale, missing, weak, or unapproved claims.

Inputs:

- Source register.
- Draft briefs.
- Customer proof.
- SME notes.
- Public references.
- Last verified date.

Output:

Source freshness report, expired claims list, replacement-source requests, and SME questions.

Prompt:

```text
Audit these active content briefs and published pages against the approved source register.

Flag unsupported claims, stale sources, weak proof, missing SME input, confidentiality risk, and claims that need customer approval.

Return: claim, location, risk level, source needed, owner, and recommended fix.
```

### AI Citation Check

Automate:

Generate a fixed query packet and compare manual or available tool captures across AI search surfaces. Use Bing AI Performance exports when available.

Inputs:

- Query set.
- Target pages.
- Competitor set.
- Citation log.
- Bing AI Performance data.

Output:

Citation log with cited URLs, competitors, answer angle, accuracy notes, and content opportunities.

Prompt:

```text
Review `docs/seo-aeo/ai-citation-query-set.json`, run the current query-set check, and use `automation-runs/<date>/ai-citation-capture-pack.md` plus `ai-citation-import-skeleton.csv` as the capture queue.

Identify where Sell In Public is cited, where competitors are cited, what angle the AI answer uses, whether the answer is accurate, and which page should be improved.

Return reviewed rows for `imports/ai-citations/`, then run `node scripts/seo-aeo/check-ai-citation-query-set.mjs --date <yyyy-mm-dd>` and `node scripts/seo-aeo/write-ai-citation-capture-pack.mjs --date <yyyy-mm-dd>`. Return: query ID, query-set version, query, surface, cited URLs, missing angle, accuracy risk, recommended content action, and whether each expected capture is covered.
```

### Performance Monitoring

Automate:

Pull weekly page/query metrics and flag movement outside thresholds.

Inputs:

- GA4/analytics.
- Search Console.
- Bing Webmaster Tools.
- Netlify deploy dates.
- Content inventory.

Output:

Weekly scorecard: clicks, impressions, CTR, average position, indexed pages, cited pages, conversions, and anomalies.

Prompt:

```text
Analyze the latest weekly SEO/content metrics.

Find meaningful changes in impressions, clicks, CTR, ranking, indexed pages, conversions, and citation activity. Separate normal noise from action-worthy changes.

Return: wins, losses, anomalies, likely cause, recommended action, and owner.
```

### Monthly Content Retro

Automate:

Aggregate the month's outputs, performance, pipeline influence, and learning notes.

Inputs:

- Weekly scorecards.
- Backlog.
- Citation logs.
- CRM attribution.
- Editorial notes.

Output:

Content decisions: double down, refresh, consolidate, retire, or create follow-up.

Prompt:

```text
Summarize this month's content performance and operating lessons.

Group pages into keep, update, expand, merge, and retire. Identify which topics created qualified buyer signal, not just traffic.

Return: decisions, evidence, next-month bets, source gaps, and process improvements.
```

## Manual Review Gates

- Topic gate: GTM owner approves audience, business case, and priority before drafting.
- Source gate: SME validates technical accuracy, proof, examples, and customer-safe language.
- Editorial gate: editor checks voice, clarity, differentiation, and no generic AI filler.
- Compliance gate: owner removes confidential customer data, invented metrics, unsupported claims, and risky comparisons.
- Technical gate: reviewer confirms crawlable links, title, meta description, canonical, sitemap inclusion, image alt text, mobile rendering, and analytics.
- Publish gate: founder/GTM lead approves final page and CTA.
- Governor gate: `node scripts/seo-aeo/publish-governor.mjs --date <date>` must select the packet before any static generation write. The default run is dry-run planning only; `--generate-approved` is reserved for packets inside the daily limits.

## What Not To Automate

- Do not auto-publish posts, source edits, redirects, or metadata changes.
- Do not bypass the publish governor or run `--generate-approved` for packets that are blocked by validation, status, source readiness, topic decision, content decision, or daily limits.
- Do not invent quotes, customer results, benchmarks, citations, author credentials, or third-party mentions.
- Do not create mass query-variation pages just to target AI/search fan-out.
- Do not scrape or automate search/AI surfaces in ways that violate platform terms; use exports, APIs, and manual spot checks where needed.
- Do not optimize for AI hacks over useful content.
- Do not let AI rewrite founder/operator POV into generic SEO prose.
- Do not use private CRM, call, or customer data in public content without explicit approval.

## First-Blog Automation Setup

After the first post URL exists:

- Add the post to the weekly monitoring query set.
- Add the post to the AI citation query set.
- Schedule a 7-day review.
- Schedule a 30-day review.
- Add the final source register to the source-refresh automation.
