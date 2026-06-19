# Sell In Public Website

Static marketing site for Sell In Public.

## SEO/AEO Blog OS

Repo-level SOP docs for the SEO/AEO blog operating system live in `docs/seo-aeo/`.

Daily local runbook:

```sh
node scripts/seo-aeo/content-runner.mjs --date <yyyy-mm-dd>
```

See `docs/seo-aeo/local-automation-runbook.md` for daily, weekly, after-data, and subagent dispatch steps.

The shared static blog foundation lives in `blog/`. Use `docs/seo-aeo/blog-foundation.md`
before adding or changing post structure so every article keeps the same CMS-style shell.

Before publishing any post, run:

```sh
node scripts/check-blog-post.mjs blog/[slug]/index.html
```

## Deploy

The site is deployed on Netlify through the clean static publish builder. Netlify must run `node scripts/seo-aeo/build-netlify-publish-dir.mjs` and publish `outputs/netlify-publish`. Do not run a raw Netlify CLI deploy against the working repo root because local-only folders can exist beside the static files.

Before any deploy, review `automation-runs/<date>/deploy-review-packet.md`; `netlify-publish-check.md` must be `ready`, and `deployment-readiness.md` is not approval by itself.

Before interpreting GA4/Search Console data, verify the live static routes match the repo:

```sh
node scripts/seo-aeo/check-live-deployment.mjs --date <yyyy-mm-dd>
node scripts/seo-aeo/write-deployment-readiness.mjs --date <yyyy-mm-dd>
```

If Netlify is Git-connected, commit and push approved changes so Netlify runs the configured clean-output build. If using the Netlify CLI, build a clean publish directory first and deploy only that directory after publish/deploy approval:

```sh
node scripts/seo-aeo/build-netlify-publish-dir.mjs
npx --yes netlify-cli deploy --prod --dir outputs/netlify-publish
```
