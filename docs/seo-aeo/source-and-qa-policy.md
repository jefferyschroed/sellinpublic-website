# Source And QA Policy

This policy governs all Sell In Public SEO/AEO articles, content packets, and refreshes.

## Source Rules

Use original, attributable sources for every factual, statistical, causal, comparative, or best-practice claim.

Allowed evidence:

- Primary research reports with methodology, sample size, publisher, and date.
- Reputable original case studies with named company, context, and measurable outcome.
- Platform documentation, official product docs, changelogs, APIs, policy pages, and first-party data.
- Public first-party social posts from named founders, executives, team leads, or practitioners when the article is explicitly analyzing public content examples. Use the post URL as an example source, not as proof of broad performance claims.
- Government, academic, standards-body, or credible industry research.
- Company-owned data, customer interviews, or internal observations when clearly labeled.

Banned as evidence unless explicitly approved later:

- Reddit, Quora, Hacker News, forums, Discord/Slack screenshots, or social comment threads.
- Generic listicles, roundup posts, scraped-stat pages, SEO content farms, and unsourced "best tools" articles.
- AI-generated summaries, answer-engine outputs, or unattributed excerpts.
- Secondary blog posts that summarize other reports without adding original data.

Use secondary sources only for discovery. Cite the original source, not the summary.

## Evidence Grading

Grade every cited source before drafting.

- A: Primary, current, and directly relevant. Examples: platform docs, original research with methodology, first-party data, official reports.
- B: Credible but narrower. Examples: named case studies, reputable industry reports, expert analysis based on visible data.
- C: Context only. Useful for framing or terminology, but not enough to support material claims.
- Reject: Forums, Reddit, generic listicles, unsourced stats, anonymous claims, outdated pages, or sources that cannot be traced to original evidence.

Material claims require Grade A or B evidence. Grade C sources cannot support statistics, benchmarks, rankings, performance claims, or recommendations.

## Public LinkedIn Example Rules

Use public LinkedIn posts as example artifacts, not as statistical evidence.

- Prefer direct LinkedIn post URLs, author profile URLs, visible author role/title, and public company affiliation.
- Use approved collection paths: manual browser verification, the local Apollo/account-intel workflow for identifying profiles, or the Apify LinkedIn Profile Posts actor via `scripts/seo-aeo/fetch-linkedin-profile-posts.mjs`.
- Default Apify settings should keep cost and privacy tight: small `maxPosts`, no comments, no reactions, and no private data.
- Do not include scraped email addresses, private profile fields, reaction lists, or comment identities in public article copy.
- If a LinkedIn post is blocked, unavailable, or only visible through tool output, cite the capture limitation in QA and prefer a first-party company page instead of pretending the post was manually verified.
- Embedded posts are allowed only when they improve the reader's ability to inspect the example and the embed is public, stable, and accessible. Always keep a normal source link nearby.

## Claim Audit

Before publish, audit every paragraph for claims.

For each claim, record:

- Claim text.
- Claim type: statistic, factual, causal, comparison, recommendation, quote, prediction, or brand claim.
- Source URL and evidence grade.
- Source date and access date.
- Required action: keep, qualify, replace source, rewrite, or remove.

Rules:

- One source may support multiple nearby claims only when the connection is direct.
- If the evidence is weaker than the claim, soften the claim.
- If a claim cannot be sourced, mark it as experience/opinion or remove it.
- Do not imply causation from correlation unless the source proves causation.
- Do not use outdated stats when newer primary data exists.

## Genericness Audit

Every article must pass a genericness review before publish.

Reject or revise sections that:

- Could apply to any B2B company, any SEO blog, or any generic GTM agency.
- Repeat common advice without a specific mechanism, example, workflow, or source.
- Use vague claims like "boost visibility," "drive engagement," or "build authority" without showing how.
- Summarize search results instead of adding a clear point of view.
- Depend on listicle-style structure without original analysis.

Required specificity:

- Name the buyer, workflow, channel, tool, metric, or decision being discussed.
- Include concrete examples, operating details, or source-backed distinctions.
- Tie recommendations back to the reader's practical decision: what to do, what to avoid, which example proves the point, and what source supports the claim.
- Keep Sell In Public's point of view present through editorial judgment, examples, and structure. Commercial CTAs are allowed when they are clearly separated from the evidence and analysis.

## AEO/Page Architecture Checklist

Each page should be structured for both human scanning and answer-engine extraction.

Required:

- One clear H1 that matches the search intent.
- Short answer block near the top for the primary query.
- Descriptive H2s phrased around real questions or decision points.
- Concise definitions where terms may be ambiguous.
- Evidence-backed recommendations with visible source links.
- Comparison tables or checklists when the topic involves evaluation.
- FAQ section only when questions are specific and non-duplicative.
- Internal links to relevant service, proof, FAQ, or future blog pages.
- Clear meta title, meta description, canonical URL, and Open Graph fields.
- Schema where useful: Article, FAQPage, HowTo, BreadcrumbList, or Organization.

Avoid:

- Keyword stuffing.
- Thin FAQ padding.
- Repeating the same answer under multiple headings.
- Unsupported "best," "top," "proven," or "guaranteed" claims.

## Publish Readiness Checklist

Do not publish until all items pass.

- Source policy followed; no banned evidence used.
- Every material claim is sourced, qualified, or removed.
- Evidence grades are recorded.
- No Reddit, forums, or generic listicles used as evidence.
- Genericness audit passed.
- Editorial value audit passed: the main article body is useful, specific, and not feature-heavy.
- Article has a clear audience, intent, and point of view.
- Primary query is answered directly near the top.
- Headings are specific, useful, and non-repetitive.
- Page includes internal links and source links.
- Title tag and meta description are written.
- Canonical URL is set.
- Images have descriptive alt text when meaningful.
- No placeholder copy, fake stats, invented examples, or unverifiable claims.
- Final read confirms the page sounds like a useful Sell In Public field note, not a generic SEO article.
