# Blog Foundation SOP

This is the shared foundation for Sell In Public blog pages. The goal is to make every post look, read, and behave like part of the same CMS, while keeping each article crawlable on a static Netlify site.

## Architecture

Use an HTML-first hybrid.

- Each post gets a real static URL at `/blog/[slug]/index.html`.
- Each post contains the full article body in HTML, not JavaScript-rendered content.
- `blog/blog.css` owns the shared layout, rails, article typography, media blocks, CTA blocks, tables, copy blocks, and responsive rules.
- `blog/blog.js` owns progressive enhancement only: generated TOC, active section state, copy buttons, Copy Page, and Ask AI prompt copy.
- `blog/index.html` is the blog landing page and should link to every published post.
- Each post has a dedicated asset folder at `/public/assets/blog/[slug]/`.
- Blog index and post heads must include the shared site favicon from `/public/assets/brand/hashtagiconlight.webp`; use `scripts/site-head.mjs` in generators and keep the Netlify publish check blocking favicon omissions.
- `sitemap.xml`, `robots.txt`, and `feed.xml` must be updated when a post publishes.
- `scripts/check-blog-post.mjs` is the structural gate for every post before it ships.
- Netlify deploys the public site from GitHub. A local blog publish is not visible on `sellinpublic.co` until the scoped blog diff is committed and pushed to the GitHub remote.
- Public article prose must pass through Claude Sonnet 4.6 via the local Anthropic API runner before publish, unless the packet records an owner-approved exception. The applied Claude pass must write to `draft.md` and `article.blocks.json`, because `article.blocks.json` is what gets published.

This keeps title tags, meta descriptions, canonical URLs, schema, headings, links, body copy, and citations available in the initial HTML. Shared CSS and JS keep the structure consistent across every post.

## CMS-Style Foundation Contract

The blog is static HTML, but it must behave like a CMS foundation.

- Global visual changes belong in `blog/blog.css`, not per-post inline styles.
- Global interaction changes belong in `blog/blog.js`, not per-post scripts.
- Each post must keep the shared class and data-attribute contract so global changes apply everywhere.
- Each post must use the same shell: page-level layout, left rail, center blog main, intro, metadata, hero, mobile TOC, article body, right TOC, CTA, floating actions, and shared footer.
- Per-post differences are limited to metadata, schema, article copy, sources, FAQ, links, and post-local assets.
- Do not add one-off article styles unless the foundation is being intentionally changed for all posts.
- After changing the foundation, run the checker against every published post.

## Required Post Structure

Every post must include:

- Unique `<title>`, meta description, canonical, OG, Twitter, and article metadata.
- `BlogPosting` JSON-LD.
- `BreadcrumbList` JSON-LD.
- `FAQPage` JSON-LD when the article has FAQ content.
- One H1.
- A direct answer block before the first long body section.
- A post-specific hero image with descriptive alt text.
- Left rail with blog home, recent posts, and topics.
- Center `.blog-main` containing the intro, hero, mobile TOC, and article body.
- Right rail generated TOC with active section state.
- Mobile TOC disclosure.
- Source-backed claims and a sources section.
- Final CTA that gives the reader a clear next step such as a checklist, source review, related article, or simple commercial CTA.
- Visible author metadata for Jeffery Schroeder linking to `https://www.linkedin.com/in/jeffery-schroeder-957b98337/`.

## Standard Article Blocks

Use these shared blocks instead of inventing one-off layouts:

- `.blog-answer` for the short answer.
- `.blog-callout` for important context.
- `.blog-callout--dark` for high-emphasis notes.
- `.blog-media` for images or future videos.
- `.blog-table-wrap` and `.blog-table` for comparisons.
- `.copy-block` with `data-copy-block` for copyable frameworks, prompts, and checklists.
- `.blog-faq` for FAQ sections.
- `.blog-cta` for the final reader action or commercial next step.

## First Screen Rules

The first screen should make the topic clear without SEO padding.

