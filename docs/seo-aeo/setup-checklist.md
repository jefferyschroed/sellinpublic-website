# Integration Setup Checklist

Research date: 2026-06-17

This checklist separates Jeff-only login/approval work from repo work Codex can do after IDs, verification values, and secrets exist. The repo now includes install and pull scripts, but they intentionally skip or fail with setup messages until the required values exist.

## Jeff Login Or Approval Required

### GA4 Google Tag

- [x] Sign in to Google Analytics.
- [x] Create or select the GA4 property and web data stream for `https://sellinpublic.co/`.
- [x] Copy the Measurement ID / Google tag ID: `G-QCYHK55RCG`.
- [x] Approve adding the Google tag to public site pages.
- [ ] Approve any privacy/cookie copy changes required by the business.

### Google Search Console And Search Analytics API

- [x] Sign in to Search Console with the approved Sell In Public owner account.
- [x] Confirm `sc-domain:sellinpublic.co` is accessible in Chrome.
- [x] Confirm Chrome is using the approved Sell In Public owner account before any GA4, Search Console, or Cloud Console credential work.
- [x] Confirm Jeff's Google account has at least read access for Search Analytics reporting.
- [x] Use Google Cloud Console only for OAuth/service-account/API automation; it is not needed for the public GA4 tag.
- [x] Create/select the Sell In Public Google Cloud project under the approved owner account.
- [x] Enable the Search Console API and Analytics Data API.
- [x] Create local automation credentials if the owner approves an API pull lane.
- [x] Create Google API credentials for local automation.
  - Service-account JSON is blocked by Google Cloud organization policy in this project.
  - Current fallback path is OAuth authorized-user credentials at the ignored path configured by `GOOGLE_OAUTH_CREDENTIALS`.
  - OAuth client secret files must stay in ignored local paths.
  - Current Cloud Console client is owner-managed for Sell In Public SEO/AEO local automation.
  - The downloaded desktop OAuth client lists a loopback redirect and the existing authorized-user credential is already initialized.
  - Initializer command: `node scripts/seo-aeo/init-google-oauth.mjs --client <ignored-oauth-client-json> --out <ignored-authorized-user-json> --expected-email <approved-owner-email>`.
  - The generated authorized-user file must be local-only, gitignored, and written with `0600` file permissions.
- [x] Approve readonly reporting scopes: GA4 Analytics readonly and Search Console readonly.
- [x] Add OAuth user identity/access for GA4 and verified Search Console reporting.
- [x] Validate Google credential access with `node scripts/seo-aeo/check-google-credentials.mjs`.
  - Current OAuth credential status, 2026-06-18: the ignored local authorized-user credential verifies GA4 metadata access for property `542210968` and Search Console access for `sc-domain:sellinpublic.co`.
  - Credential verification command: `node scripts/seo-aeo/check-google-credentials.mjs`. It should report `credential_mode: oauth`, GA4 metadata resource `properties/542210968/metadata`, and Search Console permission `siteOwner` without printing OAuth secrets.
  - The authorized-user file is the active local credential source; do not replace it from a different Google account.
- [x] Validate automation with `node scripts/seo-aeo/pull-ga4.mjs --date yyyy-mm-dd` and `node scripts/seo-aeo/pull-gsc.mjs --date yyyy-mm-dd`.
  - Current API state: both pulls authenticate successfully; GA4/GSC row counts are currently `0`, so the pipeline waits for data or reviewed manual exports.
- [x] Keep credentials in a secure local-only path. The repo default is ignored `secrets/`; an external path is also acceptable through env vars.

### Bing Webmaster Tools, Optional

- [ ] Sign in to Bing Webmaster Tools with the approved owner account.
- [ ] Add or confirm the verified Sell In Public site.
- [ ] Use manual Search Performance exports when no API key is configured.
- [ ] Generate API access only if Jeff approves the optional Bing API pull lane.
- [ ] Treat any Bing API key or OAuth credential as a local-only secret.

### Reddit Data API

- [x] Deferred. Reddit API discovery is disabled by default and is not part of the current setup.
- [ ] Reopen this lane only if Jeff explicitly approves Reddit API discovery later.

## Codex Can Install After Values Exist

### Local Readiness Audit

- [ ] Run `node scripts/seo-aeo/audit-readiness.mjs` before a daily run, content run, or handoff.
- [ ] Review all `warn` and `blocker` items. Missing credentials are warnings by design, so the audit can be used before Jeff has finished external setup.
- [ ] Use `node scripts/seo-aeo/audit-readiness.mjs --json` when another script or automation needs structured output.
- [ ] Use `node scripts/seo-aeo/audit-readiness.mjs --fail-on-blocker` only when an automation should exit non-zero for local blockers.

