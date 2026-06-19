# Daily SEO/AEO Operating System

Research date: 2026-06-17

This is the daily repo-level runbook for Sell In Public SEO, AEO, content packet, blog generation, analytics feedback, and subagent orchestration work.

Use this when running the program day to day. It coordinates the deeper SOPs in this folder. It is not marketing copy, not an installed Codex skill, and not a replacement for the packet, source, QA, analytics, or blog foundation policies.

## Operating Rules

- Work from evidence, not vibes. Query data, Reddit, AI answers, SERPs, comments, and social posts are discovery inputs unless they resolve back to an approved factual source.
- Do not create or publish a blog page until the content packet passes the source, claim, editorial, metadata, and generator gates.
- Do not auto-publish content, redirects, source edits, metadata changes, or skill changes.
- Keep Reddit discovery-only. Reddit can expose language, objections, examples to investigate, and recurring questions. Reddit must not support article claims unless a human explicitly approves a narrow exception later.
- Do not automate unofficial ChatGPT network scraping or any brittle platform scraping that violates platform terms.
- Prefer original sources: platform docs, official company pages, primary research, case studies, customer-approved proof, first-party data, and named SME notes.
- Every daily run ends with a written decision: create packet, continue packet, run generator, refresh, monitor, park, merge, retire, or escalate.

## Source Of Truth Docs

- Local runbook: `local-automation-runbook.md`
- Topic authority: `topic-map.yaml`, `topic-coverage.csv`, `topic-scoring.md`, `topic-decisions.md`
- Query intelligence: `ai-query-intelligence.md`
- Source and QA policy: `source-and-qa-policy.md`
- Packet schema: `content-packet.md`
- Blog implementation foundation: `blog-foundation.md`
- Automation cadence: `automation-cadence.md`
- Analytics feedback: `performance-feedback.md`
- Readiness gate: `first-blog-readiness.md`
- Subagent contracts: `subagents/`

## Daily Run Sequence

Run the steps in this order. Stop at the first blocker that changes the decision for the day.

| Step | Owner | Goal | Output | Next handoff |
|---:|---|---|---|---|
| 0 | Orchestrator | Confirm scope, repo state, active packet, active topic, and allowed files. | Daily run plan and write boundaries. | Topic Authority Agent |
| 1 | Topic Authority Agent | Decide whether the topic deserves a post, H2, FAQ, table, refresh, merge, retirement, or parking. | Topic score and asset decision. | Query Intelligence Agent |
| 2 | Query Intelligence Agent | Cluster real buyer and answer-engine language around the approved topic. | Query cluster handoff with primary query, AEO question, secondary questions, and source gaps. | Trend Discovery Agent |
| 3 | Trend Discovery Agent | Find live market language, objections, and emerging angles. Reddit is discovery-only. | Trend notes with each item labeled `discovery_only`, `source_candidate`, or `ignore`. | Source Discovery Agent |
| 4 | Source Discovery Agent | Replace discovery leads with approved factual sources or identify source gaps. | Source shortlist, rejected-source notes, source gaps, and SME questions. | Packet Producer |
| 5 | Packet Producer | Create or update the strict content packet. | Brief, research synthesis, citations, SME notes, outline, draft, claim ledger, metadata, distribution pack, performance log, refresh notes, asset manifest. | Claim And QA Agent |
| 6 | Claim And QA Agent | Verify factual support, specificity, AEO structure, genericness, source quality, metadata, and packet completeness. | QA report with `approved`, `approved_with_notes`, or `rejected`. | Blog Generator Agent |
| 7 | Blog Generator Agent | Validate and render the approved packet into static blog output. | Dry run, generated page, index/sitemap/feed changes, publish report, checker output. | Publish QA Agent |
| 8 | Publish QA Agent | Confirm generated output is crawlable, linked, visually correct, and consistent with the foundation. | Technical QA result and publish recommendation. | Analytics Feedback Agent |
| 9 | Analytics Feedback Agent | Fold current performance, search, AI citation, and distribution signals into decisions. | Keep, update, expand, merge, retire, monitor, or investigate recommendation. | Skill Steward Agent |
| 10 | Skill Steward Agent | Turn repeated process failures into documented skill or SOP improvement candidates. | Improvement proposal or no-action note. | Orchestrator closeout |

The local command that ties the daily data pull, candidate planning, packet validation, dispatch preparation, and approved static generation checks together is:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