- Kicker: category.
- H1: the exact buyer/search question or category definition.
- Dek: direct value and audience.
- Metadata: date, author, reading time, updated date.
- Hero image: post-specific, branded, landscape, no text baked into the image.
- Desktop side rails: visible from the first screen beside the headline and hero, sticky while scrolling, and positioned toward the page edges.
- Typography: keep the H1 closer to editorial article scale than landing-page hero scale. The current desktop cap is `52px`.

## Image And Media Rules

Every post must generate or deliberately create its own post-specific hero asset.

- Store post assets under `/public/assets/blog/[slug]/`.
- Do not reuse `/public/assets/hero/` as the blog hero.
- Use a generated PNG hero from `$sellinpublic-image-style`; do not ship SVG-drawn blog hero substitutes unless the user explicitly asks for vector output.
- Current blog hero style: warm Japanese-inspired blended mesh gradient with one simple focused liquid-glass UI object that summarizes the article topic. Avoid random icon clouds, flow lines, and harsh orange/blue contrast.
- Use a wide, short landscape hero ratio between `2.0:1` and `2.6:1`. The current target is close to `1600x700`.
- Set image `width` and `height` attributes to the actual source dimensions.
- Render the hero with natural height. Do not use forced hero heights or `object-fit: cover` on the article hero.
- Render inline `.blog-media` images and videos at their natural aspect ratio: `width: auto`, `max-width: 100%`, and `height: auto`.
- If a crop is desired, crop the source image itself and keep the HTML dimensions honest.

## Interaction Rules

These behaviors are foundation-level and should stay consistent across posts.

- Copyable frameworks use `.copy-block` with `data-copy-block`.
- Copy-block buttons are icon-only clipboard buttons with no text pill or surrounding dip.
- On successful copy, the clipboard icon animates into a check mark.
- Floating Copy Page and Ask AI buttons are translucent by default and become opaque on hover or focus.
- Floating buttons expand fluidly on copy success and show a check mark.
- FAQ items open and close with the shared resize transition, including a delayed close so content does not snap shut.
- FAQ sections should end cleanly. When Sources follows FAQ, avoid a detached top border or large blank gap that reads like an extra empty FAQ item.
- Desktop TOC uses one shared moving indicator and smooth color/weight transitions when the active section changes.
- CTA links inside `.blog-cta` are not underlined.

## Content Rules

- Answer the main query in the first 150 words.
- Use short, specific paragraphs.
- Avoid unsupported performance promises.
- Avoid generic SEO filler.
- Tie the topic back to the reader's problem through useful definitions, examples, workflows, source-backed distinctions, and clear operating advice.
- Keep SEO and AEO structure intact: direct answer, useful headings, searchable terms, schema, citations, and FAQs where appropriate.
- Use `$sellinpublic-seo-blog` before drafting, editing, or reviewing article copy.
- Use `scripts/seo-aeo/claude-blog-pass.mjs --packet content-packets/[packet]/ --apply` for the final audience-copy pass when `ANTHROPIC_API_KEY` is set locally. Record the applied pass output or an owner-approved exception in QA. Review-only sidecars do not satisfy the publish gate.
- FAQ items must be complete reader-facing question/answer pairs. Do not publish blank, whitespace-only, duplicate, placeholder, or visually empty FAQ rows in `article.blocks.json`, JSON-LD, or rendered HTML.
- Do not use em dashes in article copy.
- Use contractions naturally. If the post sounds like it avoided contractions, revise it.
- For examples posts, write a literal examples article. Include named companies, people or teams, public asset URLs, the visible lesson, and the pattern each artifact reveals. Do not write meta-guidance about how to write an examples article in place of examples. Avoid "Use Examples Without Copying Them," "How to Judge the Examples," "Copyable Example Checklist," "what B2B teams can borrow" table headers, and repeated "What to borrow:" sections unless the user explicitly asked for a checklist/how-to post. Do not publish source-policy or QA rubric language such as "Quality test," "quality bar," "selection criteria," "What Makes An Example Count," "what makes [anything] example worth studying," Google helpful content guidance, or "if this could have been written by any competitor." Keep those checks in research and QA, not the public article.
- Keep `draft.md` and `article.blocks.json` aligned. The generated HTML renders `article.blocks.json`, so QA must compare both before publish.

