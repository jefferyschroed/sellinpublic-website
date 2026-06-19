# Subagent Work Order

Packet: `2026-06-19-employee-generated-content-vs-employee-advocacy`

## Production Rule

Only this first comparison post is in production. Posts #2-#20 from `docs/seo-aeo/foundation-20-post-publishing-plan.md` remain gated until owner review and approval after this post.

## Agents Used

- Topic Cartographer: created the 20-post foundation publishing plan and marked post #1 as the only active production item.
- Packet Intake Agent: created `brief.yaml`, `packet-intake.yaml`, `discovery-exclusions.json`, and `outline.md`.
- Source Registry Agent: created `research.md` and `citations.json`.
- Integrator: completed the strict packet, generated the page-specific hero asset, and prepared the article for QA and publish.

## Boundaries

- Discovery inputs can shape topic, structure, headings, FAQs, and internal links, but cannot support factual claims.
- Vendor/category sources can define market language, but not prove performance.
- The article body must teach the comparison first. Commercial CTA stays separate from the explanation.
- Employee advocacy must not be framed as bad or obsolete. It is a different operating model.

## Required QA

- Source QA: every factual claim must map to `claims-ledger.csv` and approved source IDs.
- Voice QA: body should not read like a sales pitch or repeat the user's feedback literally.
- AEO/SEO QA: direct answer near the top, comparison table, decision guide, FAQ, sources, and metadata.
- Browser QA: generated page must pass `scripts/check-blog-post.mjs`; desktop and mobile layout must render without distorted images.
