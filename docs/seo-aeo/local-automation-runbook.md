# Local SEO/AEO Automation Runbook

Research date: 2026-06-18

This is the short local runbook for operating the SEO/AEO system from the repository root without relying on memory.

## Single Daily Command

Use this as the default daily entrypoint:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

When reviewing a specific metrics date, pass it explicitly:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd> --metrics-date <yyyy-mm-dd>
```

For a specific metrics window, use either the explicit metrics flags or the shorter aliases. The `--date` value stays the run folder date; it is not the metrics window.

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd> --metrics-start <yyyy-mm-dd> --metrics-end <yyyy-mm-dd>
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd> --start <yyyy-mm-dd> --end <yyyy-mm-dd>
```

What it covers:

- Calls `scripts/seo-aeo/daily-runner.mjs`.
- Pulls GA4 and Search Console data when credentials are configured.
- Writes Search Console query rows to `analytics/search_query_daily.csv`; discovery reads them as `gsc_emerging_query_export` validated demand.
- If the finalized Search Console target window is empty, checks diagnostics and automatically pulls a wider finalized GSC window only when diagnostics prove 28-day or 90-day rows exist.
- Runs the optional Bing Webmaster query pull when `BING_WEBMASTER_API_KEY` and `BING_WEBMASTER_SITE_URL` are configured; otherwise records the lane as skipped setup.
- Records the Reddit API lane as disabled, records the Google Trends RSS lane as skipped unless explicitly enabled, and pulls approved public trend-discovery feeds when enabled in local config.
- Imports approved manual analytics, query, citation, and distribution exports.
- Builds the current-date trend/query discovery run.
- Validates only the current-date query-intelligence handoff.
- Checks packet source URLs.
- Scores analytics rows and syncs packet-local performance logs.
- Generates lifecycle-safe content decisions and daily topic candidates.
- Builds the subagent queue and dependency-ready dispatch batch.
- Writes Skill Steward closeout artifacts.
- Runs the shared blog foundation checker.
- Builds and checks the clean Netlify publish directory, then checks live deployment routes, the GA4 tag, and Netlify publish configuration so production 404s, missing measurement, unsafe repo-root deploy settings, or stale deploy output are visible before analytics interpretation.
- Runs publish-governor planning in dry-run mode.
- Audits the Codex app daily/weekly/monthly automation inventory.
- Writes `daily-report`, `run-status`, `next-actions`, `owner-actions`, `netlify-publish-check`, `live-deployment-check`, `deployment-readiness`, `deploy-review-packet`, `codex-automation-audit`, `system-completion-audit`, `run-gates-daily`, and `content-run-report` artifacts under `automation-runs/<date>/`.
- Creates a local run lock under `automation-runs/.locks/` so overlapping Codex runs fail before racing the same output files.

What it does not do by default:

- It does not scaffold packets unless `--scaffold-limit <n>` is provided.
- Packet scaffolding opens only new-post candidates. Refresh rows update or reopen existing packets through the refresh workflow; they must not create duplicate packet folders for already-published coverage.
- It does not write generated blog output unless `--generate-approved` is provided.
- It does not approve topics, sources, claims, metadata, redirects, publishing, or skill changes.
- It does not use the Reddit API or unofficial ChatGPT/AI-answer network scraping.
- It does not treat sanitized manual Reddit captures as validated demand, factual evidence, or packet-intake approval.
- It does not enable Google Trends RSS by default. RSS rows are discovery-only even when the lane is deliberately enabled.
- It does not create cron, launch agents, or any external scheduler.

If a controller run exits because a lock already exists, confirm no active Codex run is using the workspace before removing the stale lock file.

The lower-level daily pipeline is:

```sh
node scripts/seo-aeo/daily-runner.mjs --date <yyyy-mm-dd>
```

Use `daily-runner.mjs` only when you want the data, queue, dispatch, status, audit, and publish-plan pipeline without the top-level content-run report.

There is no `package.json` in this repo, so there is no npm script wrapper to add. Use the Node commands directly.

## Daily Run

