# Sell In Public SEO/AEO Blog Operating System

This folder is the repo-level SOP for Sell In Public's SEO, AEO, and AI-search content program. It is intentionally not an installed Codex skill yet. Use these docs to create, QA, publish, distribute, monitor, and refresh blog content.

No article should be drafted directly into the website until a content packet exists and passes the required gates.

## System Layers

The blog program now runs as a multi-agent operating system:

1. Topic authority layer scores whether a question deserves a post, H2, FAQ, table, refresh, merge, or retirement decision.
2. AI/AEO query intelligence collects discovery queries and clusters them by semantic intent before a packet is opened.
3. Packet agents create the strict content packet: brief, research, SME notes, outline, draft, claims, metadata, assets, distribution, and refresh logs.
4. Generator agents render approved packets into static HTML, blog index, sitemap, and feed output.
5. QA agents verify sources, AEO/SEO structure, voice, schema, links, feed inclusion, and browser behavior.
6. Analytics agents log post-publish performance and recommend keep, refresh, expand, merge, retire, or investigate decisions.
7. Skill steward agents turn repeated evidence-backed process failures into reviewed skill-improvement candidates.

## Operating Principle

Sell In Public publishes to become a trusted, cited reference for employee-generated content, LinkedIn-led expertise, and useful B2B social strategy.

Each article should teach before it converts. SEO and AEO still matter, but rankings should come from clear definitions, source-backed claims, named examples, practical checklists, and specific operating advice.

Every post should support:

- Buyer and practitioner education.
- Answer-engine citation quality.
- Search visibility for real questions.
- Employee-led content standards.
- Practical examples a reader can apply.
- Trust through research, case studies, and transparent sourcing.

## Category Definition

Primary category:

Employee-generated content for B2B teams.

Working definition:

Employee-generated content is original public content created from employee knowledge, work, observations, examples, and lived experience. It can include LinkedIn posts, tutorials, teardown notes, customer lessons, product walkthroughs, public documentation, and field notes.

Sell In Public position:

Sell In Public's editorial position is that employee-generated content works when it teaches from real expertise instead of repackaging brand announcements. The blog should show how strong examples work, cite evidence, and give readers reusable frameworks.

## What We Are Not

- A generic social media agency.
- A creator-brand ghostwriting shop.
- A cold email vendor.
- A content calendar vendor.
- A pure SEO content farm.
- A company-page posting service.
- A generic employee advocacy software alternative.

## Audience

Primary buyers:

- Founders.
- CEOs.
- Heads of Revenue.
- GTM leaders.
- Sales leaders.
- Lean marketing leaders at B2B software companies.

Internal users influenced:

- SDRs.
- AEs.
- RevOps.
- Customer-facing SMEs.
- Executives with market authority.

Buyer context:

These teams already have expertise, customer proof, objections, and account insight. Their bottleneck is turning that knowledge into trusted distribution and measurable sales movement.

## Blog Jobs To Be Done

Every article must serve at least one of these jobs:

- Define the category.
- Educate readers on employee-generated content, LinkedIn-led expertise, and B2B social strategy.
- Compare common alternatives such as employee advocacy, ghostwriting, creator programs, company-page content, and community-led content.
- Explain how examples from real companies work.
- Create reusable definitions, checklists, and source-backed reference pages.
- Answer high-intent buyer questions.
- Build trust before any commercial conversation happens.
- Help readers make better content decisions.

## SEO/AEO Strategy

SEO goal:

Win durable visibility for category, problem-aware, solution-aware, and comparison searches around employee-generated content, LinkedIn content strategy, founder-led content, employee advocacy, social selling, B2B thought leadership, and human-generated brand content.

AEO goal:

Make Sell In Public content easy for ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, and other answer engines to cite, summarize, and trust.

Required AEO traits:

- Direct answer near the top.
- Clear definitions.
- Short summary sections.
- Question-led H2s and H3s.
- Comparison tables where useful.
- Concrete operating steps.
- Named concepts used consistently.
- Evidence, examples, or proof points where available.
- Internal links to related concepts.
- Clear editorial POV.
- Article body stays useful, specific, and not feature-heavy. Commercial CTAs are allowed when separated from the article guidance.

## Evidence Basis

The current SOP is grounded in the research gathered on 2026-06-17:

- Ahrefs found branded web mentions and YouTube mentions correlate strongly with AI visibility, while content volume is weak: https://ahrefs.com/blog/ai-brand-visibility-correlations/
- Semrush found AI-cited pages over-index for clarity, E-E-A-T, Q&A format, section structure, and structured data elements: https://www.semrush.com/blog/content-optimization-ai-search-study/
- Authoritas found AI Overviews show heavily for problem-solving and specific-question intents, and far less for broad topic research: https://www.authoritas.com/blog/ai-overview-user-intent-research
- Ahrefs found adding JSON-LD schema alone did not materially improve AI citations: https://ahrefs.com/blog/schema-ai-citations/
- Profound found low cross-platform citation overlap and high citation volatility across AI search platforms: https://www.tryprofound.com/blog/ai-platform-citation-patterns
- Seer Interactive found citation status and query type matter materially for CTR in AI Overview SERPs: https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update

## Topic Architecture

### Pillar 1: Employee-Generated Content

Definitions, category education, strategy, operating models, employee activation, governance, and trust.

Example topics:

- What is employee-generated content?
- Employee-generated content vs employee advocacy.
- Examples of employee-generated content from B2B companies.

### Pillar 2: LinkedIn-Led GTM

Executive content, employee content, comments, profile strategy, audience learning, and buyer attention.

Example topics:

- LinkedIn content infrastructure for B2B sales teams.
- Founder content vs employee content.
- How teams should post on LinkedIn without sounding like marketing.

### Pillar 3: Examples And Case Studies

How strong employee-led content programs work in the wild.

Example topics:

- Clay's user-generated content loop and what B2B teams can learn from it.
- Lovable's community content strategy and builder-led learning loop.
- GitLab's handbook as public employee knowledge.

### Pillar 4: Content Operations

Editorial systems, SME interviews, content review, governance, source management, and publishing workflows.

Example topics:

- How to turn employee notes into useful content.
- How to build an editorial checklist for employee-generated content.
- How to review employee-generated content without killing the voice.

### Pillar 5: Measurement And Learning

Reporting, attribution, buyer-trust metrics, search visibility, answer-engine citations, audience questions, and weekly iteration.

Example topics:

- How to measure employee-generated content beyond impressions.
- LinkedIn content ROI beyond impressions.
- Employee advocacy ROI vs trust and audience learning.

See:

- `topic-map.yaml`
- `topic-scoring.md`
- `topic-coverage.csv`
- `topic-decisions.md`

## Query Intelligence

Before opening a non-trivial packet, run a query-intelligence pass from approved imports. Validated demand must come from manual/imported exports with traceable demand signals, such as Search Console, Bing Webmaster Tools, Google Trends CSV/API exports, first-party performance data, or a separately reviewed query-tool export.

AnswerThePublic, PAA, autocomplete, ChatGPT, AI-search prompts, and similar question-expansion sources remain discovery only unless their demand is separately validated. They can influence topics, briefs, H2s, FAQs, and refresh decisions, but they must not be cited as factual evidence.

Do not automate unofficial ChatGPT network scraping.

See:

- `ai-query-intelligence.md`
- `research/query-intelligence/<date>-<seed>/`

## Daily Data Pipeline

The memory-free local runbook is `local-automation-runbook.md`.

The single daily entrypoint is the top-level content controller:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

It calls the lower-level daily pipeline, writes the daily status and content-run report, builds subagent dispatch prompts, checks completed subagent handoff artifacts, and dry-runs the publish governor. It does not scaffold packets unless `--scaffold-limit <n>` is provided, and it does not write generated blog output unless `--generate-approved` is provided.