It calls `daily-runner.mjs` and then writes `content-run-report.json` and `content-run-report.md`. It does not scaffold packets unless `--scaffold-limit N` and `--scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:<date>` are provided, and it does not write generated output unless `--generate-approved` is provided.

Use `--scaffold-limit N` only after reviewing candidates, confirming the plain demand-promotion report when demand promotion was involved, and approving packet scaffolding with the run-specific scaffold marker. Demand promotion apply is also blocked while live deployment is blocked unless the owner explicitly defers that blocker with the run-specific `LIVE-DEPLOY-BLOCKER-DEFERRED:<date>` marker. For any publishing day, run the deterministic publish governor after packets are complete:

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd>
```

The governor writes `automation-runs/<date>/publish-plan.json` and `automation-runs/<date>/publish-plan.md`. It selects only strict-valid packets that pass status, approval, source-readiness, topic-decision, content-decision, already-published, and daily-limit gates. The default run is dry-run planning only.

Write static output only through:

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd> --generate-approved
```

Do not use broad generation loops for multiple-post days. The governor calls `scripts/blog-orchestrator.mjs generate` only for selected packets inside the configured daily limits.

The default publish ceiling supports guarded multi-post days: up to three selected packets per day and up to two per pillar, with role ceilings of one hub, three spokes, one case study, and two refreshes per day. Raising or lowering those limits is a config change, not a permission to bypass packet, source, query, QA, or human approval gates.

Each subagent role has a reusable contract under `docs/seo-aeo/subagents/`. The Orchestrator should copy the relevant role contract into each subagent prompt, then add the packet path, write scope, and expected output artifact.

The daily data runner also writes `automation-runs/<date>/subagent-queue.json` and `automation-runs/<date>/subagent-queue.md`. Those files are the handoff queue for Codex subagents and should be treated as proposed work until the orchestrator approves specific tasks.

When the demand import worklist has primary rank-1 requests, the subagent queue includes `demand_import_rank1` Query Intelligence tasks ahead of broad lifecycle work. These tasks are narrow review/acquisition tasks only: they may verify existing reviewed rows or write a blocked acquisition brief, but they must not fabricate demand, promote staging files, or unlock packet intake by themselves.

The daily data runner also writes `research/daily-content-plan/<date>/demand-import-worklist.csv`, `.json`, and `.md` after candidate planning. This worklist turns blocked query-handoff candidates into explicit validated-demand import requests for Google Trends CSV/API exports, Bing Webmaster exports, or separately reviewed query-tool exports. Each candidate gets ranked import options with a single `primary_recommended_import`; use lower-ranked rows only when the primary source is unavailable, empty, or needs corroboration. It does not create evidence or unlock packet intake by itself.

The daily data runner also writes `research/daily-content-plan/<date>/demand-import-pack/`. This pack contains header-only staging CSVs, per-request instructions, and a review checklist for the demand import worklist. The pack is outside `imports/`, is not read by the pipeline as evidence, and must not be promoted into `imports/` until real reviewed export rows are added and `run-demand-promotion.mjs --dry-run` passes. The promotion runner's `--apply` path is the guarded promotion route: it copies only valid non-empty staged rows, rebuilds discovery, validates the current query handoff, and scaffolds packets only when explicitly called with `--scaffold-limit` plus `--scaffold-approval-marker PACKET-SCAFFOLD-APPROVED:<date>`.

If repeated demand-acquisition attempts find no reviewed rows, the runner writes `automation-runs/<date>/demand-acquisition-tasks/source-request.json` and `.md`. This is a source-first lock: do not launch more exact-query acquisition workers until one listed reviewed export or verified source access exists. If the current manifest is empty, requested exports are rebuilt from current candidate rows, not stale report filenames.

The daily data runner also writes `automation-runs/<date>/subagent-dispatch/ready-batch.json`, `ready-batch.md`, and prompt files under `subagent-dispatch/prompts/`. Dispatch files contain only dependency-ready tasks. The orchestrator should launch one subagent per prompt file and should not combine multiple prompts into one larger assignment.

The daily data runner also writes `automation-runs/<date>/subagent-artifact-check.json` and `.md`. This checker validates completed subagent handoff files against the declared candidate, role, and minimum role-specific markers before later agents depend on them. It does not approve claims, sources, drafts, generation, or publishing.

Completed artifacts are not always positive handoffs. Stop notes, rejected QA reports, blocked metadata notes, and generator blocker notes count as completed work for the agent that wrote them, but they must not unlock content-movement phases. Draft, Claim Ledger, Metadata/Schema, Asset, Packet QA, Section QA, Blog Generator, Index/Feed, Publish QA, Distribution, and Analytics Feedback require a positive dependency artifact, not merely a non-empty file. Blog Generator also requires packet QA with `Decision: approved` or `Decision: approved_with_notes` and no blocking handoff.