1. Confirm repository state before editing or dispatching work:

```sh
git status --short
```

2. Run readiness when setup changed, credentials changed, packets changed, or the last run failed:

```sh
node scripts/seo-aeo/audit-readiness.mjs
```

3. Run the daily controller:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

4. Read these outputs in this order:

- `automation-runs/<date>/run-status.md`
- `automation-runs/<date>/next-actions.json`
- `automation-runs/<date>/owner-actions.md`
- `automation-runs/<date>/netlify-publish-check.md`
- `automation-runs/<date>/deployment-readiness.md`
- `automation-runs/<date>/deploy-review-packet.md`
- `automation-runs/<date>/content-run-report.md`
- `automation-runs/<date>/measurement-diagnostics.md`
- `automation-runs/<date>/codex-automation-audit.md`
- `automation-runs/<date>/run-gates-daily.md`
- `automation-runs/<date>/subagent-dispatch/ready-batch.md`
- `automation-runs/<date>/publish-plan.md`
- `research/daily-content-plan/<date>/demand-import-worklist.md`
- `research/daily-content-plan/<date>/demand-import-pack/README.md`
- `research/daily-content-plan/<date>/demand-import-review-rollup.md`
- `research/daily-content-plan/<date>/demand-readiness-preflight.md`
- `research/daily-content-plan/<date>/demand-acquisition-brief.md`
- `research/daily-content-plan/<date>/gap-ledger.md`

5. Make one daily decision:

- `launch_ready_subagents_one_per_prompt`
- `launch_gap_resolution_subagents_only`
- `wait_for_data`
- `widen_metrics_window`
- `resolve_setup`
- `fix_measurement_configuration`
- `continue_packet`
- `run_publish_governor_after_approval`
- `monitor_only`
- `escalate_to_human_owner`

Do not use an old query-intelligence folder to unlock packet intake. The daily runner intentionally validates only `research/query-intelligence/<date>-daily-discovery/`.

Use `measurement-diagnostics.md` to choose between `wait_for_data`, `widen_metrics_window`, and `fix_measurement_configuration`. Do not create placeholder analytics rows when diagnostics report verified empty windows.

Use `netlify-publish-check.md` before deploy approval. It must report `ready` with zero blocked routes, no forbidden top-level entries, and GA4 present on publishable HTML routes. A ready local publish directory does not approve deploy by itself; it only proves the clean static artifact is safe to deploy after human approval.

Use `deploy-review-packet.md` for the actual approval decision. It records pending approval fields, approved deploy scope, changed static/build-support paths, excluded local-only paths, route hashes, rollback SHA, GA4/privacy status, and the required post-deploy live check. Do not deploy from `deployment-readiness.md` alone.

Do not run `run-demand-promotion.mjs --apply` while the live deployment check is blocked. The runner enforces this before copying reviewed rows into `imports/` or rebuilding discovery. If the owner explicitly defers the live-deploy blocker, use the exact marker shown in the report: `--live-deploy-defer-marker LIVE-DEPLOY-BLOCKER-DEFERRED:<date>`.

Use pull-script dry-runs when validating credentials or source availability without mutating analytics CSVs:

```sh
node scripts/seo-aeo/pull-ga4.mjs --start <yyyy-mm-dd> --end <yyyy-mm-dd> --dry-run
node scripts/seo-aeo/pull-gsc.mjs --start <yyyy-mm-dd> --end <yyyy-mm-dd> --dry-run
node scripts/seo-aeo/pull-bing-webmaster.mjs --start <yyyy-mm-dd> --end <yyyy-mm-dd> --dry-run
```

The pull outputs report `sourceRows` and `normalizedRows`. Treat `sourceRows: 0` as a data-availability signal, not a credential failure, when diagnostics still show access `ok`.

Search Console demand can arrive through the OAuth pull into `analytics/search_query_daily.csv` or through a reviewed Search Console export. Either path becomes `gsc_emerging_query_export` in discovery and can validate actual search demand. It does not replace source/claim evidence for article facts.

## Subagent Dispatch

The daily controller writes:

- `automation-runs/<date>/subagent-queue.json`
- `automation-runs/<date>/subagent-queue.md`
- `automation-runs/<date>/subagent-dispatch/ready-batch.json`
- `automation-runs/<date>/subagent-dispatch/ready-batch.md`
- `automation-runs/<date>/subagent-dispatch/prompts/*.prompt.md`
- `automation-runs/<date>/subagent-artifact-check.json`
- `automation-runs/<date>/subagent-artifact-check.md`

Dispatch rules:

- Launch one subagent per prompt file.
- Do not combine multiple ready prompts into one broad assignment.
- Do not assign one subagent to own a whole post.
- Each subagent writes only the artifact path named in its task.
- Complete a task only after the artifact exists and is non-empty.
- `subagent-queue.mjs complete` accepts only the declared artifact path for that task. Do not attach extra output artifacts to completed tasks.
- Rerun dispatch after each completed artifact to unlock dependent tasks.
- Analytics Feedback is not a default gap-resolution step. For unpublished, packetless, blocked, duplicate, or monitor-only candidates, the queue builder should omit Analytics Feedback unless the candidate carries an explicit `analytics_readiness_investigation` or approved analytics-readiness label.
- When Analytics Feedback is omitted, Skill Steward still runs after the previous readiness gate so repeated process issues can be captured without forcing a no-data analytics artifact.
- When the current blocker is validated demand, the queue builder should add rank-1 `demand_import_rank1` Query Intelligence tasks from the demand import worklist. These tasks review only the primary recommended import for each candidate, write a demand-import review artifact, and must not create, infer, or promote demand data.

Ledger commands:

```sh
node scripts/seo-aeo/subagent-queue.mjs list-ready --date <yyyy-mm-dd> --max 10
node scripts/seo-aeo/subagent-queue.mjs claim <task_id> --date <yyyy-mm-dd> --operator codex
node scripts/seo-aeo/subagent-queue.mjs complete <task_id> --date <yyyy-mm-dd> --artifact <path>
node scripts/seo-aeo/subagent-queue.mjs block <task_id> --date <yyyy-mm-dd> --reason "<reason>"
node scripts/seo-aeo/subagent-queue.mjs sync-completions --date <yyyy-mm-dd>
node scripts/seo-aeo/check-subagent-artifacts.mjs --date <yyyy-mm-dd>
node scripts/seo-aeo/build-subagent-dispatch.mjs --date <yyyy-mm-dd>
```

If `run-status.json` says the current query handoff is missing, starter-only, monitor-only, or blocked, launch only the gap-resolution, monitoring, or orchestration prompts. Do not draft, scaffold publishable packets, generate, or publish from those inputs.

If `run-status.json` points to `demand-import-worklist.md`, use it as the Query Intelligence Agent's import queue. Fill only the matching demand-import-pack staging CSVs with real reviewed exports, then use `node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --dry-run` before any apply step. Do not mark the worklist complete just because a topic feels strategically important.

Use `import_rank`, `primary_recommended_import`, and `priority_reason` to choose the first demand source per candidate. The worklist ranks sources using the local source-availability state, so start with rank 1. Use lower-ranked rows only when the primary source is unavailable, empty, or needs corroboration.

If `demand-acquisition-tasks/report-rollup.md` reports repeated `blocked_no_reviewed_rows`, switch to source-first acquisition. The task builder suppresses empty `reviewed_generic_query_tool_export` attempts when the same candidate still has an eligible source-specific fallback, unless `--allow-generic-after-source-blocks` is used for a reviewed exception. Do not launch another exact-query worker until a real accessible export source has already been identified. Prefer Search Console OAuth rows or a reviewed Search Console export as `gsc_search_query_export`; then verified Bing Webmaster export or manual Google Trends CSV/API export. Ahrefs, Semrush, AlsoAsked, AnswerThePublic, PAA, autocomplete, and approved manual/sanitized AI observations can suggest query language, but they remain discovery-only; a separate validated demand source must carry the gate. If no export source is accessible, ask the owner for one instead of retrying rate-limited or empty sources.