Audit categories:

- `ready`: required local file, output, directory, or validation check is present.
- `warn`: setup is incomplete or optional, but the local system can still continue with skipped credentialed steps.
- `blocker`: a configured local path is broken, required generated output is missing, JSON config is invalid, or strict packet validation fails.

### GA4

- [ ] Install the Google tag snippet in the site head/template using the provided `G-...` ID.
- [ ] Verify the tag loads on public pages.
- [ ] Run `node scripts/seo-aeo/install-google-tags.mjs`.
- [ ] Run `node scripts/seo-aeo/pull-ga4.mjs` after the Data API credential is configured.

### Google Search Console

- [ ] Install URL-prefix verification meta tag or verification file if Jeff chooses that verification method.
- [ ] Record the verified property URL, such as `sc-domain:sellinpublic.co` or `https://sellinpublic.co/`.
- [ ] Add environment variable names and setup notes for API pulls.
- [ ] Run `node scripts/seo-aeo/pull-gsc.mjs` after the credential is configured.

### Bing Webmaster Tools

- [ ] Keep manual Bing Webmaster/Search Performance export support through `imports/query-exports/`.
- [ ] Run `node scripts/seo-aeo/pull-bing-webmaster.mjs` only after the optional API key and site URL are configured.
- [ ] Confirm the daily runner skips the Bing lane cleanly when no Bing credential is configured.

### Reddit

- [x] Keep Reddit API discovery disabled by default with `SEO_AEO_REDDIT_ENABLED=false`.
- [ ] Do not request Reddit credentials, configure a User-Agent, or run `node scripts/seo-aeo/pull-reddit-trends.mjs` unless Jeff explicitly reopens this lane.
- [ ] Keep all Reddit output as discovery-only and review retention rules before storing it.

## Values To Provide

| Value | Secret? | Jeff provides | Codex can use for |
|---|---:|---|---|
| GA4 Measurement ID / Google tag ID | No | `G-...` | Public Google tag install. |
| GA4 Stream ID | No | `15107657738` | Analytics UI reference only; not used by the Data API pull script. |
| GA4 Property ID | No | `542210968` | Future automated GA4 Data API requests. |
| Search Console property URL | No | `sc-domain:sellinpublic.co` or `https://sellinpublic.co/` | Future Search Analytics requests. |
| Search Console verification token/file | No, but account-bound | Meta tag, HTML file, or DNS value | Repo placement only for URL-prefix methods. |
| Google service-account `client_email` | No | Owner-managed value | Add as read user to GA4 and Search Console if keyless/service-account access is used later. |
| Google service-account private key JSON | Yes | Blocked by current Cloud policy | Future authenticated API access if policy changes. |
| Google OAuth client secret JSON | Yes | Ignored local path | Local OAuth client for requesting/refreshing API access. |
| Google OAuth authorized-user JSON | Yes | Ignored local path | Active authenticated GA4/GSC API access for the approved owner account. |
| Bing Webmaster verified site URL | No | Optional, if Bing is configured | Manual exports or optional API query pulls. |
| Bing Webmaster API key | Yes | Optional/local only | Authenticated Bing Webmaster query pulls after approval. |
| Reddit enabled flag | No | `false` now | Keeps Reddit API discovery out of the daily loop. |
| Reddit credentials | Yes/private | Not needed now | Deferred unless Jeff explicitly reopens Reddit API discovery. |

## Source Links

- Google tag setup: https://developers.google.com/tag-platform/gtagjs
- GA4 setup: https://support.google.com/analytics/answer/9304153?hl=en
- GA4 Measurement ID: https://support.google.com/analytics/answer/12270356?hl=en
- Search Console property setup: https://support.google.com/webmasters/answer/34592?hl=en
- Search Console verification: https://support.google.com/webmasters/answer/9008080?hl=en
- Search Console API prerequisites: https://developers.google.com/webmaster-tools/v1/prereqs
- Search Console API authorization: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Search Analytics query reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Bing Webmaster Tools API access: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
- Bing Webmaster GetQueryStats: https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats?view=bing-webmaster-dotnet
- Reddit developer access overview: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- Reddit API access request form: https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164
- Reddit Responsible Builder Policy: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
- Reddit Data API Wiki: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