The daily data runner also writes `research/daily-content-plan/<date>/refresh-targets.csv`, `.json`, and `.md`. Refresh candidates must resolve to exactly one existing packet before any refresh subagent edits packet-adjacent artifacts. A resolved refresh target is still not a publish approval; Analytics Feedback, route QA, and Orchestrator scope approval remain required. A blocked or ambiguous refresh target must never be converted into a new duplicate packet.

The daily data runner also writes `research/daily-content-plan/<date>/gap-ledger.csv`, `.json`, and `.md`. Rebuild it after subagent artifacts land. It aggregates blocker rows by candidate, owner, and source artifact so the next wave can be routed without rereading every note. It is not a packet-intake approval gate and cannot authorize drafting, generation, or publishing.

Gap ledger rows are split into active blockers and stale or mismatched artifact-lineage rows. Treat `topic-candidates.csv` as the current source of truth, and reconcile any artifact whose filename candidate, `Topic:`, or `Topic ID:` no longer matches the current candidate row before routing subagents from it.

For query-intelligence gating, the daily runner validates only the current date's `research/query-intelligence/<date>-daily-discovery/` folder. If the current discovery run is `no_inputs` or monitor-only, the runner records that current handoff status and does not validate or reuse older query-intelligence folders for packet intake.

Every daily run also writes `automation-runs/<date>/run-status.json`, `run-status.md`, and `next-actions.json`. Treat `run-status.json` as the first machine-readable handoff for future Codex sessions. It summarizes live metric access, analytics row counts, current-date query handoff readiness, candidate intake gates, ready subagent prompts, publish-governor limits, selected packets, blockers, and next actions.

Every daily run also writes `automation-runs/<date>/netlify-publish-check.json` and `.md`. Treat this as the local clean-deploy artifact check. It must be `ready` before any approved deploy path uses `outputs/netlify-publish`.

Every daily run also writes `automation-runs/<date>/live-deployment-check.json` and `.md`. Treat this as the live route and measurement check. If it reports blocked routes or a missing GA4 tag, fix deployment before expecting indexing, Search Console query rows, GA4 sessions, or AI citations from affected URLs.

Every daily run also writes `automation-runs/<date>/system-completion-audit.json` and `system-completion-audit.md`. Treat this as the recursive system audit, not as a publish gate. It maps the full SEO/AEO operating-system objective to current evidence and shows which major capabilities are complete, partial, or missing.

Use `scripts/seo-aeo/subagent-queue.mjs` as the ledger CLI. Claim a task before launching a subagent, complete it only after the declared artifact exists, or run `node scripts/seo-aeo/subagent-queue.mjs sync-completions --date <yyyy-mm-dd>` after agents finish so non-empty declared artifacts are recorded in `subagent-status.json`. Rerun `build-subagent-dispatch.mjs` after completion to unlock dependents.

Run `node scripts/seo-aeo/check-subagent-artifacts.mjs --date <yyyy-mm-dd>` after each subagent wave and before routing the next wave. A passing artifact check only means role handoff shape is acceptable; Source Registry, Claim Ledger, QA, and publish governor gates still decide factual support and publication readiness.

The queue is phase-scoped. It must not assign one agent to own a whole post. Full post and refresh candidates require separate lifecycle tasks for orchestration, topic authority, query intelligence, trend discovery, source registry, research synthesis, SME notes, outline, draft, claim ledger, metadata/schema, assets, packet QA, generation, index/feed verification, publish QA, distribution, analytics feedback, and skill stewardship.

Lower-score candidates still need coverage:

- `gap_resolution`: no drafting. Use orchestration, topic authority, query, trend, source, research, SME, QA, analytics, and skill steward tasks to resolve the blocker.
- `h2`, `faq`, or `comparison_table`: keep work scoped to the parent asset. Use separate outline, scoped draft, claim, metadata/schema, QA, analytics, and skill steward tasks.
- `park`, `merge`, or `retire`: no packet work. Use topic authority, trend, QA, analytics, and skill steward tasks to document the decision and reopen triggers.

## Step 0: Orchestrator Kickoff

The Orchestrator owns the run, not the article.

Daily kickoff checklist:

- Check current repo state before editing.
- Confirm the active topic, packet, or published URL.
- Confirm whether the run is discovery, packet creation, packet QA, generation, refresh, analytics, or skill stewardship.
- Confirm write boundaries for the day.
- Identify any unowned dirty files and avoid them unless they are explicitly in scope.
- Assign one subagent owner per step and one final reviewer.
- Use `node scripts/seo-aeo/build-subagent-dispatch.mjs --date <date>` after any subagent artifact lands to compute the next ready batch.

Kickoff output:

```yaml
daily_run:
  date: yyyy-mm-dd
  mode: discovery | packet | qa | generate | refresh | analytics | steward
  active_topic_id:
  active_packet:
  active_url:
  write_scope:
  blockers: []
  next_handoff: topic_authority
```

## Step 1: Topic Authority

Purpose: protect topical authority and prevent thin content fan-out.

Inputs:

- `topic-map.yaml`
- `topic-coverage.csv`
- `topic-scoring.md`
- `topic-decisions.md`
- Current analytics and query signals when available
- Sales, support, founder, and SME questions when approved for use

Agent tasks:

- Map the idea to a pillar, topic ID, parent topic, and coverage role.
- Score the topic using the 100-point rubric in `topic-scoring.md`.
- Decide the smallest useful asset: post, H2, FAQ, table, checklist, refresh, merge, retire, or park.
- Prefer `topic-coverage.csv` scores and decisions, then `topic-map.yaml`, before using any heuristic score.
- Check cannibalization against existing planned and published topics.
- Record the reason for the decision in plain language.

Daily decision rules:

- `80-100`: open or continue a packet if source readiness is strong enough; refresh instead when the mapped topic is already published or refresh-triggered.
- `65-79`: resolve evidence, SME, example, query, or POV gaps first. Do not draft.
- `50-64`: map to an H2, FAQ, comparison table row, checklist, or refresh note.
- `0-49`: park, merge, or retire unless it fills a strategic gap.

Handoff to Query Intelligence Agent:

```yaml
topic_handoff:
  topic_id:
  pillar_id:
  target_asset:
  asset_decision:
  decision:
  score:
  score_source:
  primary_query_candidate:
  aeo_question_candidate:
  parent_topic:
  internal_links:
  source_readiness:
  gaps_to_resolve:
```

## Step 2: AI And Query Intelligence

Purpose: learn how buyers and answer engines phrase the problem before writing.

Inputs:

- Topic handoff
- Manual/imported validated demand exports from GSC, Bing Webmaster Tools, Google Trends, first-party performance data, or separately reviewed query tools
- Discovery-only query expansion from AnswerThePublic, PAA, autocomplete, ChatGPT, AI-search prompts, and similar sources unless separately validated
- Manual SERP observations
- Manual People Also Ask observations
- Approved sanitized customer prompts
- Approved sanitized AI-search prompt exports
- Sales and support questions aggregated without personal or confidential details

Agent tasks:

- Normalize observations into query-level rows.
- Cluster by semantic intent, not exact keyword overlap.
- Use `node scripts/seo-aeo/build-discovery-run.mjs --date <yyyy-mm-dd>` to build the daily bridge from approved analytics, query exports, trend exports, and manual AI citation observations before packet planning.
- After `plan-content.mjs`, use `node scripts/seo-aeo/export-topic-seeds.mjs --date <yyyy-mm-dd>` and rerun `build-discovery-run.mjs` so the daily plan's topic candidates become discovery-only topic seeds for clustering and gap routing.
- Separate definition, comparison, how-to, example, measurement, objection, brand, and unknown intent.
- Identify the primary AEO question the article should answer directly.
- Flag source gaps and SME questions.
- Confirm that query data is marked `discovery_only`.
- Run `node scripts/seo-aeo/validate-query-intelligence.mjs research/query-intelligence/<yyyy-mm-dd-seed>` before any query handoff is accepted into packet intake.
- Use `--require-handoff-ready` for packet intake or packet scaffolding decisions.
- Treat validator blockers as packet blockers; warnings require an explicit owner note before moving forward.
- Keep `handoff_status: starter` or manual-only query runs in discovery/gap-resolution. Do not unlock draft, generator, distribution, or publish tasks from those inputs.
- When the daily run writes a demand import worklist, complete only those narrow import requests or launch Query Intelligence subagents against those requests. Do not treat the worklist itself as validated demand.

Required output:

- A query cluster handoff compatible with `ai-query-intelligence.md`
- A short recommendation: create packet, enrich existing packet, map to section, or park

Handoff to Trend Discovery Agent:

```yaml
query_handoff:
  topic_id:
  primary_query:
  aeo_question:
  secondary_queries: []
  related_questions: []
  intent_clusters: []
  funnel_stage:
  discovered_language:
  source_gaps: []
  sme_questions: []
  evidence_use: discovery_only
```

## Step 3: Trend Discovery

Purpose: find timely language, objections, examples, and weak signals without treating social chatter as proof.

Approved discovery inputs:

- Manual Google/Bing SERP notes
- Manual People Also Ask notes
- Manual LinkedIn observations when public and relevant
- Owner-approved sanitized manual Reddit captures only; Reddit API remains disabled unless explicitly reopened
- Product changelogs and official company news as source candidates
- Competitor pages as positioning and structure inputs, not evidence
- Sales calls, support notes, and customer questions only when approved and sanitized

Reddit rules:

- Use Reddit to find recurring questions, phrasing, objections, confusion, and example leads.
- Do not cite Reddit in public articles as factual evidence.
- Do not quote identifiable users in drafts unless a human approves the use case.
- Do not turn isolated threads into claims about market behavior.
- Convert any useful Reddit lead into a source-discovery task: find the original company page, platform doc, research report, or named SME confirmation.

Agent tasks:

- Record each trend as `discovery_only`, `source_candidate`, or `ignore`.
- Note the surface, date observed, and why it matters.
- Extract buyer language that may improve H2s, FAQs, comparison tables, or refresh notes.
- Identify emerging examples worth source discovery.

Handoff to Source Discovery Agent:

```yaml
trend_handoff:
  topic_id:
  trend_items:
    - surface:
      observed_at:
      theme:
      buyer_language:
      why_it_matters:
      evidence_use: discovery_only
      source_discovery_task:
  rejected_items: []
```

## Step 4: Source Discovery

Purpose: turn discovery into evidence or explicitly document why evidence is missing.

Inputs:

- Query handoff
- Trend handoff
- Existing packet citations when a packet already exists
- Approved source register
- SME notes or interview requests

Agent tasks:

- Find original sources for each material claim candidate.
- Prefer primary evidence over secondary summaries.
- Grade each candidate source as A, B, C, or Reject using `source-and-qa-policy.md`.
- Replace Reddit, listicles, social posts, and AI answers with original sources where possible.
- Create SME questions when source quality is insufficient.
- Mark stale, weak, missing, or risky evidence before drafting.

Acceptance criteria:

- Every material claim candidate has Grade A/B support, an SME path, or a decision to remove/avoid the claim.
- Every source has URL, title, publisher, author when available, date, accessed date, source type, reliability, and notes.
- Discovery-only inputs are not promoted into factual evidence.

Handoff to Packet Producer:

```yaml
source_handoff:
  topic_id:
  approved_sources:
    - source_id:
      url:
      title:
      publisher:
      date:
      grade:
      supports:
  rejected_sources:
    - url:
      reason:
  source_gaps: []
  sme_questions: []
  claims_to_avoid: []
```

## Step 5: Packet Generation

Purpose: build the strict pre-publication packet so the generator and QA do not infer article intent from loose notes.

Inputs:

- Topic handoff
- Query handoff
- Trend handoff
- Source handoff
- SME notes
- Existing packet artifacts when refreshing

Agent tasks:

- Create or update the packet path: `content-packets/<yyyy-mm-dd>-<slug>/`
- Complete `brief.yaml` first.
- Write `research.md` as synthesis, not pasted research.
- Populate `citations.json` with approved sources only.
- Capture `sme-notes.md` with approval status and unresolved questions.
- Create `outline.md` before drafting.
- Draft only from the approved outline and source set.
- Run the Claude Sonnet 4.6 audience-copy pass for public prose when `ANTHROPIC_API_KEY` is available, or record the owner-approved exception.
- For examples, case-study, LinkedIn, founder-led, or team-led posts, document literal public examples and URLs before draft approval.
- Build `article.blocks.json` so the generator can render without guessing, then compare it against `draft.md` because the generator publishes the block file.
- Maintain `claims-ledger.csv` for every factual, statistical, comparative, or expert claim.
- Prepare `publish-meta.yaml`, `distribution-pack.md`, `performance-log.csv`, `refresh-notes.md`, and `asset-manifest.json`.
- Use a post-local generated PNG hero in the current liquid mesh style; do not use SVG-drawn blog hero stand-ins unless explicitly requested.

Do not proceed when:

- The brief has no clear audience, intent, AEO question, or CTA.
- Source gaps affect the main promise of the page.
- The outline needs claims that are unsupported.
- The draft contains placeholder stats, invented examples, or unresolved TODOs.
- The article promises examples but lacks inspectable example URLs or documented source limitations.
- The Claude writing pass, draft/block parity check, or generated PNG hero requirement is missing without an owner-approved exception.

Handoff to Claim And QA Agent:

```yaml
packet_handoff:
  packet_path:
  topic_id:
  slug:
  status:
  primary_query:
  aeo_question:
  required_artifacts_present: true | false
  known_risks: []
  requested_review: source | claim | editorial | metadata | full_packet
```

## Step 6: Claim And QA Review

Purpose: decide whether the packet is safe and useful enough to render.

Inputs:

- Full packet
- `source-and-qa-policy.md`
- `content-packet.md`
- `blog-foundation.md`

Agent tasks:

- Audit every material claim against `claims-ledger.csv`.
- Confirm no banned source is used as factual evidence.
- Confirm Reddit and AI/search observations remain discovery-only.
- Check the answer appears near the top.
- Check H2s and FAQs map to real buyer questions.
- Check the article has specific examples, mechanisms, workflows, or source-backed distinctions.
- Check title, meta description, canonical, Open Graph, schema type, tags, excerpt, and internal links.
- Reject generic sections that could apply to any B2B content program.

QA decisions:

- `approved`: ready for dry-run generation.
- `approved_with_notes`: ready only if listed minor notes do not affect claims, source safety, or metadata.
- `rejected`: packet returns to the prior owner with blockers.

Handoff to Blog Generator Agent:

```yaml
qa_handoff:
  packet_path:
  decision:
  blockers: []
  non_blocking_notes: []
  approved_sources_count:
  unresolved_claims_count:
  ready_for_generator: true | false
```

## Step 7: Blog Generator

Purpose: render approved packets into crawlable static output and prove the generator did not drift from the packet.

Inputs:

- Approved packet
- QA handoff
- `blog-foundation.md`

Expected commands:

```sh
node scripts/blog-orchestrator.mjs validate content-packets/<packet>/
node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd
node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd --generate-approved
```

Agent tasks:

- Run validation before generation.
- Run the publish governor dry-run and inspect selected and blocked packet reasons.
- Generate only through the governor after the selected packets match the intended publish scope.
- Confirm the generated page, blog index, sitemap, feed, and publish report align with `publish-meta.yaml`.
- Run the shared checker against the generated output.
- Do not manually patch generated blog HTML unless the generator contract is broken and a human approves the exception.

Handoff to Publish QA Agent:

```yaml
generator_handoff:
  packet_path:
  slug:
  publish_plan:
  generated_files: []
  validation_result:
  governor_result:
  check_all_result:
  publish_report:
  generator_blockers: []
```

## Step 8: Publish QA

Purpose: verify the generated page is crawlable, usable, and consistent with the blog foundation before publish approval.

Inputs:

- Generated files
- Generator handoff
- `blog-foundation.md`
- `first-blog-readiness.md` when publishing the first or foundational post

Agent tasks:

- Confirm one H1, direct answer block, metadata, canonical, schema, source links, internal links, hero dimensions, alt text, and article structure.
- Confirm `/blog/`, `sitemap.xml`, and `feed.xml` include the post.
- Confirm the page follows shared CSS/JS contracts and does not add one-off article styling.
- Test desktop and mobile rendering when visual output changed.
- Test TOC, copy blocks, Copy Page, Ask AI, FAQ details, and source links when relevant.

Publish QA decisions:

- `ready_to_publish`
- `ready_after_minor_fix`
- `blocked`

Handoff to Analytics Feedback Agent:

```yaml
publish_qa_handoff:
  slug:
  url:
  decision:
  checks_passed: []
  blockers: []
  post_publish_tracking_required: true
```

## Step 9: Analytics Feedback

Purpose: turn performance data into editorial decisions without overreacting to noise.

Inputs:

- GA4 and Search Console exports when available
- Bing Webmaster Tools exports when available
- AI citation captures or approved exports
- Distribution performance
- CRM or sales notes when approved
- Existing `performance-log.csv` and analytics CSVs

Pre-dispatch readiness gate:

- Dispatch Analytics Feedback only when a published URL or approved monitoring target exists, the review window is defined, and at least one approved signal-bearing performance source is available.
- Or dispatch it when Orchestrator explicitly labels the assignment `analytics_readiness_investigation` because missing data itself is the process question.
- If neither condition is true, keep the candidate with the upstream blocker owner and skip Analytics Feedback.
- For unpublished `blocked_before_packet`, duplicate, `monitor_only`, park, merge, or retire candidates, skip Analytics Feedback by default unless the explicit investigation label is present.

Checklist addition:

- [ ] Analytics Feedback has a published URL or approved monitoring target, a review window, and at least one approved signal-bearing performance source, or Orchestrator has labeled the assignment `analytics_readiness_investigation`.

Daily active-promotion tasks:

- Update distribution performance for active posts or campaigns.
- Note qualified comments, sales replies, useful objections, and source gaps.
- Flag tracking anomalies, deploy effects, indexing delays, or missing exports.

Weekly review tasks:

- Update page-level and query-level performance.
- Capture the fixed AI citation query set using approved methods.
- Check whether Sell In Public is cited accurately, cited incorrectly, or missing where competitors appear.
- Recommend keep, update, expand, merge, retire, monitor, or investigate.

Decision rules:

- Do not refresh because of one volatile AI citation capture.
- Do not rewrite a post before the evidence window is sufficient unless there is a factual, legal, brand, or source-risk issue.
- Do not enter placeholder metrics.
- Every decision needs a stable `decision_id`, evidence window, evidence signature, primary signal, reason, owner, and recommended action.
- Treat `status` as approval state and `outcome` as execution state. Closed outcomes such as `completed`, `superseded`, `rejected`, or `no_action` must not route new packet work.
- Preserved approvals must not silently approve materially changed evidence; compare `evidence_signature` before routing.

Handoff to Skill Steward Agent:

```yaml
analytics_handoff:
  slug:
  evidence_window:
  primary_signal:
  recommended_action: keep | update | expand | merge | retire | monitor | investigate
  reason:
  process_failures: []
  skill_or_sop_candidates: []
```

## Step 10: Skill Steward Loop

Purpose: improve the operating system only when repeated evidence shows the process is failing.

Inputs:

- QA failures
- Generator failures
- Analytics decision notes
- Repeated genericness findings
- Repeated source-policy misses
- Repeated packet artifact gaps
- Repeated handoff ambiguity

Agent tasks:

- Group failures by root cause: unclear SOP, missing template field, weak skill instruction, generator contract gap, source policy gap, QA checklist gap, or training issue.
- Require repeated evidence before proposing a skill or SOP change.
- Prefer updating docs or templates before changing a skill.
- Do not edit installed skills during the daily run.
- Open a reviewed improvement proposal when a skill change is justified.

Learning candidate format:

```yaml
learning_candidate:
  candidate_id:
  date:
  source_type: qa | analytics | performance | generator | publishing | handoff | source_policy
  source_path:
  observed_problem:
  affected_workflow:
  target_skill:
  root_cause:
  evidence:
    - source_path:
      occurred_at:
      finding:
  repeat_count:
  reusability_classification: reusable_process_change
  proposed_change:
  risk:
  reviewer:
```

Validation rule:

```sh
node scripts/seo-aeo/check-skill-learning.mjs --file <candidate-file>
```

The checker must pass before a skill or SOP promotion proposal is treated as ready for review. It rejects missing fields, missing source paths, weak root-cause labels, and one-off QA findings that do not have at least two evidence items or `repeat_count >= 2`. If the issue is isolated, write a no-action note instead of a learning candidate.

Improvement proposal format:

```yaml
steward_proposal:
  date:
  source_failures: []
  affected_workflow:
  proposed_change_type: docs | template | skill | generator | analytics
  proposed_owner:
  expected_benefit:
  risk:
  approval_required: true
```

Closeout handoff to Orchestrator:

```yaml
daily_closeout:
  date:
  final_decision:
  changed_artifacts: []
  blockers: []
  next_owner:
  next_run_mode:
```

## Exact Subagent Roles

### Orchestrator

Owns sequencing, scope, repo hygiene, and final closeout.

Can write:

- Daily run notes
- Decision summaries
- Approved SOP updates

Cannot write:

- Blog HTML, analytics CSVs, scripts, content packets, or skills unless the day's explicit scope allows it.

Hands off to:

- Topic Authority Agent at kickoff
- Human reviewer when scope or approval is unclear

### Topic Authority Agent

Owns pillar fit, score, asset decision, and cannibalization checks.

Reads:

- `topic-map.yaml`
- `topic-coverage.csv`
- `topic-scoring.md`
- `topic-decisions.md`

Produces:

- `topic_handoff`
- Topic decision update when approved

Hands off to:

- Query Intelligence Agent

### Query Intelligence Agent

Owns query normalization, semantic clustering, intent mapping, and AEO question selection.

Reads:

- `ai-query-intelligence.md`
- Approved query exports and manual observations

Produces:

- `query_handoff`
- Brief-ready query cluster summary

Hands off to:

- Trend Discovery Agent
- Topic Authority Agent if the query evidence changes the asset decision

### Trend Discovery Agent

Owns market-language discovery and timely signal capture.

Reads:

- Manual SERP/PAA notes
- Public LinkedIn observations when relevant
- Reddit as discovery-only
- Competitor and category pages as positioning inputs

Produces:

- `trend_handoff`
- Rejected trend notes

Hands off to:

- Source Discovery Agent

### Source Discovery Agent

Owns evidence quality and source gap resolution.

Reads:

- `source-and-qa-policy.md`
- Query and trend handoffs
- Existing citations when refreshing

Produces:

- `source_handoff`
- Source grades
- SME questions
- Claims to avoid

Hands off to:

- Packet Producer
- Topic Authority Agent if source readiness changes the topic decision

### Packet Producer

Owns strict packet creation or refresh.

Reads:

- `content-packet.md`
- Topic, query, trend, and source handoffs
- SME notes

Produces:

- Required packet artifacts listed in `content-packet.md`
- `packet_handoff`

Hands off to:

- Claim And QA Agent

### Claim And QA Agent

Owns source, claim, genericness, AEO, metadata, and packet completeness review.

Reads:

- Full packet
- `source-and-qa-policy.md`
- `content-packet.md`
- `blog-foundation.md`

Produces:

- `qa-report.md`
- `qa_handoff`

Hands off to:

- Blog Generator Agent when approved
- Packet Producer when rejected

### Blog Generator Agent

Owns validation, dry run, generation, and generated-output checks.

Reads:

- Approved packet
- `blog-foundation.md`
- Generator command output

Produces:

- Generated static output
- Publish report
- `generator_handoff`

Hands off to:

- Publish QA Agent
- Human reviewer if generator output diverges from the packet

### Publish QA Agent

Owns final technical and visual QA before publish approval.

Reads:

- Generated files
- `blog-foundation.md`
- `first-blog-readiness.md` when applicable

Produces:

- Technical QA decision
- `publish_qa_handoff`

Hands off to:

- Analytics Feedback Agent after publish approval
- Blog Generator Agent if structural output is wrong

### Analytics Feedback Agent

Owns performance interpretation and refresh recommendations.

Reads:

- `performance-feedback.md`
- Analytics exports and logs
- Distribution data
- Approved sales or CRM notes

Produces:

- Content decision recommendation
- `analytics_handoff`

Hands off to:

- Topic Authority Agent for new topic opportunities
- Packet Producer for approved refresh work
- Skill Steward Agent for process issues

### Skill Steward Agent

Owns process-learning proposals, not direct skill edits.

Reads:

- QA failures
- Generator failures
- Analytics decisions
- Handoff problems
- Existing SOPs and templates

Produces:

- `steward_proposal`
- No-action note when failures are isolated or already covered

Hands off to:

- Orchestrator for approval routing
- Human owner for any skill, script, or template change

## Daily Decision Matrix

| Signal | Default action | Owner |
|---|---|---|
| Strong topic score and strong source readiness | Open or continue packet | Topic Authority Agent |
| Strong query demand but weak sources | Resolve source or SME gap first | Source Discovery Agent |
| Reddit thread exposes recurring objection | Treat as discovery-only and look for primary evidence | Trend Discovery Agent |
| AI citation missing for target query | Compare against source and page structure before recommending update | Analytics Feedback Agent |
| AI answer cites Sell In Public inaccurately | Investigate content clarity and source wording | Analytics Feedback Agent |
| Draft has unsupported material claims | Reject packet until claims are sourced, qualified, or removed | Claim And QA Agent |
| Generator output differs from packet metadata | Block publish and inspect generator contract | Blog Generator Agent |
| Repeated QA failure appears across packets | Create steward proposal | Skill Steward Agent |

## Daily Closeout

Every run ends with a concise closeout:

- What was decided.
- What changed.
- What did not change.
- Which artifacts were touched.
- Which blockers remain.
- Which agent owns the next action.

Closeout template:

```text
Decision:
Changed artifacts:
No-change areas:
Blockers:
Next owner:
Next action:
Next review date:
```