The lower-level daily pipeline pulls or imports available signals, rolls query/citation/distribution lanes into page-level feedback, scores performance rows, plans candidate topics, and writes subagent assignments. It runs locally and skips setup-dependent connectors until credentials exist.

```sh
node scripts/seo-aeo/daily-runner.mjs --date <yyyy-mm-dd>
```

See:

- `local-automation-runbook.md`
- `daily-operating-system.md`
- `data-pipeline.md`
- `integrations.md`
- `setup-checklist.md`
- `subagents/`

## Article Types

Definition posts:

Own category terms and answer basic buyer questions.

How-to posts:

Show operating depth and help buyers understand execution.

Comparison posts:

Help readers compare employee advocacy software, LinkedIn ghostwriting, creator programs, social selling tools, and content operations approaches.

Framework posts:

Create reusable frameworks and vocabulary for employee-generated content.

Case-study posts:

Break down real company examples, the strategy behind them, and what readers can apply.

## Workflow Summary

1. Create a content packet.
2. Complete the brief.
3. Research the topic using approved sources only.
4. Capture SME input.
5. Build an answer-first outline.
6. Draft from the approved outline.
7. Audit claims.
8. Run genericness and AEO QA.
9. Prepare publish metadata.
10. Publish only after final gate approval.
11. Distribute through LinkedIn and sales channels.
12. Monitor performance and refresh.

Every post must also pass the shared foundation checker before publishing:

```sh
node scripts/check-blog-post.mjs blog/[slug]/index.html
```

The governed publishing path is:

```sh
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd>
node scripts/seo-aeo/publish-governor.mjs --date <yyyy-mm-dd> --generate-approved
```

Use direct generator commands for validation, dry-runs, and debugging only. Do not use direct generation as the normal publish path because it bypasses daily limits and governor-specific checks.
Direct non-dry-run generator writes are blocked; static output must be written through the publish governor. If a real run selects more than one packet, the governor requires `--allow-multi-post` or `publishGovernor.allowMultiPostGeneration: true`.

```sh
node scripts/blog-orchestrator.mjs validate content-packets/<packet>/
node scripts/blog-orchestrator.mjs generate --dry-run content-packets/<packet>/
node scripts/blog-orchestrator.mjs check-all
```

See:

- `content-packet.md`
- `source-and-qa-policy.md`
- `automation-cadence.md`
- `performance-feedback.md`
- `daily-operating-system.md`
- `data-pipeline.md`
- `integrations.md`
- `setup-checklist.md`
- `first-blog-readiness.md`
- `blog-foundation.md`

## Initial Publishing Sequence

Start with foundational category ownership before narrower tactical posts.

Recommended first ten:

1. What Is Employee-Generated Content?
2. Employee-Generated Content vs Employee Advocacy.
3. Examples of Employee-Generated Content From B2B Companies.
4. LinkedIn Content Infrastructure for B2B Sales Teams.
5. How To Turn Employee Expertise Into Useful LinkedIn Posts.
6. How To Source Ideas From Sales, Support, Product, And Customer Success.
7. Clay, Lovable, And GitLab: What Their Public Content Loops Teach.
8. How To Measure Employee-Generated Content Beyond Impressions.
9. Employee Advocacy Software vs Employee-Generated Content.
10. Why Content Calendars Fail Employee-Generated Content Programs.

## Maintenance Cadence

Weekly:

- Review in-progress briefs.
- Check newly published pages.
- Add internal links.
- Review source freshness for active drafts.

Monthly:

- Review rankings and query movement.
- Refresh priority pages.
- Update topic map.
- Capture sales-use feedback.

Quarterly:

- Revisit category language.
- Re-score pillars.
- Prune weak topics.
- Add new proof and reporting language.