## External Tool Autonomy

Use the best available approved tool when it would materially improve the post.

- Use existing paid or configured services first: browser research, local Apollo/account-intel, Apify actors, analytics exports, and source-specific APIs.
- For public LinkedIn examples, discover credible founders, executives, team leads, or practitioners with Apollo/account-intel or public sources, then fetch public profile posts with `scripts/seo-aeo/fetch-linkedin-profile-posts.mjs` when `APIFY_TOKEN` is set locally.
- Keep cost and privacy tight: default to small limits, no reaction/comment scraping unless the article needs it, no email enrichment for content examples, and no private profile data in public copy.
- Do not commit API keys. Use `ANTHROPIC_API_KEY`, `ANTHROPIC_BLOG_MODEL`, `APIFY_TOKEN`, and `APOLLO_API_KEY` or the account-intel project's local `.env.local`.
- If a new free service signup would improve the post and the owner has approved that class of work for the batch, proceed only when no payment method, private personal data, or broader account permission is required. Record the signup/tool choice in the packet. Ask before paid upgrades, sensitive data sharing, or account actions outside the approved class.

## Editorial Voice Rules

Sell In Public blog posts should teach first and convert second.

- The main article body should be useful on its own.
- Do not describe Sell In Public's service model inside explanatory sections unless the article explicitly requires brand context.
- Avoid product-first phrases such as "managed system that turns," "handled replies," or "booked sales conversations" inside the article body.
- A Calendly CTA or the standard marketing footer is allowed, but keep it clearly separated from the research and examples.
- Use named examples, case studies, original research, statistics, and primary sources before making broad recommendations.
- Mention Sell In Public only as the publisher, author context, or a clearly labeled point of view.
- Prefer "what this example teaches" over "how we solve this for you."

## Source Rules

Follow `docs/seo-aeo/source-and-qa-policy.md`.

- Reputable original research, case studies, reports, or primary data only.
- No Reddit or generic opinion posts as evidence.
- Every statistic needs a source.
- If a claim is a Sell In Public POV, write it as a POV rather than a fact.

## Publishing Checklist

Before publishing:

- Work one post at a time. Do not start drafting, packet work, generation, or publishing for the next post until the current post is fully validated, committed, and pushed for Netlify deployment.
- Create or update the content packet.
- Record Claude writing-pass status, model, output file, and whether the pass was applied to `draft.md` and `article.blocks.json`, or record an owner-approved exception.
- For examples/case-study posts, record public example URLs and how they were found.
- Confirm each claim exists in the claims ledger.
- Check all external source links.
- Check internal links.
- Confirm every image has useful alt text unless decorative.
- Confirm the main article body is useful and not feature-heavy.
- Confirm the post appears on `/blog/`.
- Update `sitemap.xml`.
- Update `feed.xml`.
- Test desktop and mobile rendering.
- Test TOC active state.
- Test copy block buttons.
- Test Copy Page and Ask AI buttons.
- Run `node scripts/check-blog-post.mjs blog/[slug]/index.html`.
- Commit the scoped packet, static blog, asset, index, sitemap, feed, and process changes.
- Push the branch to GitHub so Netlify can auto deploy the published blog changes.

## Adding The Next Post

Start this sequence only after the prior post is fully done on its own.

1. Duplicate `/blog/employee-generated-content-infrastructure/index.html` into `/blog/[slug]/index.html`.
2. Replace all metadata, schema, article body, FAQ schema, and sources.
3. Generate a post-specific PNG hero under `/public/assets/blog/[slug]/`.
4. Add any inline article media under `/public/assets/blog/[slug]/`.
5. Confirm all image `width` and `height` attributes match the source files.
6. Add the post to `/blog/index.html`.
7. Add the post to the left rail recent links on published posts.
8. Update `sitemap.xml` and `feed.xml`.
9. Run `node scripts/check-blog-post.mjs blog/[slug]/index.html`.
10. Run local browser QA and save screenshots if the design changed.
11. Commit and push the scoped blog diff to GitHub for Netlify deployment.

Future automation can replace steps 1 through 8 with a local generator, but the committed artifact should remain static HTML.