If `ready-batch.md` lists `demand_import_rank1` tasks, dispatch one Query Intelligence subagent per prompt. Each subagent checks whether reviewed rows already exist at the destination, writes the named `demand-import-review-<candidate>-rank1.md` artifact, and stops. A completed review artifact is not the same as a promoted import; packet intake remains blocked until a real reviewed CSV is promoted into `imports/` and the daily controller reruns.

If `run-status.json` points to `demand-import-pack/`, use its header-only draft CSVs as staging files. Fill them with real export rows, then use the demand-promotion runner to validate and promote reviewed rows. Files in `demand-import-pack/` are not evidence and are not imported by the daily bridge until the runner's `--apply` path promotes them.

If the requested import type is `gsc_search_query_export`, use existing Search Console rows from `analytics/search_query_daily.csv` or a reviewed Search Console/Search Analytics export under `imports/` or `research/`. Keep the GSC source label explicit, such as `google_search_console`. Do not convert GSC into `reviewed_generic_query_tool_export`; discovery will canonicalize promoted rows to `gsc_emerging_query_export`.

Prefer the staging transformer over manual CSV editing:

```sh
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --dry-run
node scripts/seo-aeo/stage-reviewed-demand-export.mjs --date <yyyy-mm-dd> --candidate <candidate_id> --type <recommended_import_type> --source-file <raw-export.csv> --source-name <tool> --validation-source <export/source id> --reviewed-by <name> --apply
```

The source file must live under `imports/` or `research/`. The transformer writes only the matching demand-import-pack staging CSV and a sidecar report; it does not promote imports, rebuild discovery, scaffold packets, approve publishing, or make discovery-only data factual evidence. GSC rows validate demand; they still do not support factual article claims.

If `demand-readiness-preflight.md` includes `Next Unambiguous Action`, start there before scanning the full worklist. That block names the single highest-priority reviewed export to fill first, its staging CSV, final destination, required review fields, and the guarded command path to run after real rows are present.

If `demand-acquisition-brief.md` exists, use it as the operator packet for the next reviewed demand input. It names allowed/disallowed sources and the strict demand-promotion commands. It does not create demand data or approve packet intake.

If `automation-runs/<date>/demand-acquisition-tasks/tasks.md` exists, dispatch the first listed acquisition prompt before broad research work. The default batch intentionally selects only the next unambiguous candidate and rank-1 source. Launch one subagent per prompt; each subagent may write only the listed staging CSV and acquisition report. Do not combine multiple acquisition prompts, do not write directly to `imports/`, and do not run `--apply` until the dry-run promotion report passes.

When `run-status.md` says `Feedback input state: healthy_empty`, GA4/GSC access is working and the rollup, scoring, and content-decision lifecycle fixtures pass, but there are no real performance, citation, distribution, or query rows yet. Do not create placeholder analytics rows or dispatch a no-data Analytics Feedback subagent. Acquire the reviewed input named in the demand acquisition brief or wait for real GA4/GSC data.

When `system-completion-audit.md` says `operational_with_run_blockers`, the infrastructure is working but a current-run gate is still blocking generation. Continue from `owner-actions.md` and the demand acquisition prompt; do not treat the status as publish approval.

When the daily report says `Pull GSC fallback query metrics: skipped_no_fallback_rows`, Search Console access worked and the wider finalized diagnostic windows were also empty. This is a real no-data state, not a setup error.

Do not use Reddit API credentials or unofficial ChatGPT network captures to fill demand blockers. Use approved manual observations only as discovery or citation-monitoring inputs. Sanitized manual Reddit captures may live under `imports/reddit-manual-captures/*.csv`, but they must use `source_type=reddit_manual_capture`, `capture_method=manual_capture_no_api`, `evidence_use=discovery_only`, and `allowed_public_use=none`, and they must not include usernames, authors, full post bodies, or raw comments.

Use stage gates before moving from analysis to generation:

```sh
node scripts/seo-aeo/enforce-run-gates.mjs --date <yyyy-mm-dd> --mode daily
node scripts/seo-aeo/enforce-run-gates.mjs --date <yyyy-mm-dd> --mode generate
node scripts/seo-aeo/enforce-run-gates.mjs --date <yyyy-mm-dd> --mode publish
```

The daily controller records `run-gates-daily` with `--no-fail` so the automation can still write diagnostics on blocked days. Running the gate directly is strict and exits non-zero when Codex must not proceed to the next stage.

For Bing Webmaster data, use reviewed manual Search Performance exports when the optional API key is not configured. Store any Bing API key or OAuth credential outside the repo; never paste it into a prompt, packet, import CSV, or committed docs.

For Search Console data, use the local OAuth pull when possible. If using a manual export, normalize it with `docs/seo-aeo/templates/imports/search-query-export.csv` for direct query imports or stage it as `gsc_search_query_export` when the demand-import pack asks for GSC.

After any subagent wave finishes, run `node scripts/seo-aeo/subagent-queue.mjs sync-completions --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/check-subagent-artifacts.mjs --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/build-subagent-dispatch.mjs --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/summarize-demand-import-reviews.mjs --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/audit-demand-readiness.mjs --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/resolve-refresh-targets.mjs --date <yyyy-mm-dd>`, then `node scripts/seo-aeo/build-gap-ledger.mjs --date <yyyy-mm-dd>`. Use `demand-import-review-rollup.md` for validated-demand blockers, `demand-readiness-preflight.md` to decide whether staged/promoted rows justify the apply/discovery chain, `refresh-targets.md` to route refreshes to existing packets only, and `gap-ledger.md` active rows to route the next narrow gap-resolution wave by owner.

If `automation-runs/<date>/demand-acquisition-tasks/source-request.md` is in escalation mode, it is the source-first handoff. When the active manifest has no remaining rows, the rollup may rebuild requested exports from current `topic-candidates.csv` rows instead of stale acquisition reports. Only use requests whose candidate/topic match the current plan; stale demand-import review artifacts are routing history, not source requests.

The source-request lock suppresses new demand acquisition/import, packet scaffolding, generation, publishing, distribution, analytics-feedback, and content-movement work. It does not suppress the guarded promotion of already reviewed valid staging rows when the dry-run is current and the command includes `--approval-marker DEMAND-PROMOTION-APPROVED:<date>`; that approved promotion is the path that can clear the lock. It also does not suppress safe local orchestration, gap mapping, source-gap, QA-for-gap, or skill-steward work when those tasks are explicitly selected by `subagent-dispatch/ready-batch.md`.

## Weekly Run

There is no separate weekly wrapper. Start each weekly review by running the daily controller for the review date, then review the artifacts below.

| Cadence | Run | Review | Output decision |
|---|---|---|---|
| Monday topic triage | `node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>` | `research/daily-content-plan/<date>/topic-candidates.csv`, `topic-coverage.csv`, `topic-decisions.md` | Approve 1-3 candidates, route gap-resolution work, or park/merge/retire |
| Tuesday source refresh | `node scripts/seo-aeo/check-sources.mjs --date <yyyy-mm-dd>` then rerun the daily controller | `research/source-checks/<date>/source-checks.csv`, active packet citations, source gaps | Approve sources, request SME input, or block unsupported claims |
| Thursday AI citation check | Run `node scripts/seo-aeo/check-ai-citation-query-set.mjs --date <yyyy-mm-dd>` and `node scripts/seo-aeo/write-ai-citation-capture-pack.mjs --date <yyyy-mm-dd>`, capture the rows listed in `ai-citation-capture-pack.md`, add reviewed rows to `imports/ai-citations/`, then run the daily controller | `automation-runs/<date>/ai-citation-query-set-check.md`, `automation-runs/<date>/ai-citation-capture-pack.md`, `analytics/ai_citation_log.csv`, feedback rollup summary in `run-status.md`, `content_decisions.csv` lifecycle rows | Keep, update, investigate accuracy, or add source/structure tasks |
| Friday performance review | Add reviewed exports to `imports/analytics/`, `imports/query-exports/`, or `imports/distribution/`, then run the daily controller | `analytics/page_daily.csv`, `analytics/search_query_daily.csv`, `analytics/distribution_daily.csv`, feedback rollup summary in `run-status.md`, `content_decisions.csv` lifecycle rows | Keep, refresh, expand, merge, retire, or monitor |

