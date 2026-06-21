---
name: sellinpublic-blog-batch-supervisor
description: Supervise multi-post Sell In Public blog batches by creating one isolated one-post orchestrator per requested article. Use when the user asks to generate, publish, launch, or prepare multiple SIP blog posts, says "generate X blogs/posts/articles", asks for parallel blog orchestrators, asks for one thread/context per blog, or wants a blog batch without manually reviewing each article. Coordinates the SEO/AEO packet workflow, blog foundation, blog QA, SEO writing style, image style, copywriting, public-reader QA, worktree threads, and final parent integration.
---

# Sell In Public Blog Batch Supervisor

Use this skill as the parent supervisor for multi-post blog work. Do not write the articles in the parent thread. The parent selects work, creates isolated one-post orchestrators, monitors completion, integrates branches one at a time, and performs final shared publish validation.

## Required Skills

Before acting, use the relevant Sell In Public blog skills:

- `$sellinpublic-blog-foundation` for static blog structure, render, assets, and publish checks.
- `$sellinpublic-blog-qa` for packet, claim, source, genericness, and public-copy readiness.
- `$sellinpublic-seo-blog` for article voice and banned AI-ish patterns.
- `$sellinpublic-image-style` for blog hero assets.
- `$sellinpublic-copywriting` for CTA and brand-fit copy.

Child orchestrator prompts must instruct each child to use the same skills.

## Hard Rule

One requested blog equals one isolated child orchestrator.

The parent must not batch-generate public prose. The parent may build the topic slate, launch children, review outputs, integrate branches, regenerate shared aggregate files, run final validation, and publish. Each child owns exactly one post.

## Thread Strategy

Prefer visible Codex app threads in separate worktrees.

1. Use thread tools when available. If not loaded, search for `list_projects`, `create_thread`, `set_thread_title`, `send_message_to_thread`, and `read_thread`.
2. Use `list_projects` to find the Sell In Public project.
3. For each selected post, use `create_thread` with a project worktree environment and a branch such as `codex/blog-<slug>`.
4. If direct thread creation is unavailable, use `fork_thread` with a worktree. If worktree threads are unavailable, use `multi_agent_v1.spawn_agent` only when the user has explicitly approved subagents or parallel agent work.
5. If no isolated execution primitive is available, stop. Do not simulate isolation inside one context window.

If tool policy requires explicit thread-creation approval and the current user message only says "generate X blogs," state that the repo batch workflow uses one background thread per blog and ask for approval before calling `create_thread`.

## Parent Workflow

1. Parse the requested count `X`, target publish date, and topic constraints.
2. Inspect existing SEO/AEO state before selecting topics:
   - `docs/seo-aeo/topic-coverage.csv`
   - `docs/seo-aeo/topic-map.yaml`
   - `automation-runs/<date>/owner-actions.md` when it exists
   - existing `content-packets/`
3. Select exactly `X` distinct topics unless the current repo gates show fewer eligible topics. If fewer are eligible, report blockers instead of filling the batch with weak topics.
4. Write or update a parent manifest under `automation-runs/<date>/blog-batch-supervisor/<batch-id>.json` when the task requires durable tracking.
5. Launch one child thread per topic with disjoint write scope.
6. While children run, do only parent-owned work: manifest updates, source slate checks, integration planning, and final validation preparation.
7. When a child completes, inspect its final report and branch diff. Reject child output that touched shared files or another post's files.
8. Integrate child branches one at a time. Resolve conflicts conservatively and never overwrite unrelated dirty work.
9. After all accepted child branches are integrated, regenerate shared files once:
   - `blog/index.html`
   - `sitemap.xml`
   - `feed.xml`
   - topic coverage or publish reports only when the workflow requires it
10. Run final validation and deployment checks from the parent branch.

## Child Ownership Contract

Each child may edit only:

- `content-packets/<yyyy-mm-dd>-<slug>/`
- `blog/<slug>/index.html`
- `public/assets/blog/<slug>/`
- post-local generated reports inside that packet

Each child must not edit:

- `blog/index.html`
- `sitemap.xml`
- `feed.xml`
- `docs/seo-aeo/topic-coverage.csv`
- shared CSS or JavaScript
- shared renderer, validator, automation, or SEO/AEO scripts
- other posts, packets, or assets

The parent owns shared aggregate files and final publish integration.

## Child Prompt Template

Use this prompt shape for each child:

```md
You are the one-post orchestrator for Sell In Public.

Assigned slug: <slug>
Assigned topic: <topic>
Assigned packet path: content-packets/<yyyy-mm-dd>-<slug>/
Assigned branch/worktree: <branch>

Use these skills before acting: $sellinpublic-blog-foundation, $sellinpublic-blog-qa, $sellinpublic-seo-blog, $sellinpublic-image-style, and $sellinpublic-copywriting.

Rules:
- Work on this post only.
- Do not edit blog/index.html, sitemap.xml, feed.xml, topic-coverage.csv, shared CSS, shared JS, shared renderer scripts, or any other post.
- Preserve unrelated dirty work.
- Build one complete content packet, article blocks, rendered static HTML, and post-local assets.
- Use approved primary sources and record evidence in citations and claims.
- Apply these anti-AIism rules in every artifact that can shape public copy, including research summaries, outlines, draft instructions, draft copy, article blocks, metadata, QA notes, distribution copy, and generator notes.
- No em dashes (`U+2014`). Rewrite with a comma, period, colon, semicolon, or parentheses.
- No banned words such as `unlock`, `leverage` as a verb, `supercharge`, `game-changer`, `revolutionize`, `seamless`, `robust`, `cutting-edge`, `transformative`, `elevate`, `empower`, `delve`, `holistic`, `synergy`, `frictionless`, `impactful`, `actionable`, `utilize`, `facilitate`, or `demonstrate`.
- No filler phrases such as `in today's fast-paced world`, `in today's competitive landscape`, `now more than ever`, `it's no secret that`, `we all know that`, `the truth is`, `let's be honest`, `here's the thing`, `the reality is`, `In this article`, `By the end of this post`, `At the end of the day`, `drive results`, `move the needle`, `add value`, or `stand out from the noise`.
- No binary correction pairs as emphasis. Banned examples: `The best system isn't complicated. It's repeatable.`, `LinkedIn is a signal surface. It's not a controlled content foundation.`, `This isn't just about visibility. It's about pipeline.`, `The goal isn't more content. It's better demand.`, `It's not just posting more. It's posting with a reason.`, and `Not only does this build trust, but it also creates demand.`
- Rewrite binary contrasts into one concrete sentence or support them with a source, workflow, example, or operating implication. Do not replace one banned pair with another.
- Do not pass forward public-facing rubric or process language such as `quality test`, `quality bar`, `selection criteria`, `helpful content guidance`, `people-first content`, `claim ledger`, `QA report`, or `source policy`.
- Run the Claude writing pass. The repo scripts auto-load `ANTHROPIC_API_KEY` from ignored local env files such as `secrets/seo-aeo.env`, `.env`, `.env.local`, or `~/.codex/env/sellinpublic-website.env`. If the key is still missing, treat that as a blocker unless the parent/user explicitly approves an exception in this turn.
- After render, run clean-context public-reader QA: node scripts/seo-aeo/public-reader-qa.mjs --packet <packet> --apply.
- If public-reader QA flags AI-ish prose, instruction leakage, rubric leakage, source-policy leakage, or examples drift, rewrite the source artifact, rerender, rerun public-reader QA, and record root cause.
- Run node scripts/check-blog-post.mjs blog/<slug>/index.html.
- Commit only your owned files if the post passes all gates.

Final response:
- Branch name
- Changed files
- Validation commands and results
- Public-reader report path and pass/fail status
- Any blockers
- Confirmation that no shared aggregate files were edited
```

## Required Child Gates

A child post is acceptable only when all relevant gates pass:

- Packet validation for publish stage.
- Applied Claude writing pass using `ANTHROPIC_API_KEY` from the process env or ignored local env files, or explicit current-turn exception.
- Static HTML rendered from `article.blocks.json`.
- `node scripts/check-blog-post.mjs blog/<slug>/index.html`.
- Clean-context public-reader QA with a model-based `public-reader-report.json` that hash-matches current rendered HTML.
- Post-local hero asset with honest dimensions.
- No shared aggregate files touched.
- Child branch has a clean, scoped commit or a clearly reported blocker.

Offline public-reader scans are useful diagnostics, but they are not publish gates.

## Parent Integration Gates

Before final publish, the parent must run:

```sh
node scripts/blog-orchestrator.mjs check-all
node scripts/seo-aeo/build-netlify-publish-dir.mjs
```

Also run post-specific validations for each accepted slug and any repo gate the active workflow requires. The Anthropic-backed scripts load ignored local env files automatically; if `ANTHROPIC_API_KEY` is still missing, do not create owner-approved exceptions automatically.

## Conflict And Failure Handling

- If a child touches shared files, reject or revert only that child branch's shared-file changes before integration.
- If two children produce overlapping packet paths or slugs, stop and resolve the manifest.
- If public-reader QA catches a leak, the child must fix it and record root cause before handoff.
- If a child cannot pass source, QA, rendering, or public-reader gates, mark that post blocked instead of replacing it with a weaker topic.
- If more threads are requested than the app or machine can run comfortably, still create one planned child per blog, but dispatch work in waves. Preserve one-thread-per-blog ownership.

## Final Report Shape

The parent final response should include:

- Number requested, launched, accepted, blocked, and published.
- Thread IDs and branch names for each child.
- Per-post validation summary.
- Shared files regenerated by the parent.
- Deployment status, including whether changes were committed and pushed.
- Any blockers that require owner action.
