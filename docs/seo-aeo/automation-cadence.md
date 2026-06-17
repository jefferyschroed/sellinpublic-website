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
| Monday AM weekly | Topic triage | Prioritized topic backlog | GTM owner approves top 1-3 topics |
| Tuesday AM weekly | Source refresh | Updated source register for active topics | SME approves claims and proof |
| Thursday AM weekly | AI citation checks | Citation visibility log | Operator reviews accuracy and risk |
| Friday AM weekly | Performance monitoring | Search/content scorecard | Owner chooses actions |
| First Friday monthly | Content retro | Keep/update/merge/retire decisions | Founder/GTM lead approves next month |
| One-time before publishing | First-blog launch checklist | Blog launch readiness | Final editorial and technical QA |

## Recurring Automations

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
Review this fixed query set and citation capture.

Identify where Sell In Public is cited, where competitors are cited, what angle the AI answer uses, whether the answer is accurate, and which page should be improved.

Return: query, surface, cited URLs, missing angle, accuracy risk, recommended content action.
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

## What Not To Automate

- Do not auto-publish posts, source edits, redirects, or metadata changes.
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