Weekly reviews can dispatch subagents only through the same ready-batch and ledger flow used by the daily run.

Before approving a content decision, compare `decision_id`, `evidence_signature`, `source_export_ids`, `reviewed_by`, and `last_seen_date`. Approval `status` and execution `outcome` are separate: a closed `outcome` must not route new packet work, and a changed evidence signature needs owner review.

## After Data Arrives

Use this whenever new exports, source checks, packet approvals, or performance data arrive after the daily run.

1. Place files in the matching import folder:

- `imports/analytics/`
- `imports/query-exports/`
- `imports/ai-citations/`
- `imports/distribution/`
- `imports/trends/`
- `imports/reddit-manual-captures/`
- `imports/ai-query-observations/`
- `imports/serp-observations/`
- `imports/topic-seeds/`

Use `docs/seo-aeo/templates/imports/reddit-manual-capture-export.csv` for manual Reddit captures. This is a sanitized no-API discovery lane only: no usernames, authors, full post bodies, raw comments, private details, or confidential company references. It cannot validate demand, validate facts, or unlock packet intake without separate validated demand and source readiness.

2. Validate write-style imports before importing analytics, query, citation, or distribution rows:

```sh
node scripts/seo-aeo/import-analytics-exports.mjs --date <yyyy-mm-dd> --dry-run --strict
node scripts/seo-aeo/import-analytics-exports.mjs --date <yyyy-mm-dd>
```

For demand import packs created by the daily controller, fill the staged CSVs with real reviewed export rows, then run the guarded promotion path:

```sh
node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --dry-run
node scripts/seo-aeo/check-demand-promotion-freshness.mjs --date <yyyy-mm-dd>
node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --apply --approval-marker DEMAND-PROMOTION-APPROVED:<yyyy-mm-dd>
# Optional only after reviewing the promotion report and receiving packet approval:
node scripts/seo-aeo/run-demand-promotion.mjs --date <yyyy-mm-dd> --apply --scaffold-limit 1 --scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:<yyyy-mm-dd>
```

Use marker-approved plain `--apply` only after the dry-run report has no blocked rows and promotion is approved. Header-only staging files stay out of `imports/` and remain discovery blockers. The runner promotes only validated rows, rebuilds discovery, and validates the current handoff. Use `--scaffold-limit` only after the plain apply report has been reviewed and packet approval exists, and include `--scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:<date>`; even then, scaffolding is limited to new-post packet candidates. Refresh candidates are routed to existing packet refresh work instead of new packet scaffolding.

If `validate-demand-import-pack.mjs` runs after the promotion dry-run, rerun `check-demand-promotion-freshness.mjs`. A stale freshness report means the promotion report is no longer decision-grade; rerun the dry-run before any apply or scaffold command.

For GSC demand, use either OAuth-pulled rows already in `analytics/search_query_daily.csv` or a reviewed Search Console export staged as `gsc_search_query_export`. Do not invent exact queries when no reviewed export exists.

3. Rebuild the daily controller after imports or discovery inputs change:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

4. If a packet became approved after the controller already ran, review governed publishing:

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd>
```

Only after human approval and only for governor-selected packets:

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd> --generate-approved
node scripts/blog-orchestrator.mjs check-all
node scripts/seo-aeo/write-run-status.mjs --date <yyyy-mm-dd>
```

The publish governor is the only static-output write path. Direct generator commands are for validation, dry-runs, and debugging, and direct non-dry-run generation is blocked by the generator. If more than one packet is selected for real generation, add `--allow-multi-post` to either `publish-governor.mjs` or the top-level `content-runner.mjs` command after human approval, or set `publishGovernor.allowMultiPostGeneration` to `true` for that run.
