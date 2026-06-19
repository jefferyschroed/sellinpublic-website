# SEO/AEO Integrations

Research date: 2026-06-17

Scope: GA4 Google tag, Google Search Console API/Search Analytics, optional Bing Webmaster Tools query data, and deferred Reddit Data API notes. This file records setup requirements, ownership boundaries, and the repo scripts that can run after Jeff provides the required IDs, credentials, and approvals.

## Ownership Boundary

Jeff owns vendor accounts, account-level approvals, OAuth consent, DNS, API access requests, paid/commercial approvals, and secret delivery.

Codex can edit this repo only after Jeff provides the required IDs, tokens, or verification values. Codex should not attempt to log in, request approvals, accept vendor terms, or create credentials on Jeff's behalf unless Jeff explicitly authorizes browser use for that exact account and task in the current thread.

Repo commands and data flow live in `data-pipeline.md`.

## GA4 Google Tag

### Deferred Requirements If Reopened Later

- Create or use a Google Analytics account, GA4 property, and web data stream for `https://sellinpublic.co/`.
- Use the web stream Measurement ID / Google tag ID, normally beginning with `G-`.
- Install the Google tag snippet immediately after the opening `<head>` tag on every measured page.
- Verify the tag with Tag Assistant or browser network requests to Google tag / Analytics endpoints.

### Requires Jeff If Reopened Later

- Sign in to Google Analytics.
- Create or select the Analytics account, GA4 property, and web data stream.
- Confirm the account/property roles. Google documents Editor access as required for property setup and for finding tag details.
- Provide the Measurement ID / Google tag ID.
- Approve adding analytics tracking to the public site and any related privacy/cookie copy changes.

### Codex Can Install After Jeff Provides The ID

- Add the Google tag snippet to the site head/template.
- Confirm the same tag is present on relevant static pages.
- Verify that the page loads requests to `googletagmanager.com` and GA endpoints.
- Run `node scripts/seo-aeo/install-google-tags.mjs` after `GA4_MEASUREMENT_ID` is set.
- Run `node scripts/seo-aeo/pull-ga4.mjs` after `GA4_PROPERTY_ID` and either `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_OAUTH_CREDENTIALS` are configured.
- The current Measurement ID is `G-QCYHK55RCG`. The current GA4 Data API property ID is `542210968`. The stream ID `15107657738` is an Analytics UI identifier, not the GA4 Data API property ID.
- Google Cloud Console is only needed for automated Data API access through the local scripts. It is not needed for the public tag snippet.
- Current API setup is owner-managed in Google Cloud. Service-account key downloads may be blocked by Google Cloud organization policy, so local automation should use OAuth authorized-user credentials unless that policy changes.
- Current local credential mode: OAuth authorized-user credentials at an ignored local path with Analytics readonly and Search Console readonly scopes.
- Google account context: when Chrome has multiple Google sessions open, use the approved Sell In Public owner account before reviewing GA4, Search Console, or Cloud Console credential pages.

### Storage

The GA4 Measurement ID is not a secret because it is published in client-side HTML. Do not store Google login credentials in the repo.

### Sources

- Google tag setup with gtag.js: https://developers.google.com/tag-platform/gtagjs
- GA4 setup for website/app: https://support.google.com/analytics/answer/9304153?hl=en
- GA4 Measurement ID: https://support.google.com/analytics/answer/12270356?hl=en
- Find Google tag ID: https://support.google.com/analytics/answer/9539598?hl=en

## Google Search Console API And Search Analytics

### Requirements

- Add and verify a Search Console property for `sellinpublic.co`.
- Prefer a Domain property for full domain coverage across protocols and subdomains. Domain properties require DNS verification. A URL-prefix property is narrower but supports more verification methods.
- Use a Google account with the required Search Console permission. Google documents read permission as enough for `searchAnalytics.query`.
- Create or use a Google Cloud project, enable the Search Console API, and create service-account credentials or OAuth credentials that can access the verified property.
- Use the least privileged scope for reporting: `https://www.googleapis.com/auth/webmasters.readonly`. Use `https://www.googleapis.com/auth/webmasters` only if write operations such as sitemap submission are explicitly approved.
- Call `POST https://www.googleapis.com/webmasters/v3/sites/siteUrl/searchAnalytics/query` with a Search Console property URL such as `sc-domain:sellinpublic.co` for a Domain property or `https://sellinpublic.co/` for a URL-prefix property.

### Requires Jeff

- Sign in to Search Console.
- Add and verify the property.
- If using a Domain property, log in to the DNS provider and add the Google TXT/CNAME verification record.
- If using URL-prefix verification, choose the method and provide the HTML tag or verification file value if Codex should place it in the repo.
- Sign in to Google Cloud Console, create/select the project, enable the Search Console API, and create the credential path Jeff approves.
- Grant the service account or OAuth identity the required Search Console permission.
- Provide the exact Search Console property URL and a secure path for credentials.
- Current local setup verifies OAuth mode, GA4 property access, and Search Console access for the configured Sell In Public property. Keep the credential file local and ignored.

### Codex Can Install After Jeff Provides Values

- Add a URL-prefix verification meta tag or verification file if Jeff chooses that method.
- Add documented environment variable names and local setup notes for approved API use.
- Run `node scripts/seo-aeo/pull-gsc.mjs` after `GSC_SITE_URL` and either `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_OAUTH_CREDENTIALS` are configured.

### Storage

The Search Console property URL is not secret. OAuth client secrets, refresh tokens, service credentials, and any downloaded credential files are secrets and must not be committed. The local default is ignored `secrets/`; OAuth authorized-user files should be written with owner-only permissions.

### Sources

- Add a website property: https://support.google.com/webmasters/answer/34592?hl=en
- Verify site ownership: https://support.google.com/webmasters/answer/9008080?hl=en
- Search Console API prerequisites: https://developers.google.com/webmaster-tools/v1/prereqs
- Search Console API authorization: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Search Analytics query reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Analytics query guide: https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics

## Bing Webmaster Tools

Current status: optional. `scripts/seo-aeo/pull-bing-webmaster.mjs` can pull Bing Webmaster `GetQueryStats` data when `BING_WEBMASTER_API_KEY` and `BING_WEBMASTER_SITE_URL` are configured. Manual Bing Webmaster/Search Performance exports are also supported through `imports/query-exports/` and the template at `docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv`.

### Requirements For API Pulls

- Add and verify `https://sellinpublic.co/` or the preferred property in Bing Webmaster Tools.
- Generate API access only from the verified Bing Webmaster Tools account.
- Use a Bing Webmaster API key as a local-only secret for the current repo script. Evaluate OAuth separately if the Bing lane is expanded later.
- Normalize query rows into the same analytics/discovery shapes used by Search Console rows, with `source: bing_webmaster_tools`.

### Requires Jeff For API Pulls

- Sign in to Bing Webmaster Tools.
- Add or confirm the verified Sell In Public site.
- Review and accept any Bing Webmaster API access terms.
- Provide the verified site URL and, only if approved, a local-only API key or OAuth setup details.

### Codex Can Run Only After Values Exist

- Add local environment/config placeholders without committing secrets.
- Run `node scripts/seo-aeo/pull-bing-webmaster.mjs` only after Jeff has approved the credential path.
- Let the daily runner skip this lane when Bing credentials are not configured.
- Keep API-derived rows as performance/query-demand data. They can validate demand for packet intake, but they cannot serve as factual evidence for article claims.
- Preserve manual Bing export support even when API pulls are available.

### Storage

The Bing verified site URL is not secret. Bing API keys, OAuth client secrets, access tokens, refresh tokens, and downloaded credential files are secrets and must not be committed.

### Sources

- Bing Webmaster Tools API access: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
- Bing Webmaster `GetQueryStats`: https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats?view=bing-webmaster-dotnet

## Reddit Data API

Current status: deferred and disabled by default. The daily loop should rely on GA4, Search Console, optional Bing Webmaster query data, other manual validated demand exports, discovery-only query expansion exports such as AnswerThePublic, and approved AI citation checks unless Jeff explicitly reopens Reddit API discovery.

### Requirements

- Treat Sell In Public use as commercial unless Jeff documents a clearly non-commercial use case. Reddit says commercial use includes use by a business or on behalf of a business and requires permission.
- Request and receive explicit Reddit approval before accessing Reddit data through the API.
- Use registered OAuth access. Reddit says unidentified traffic can be throttled or blocked and that Data API clients must authenticate with a registered OAuth token.
- Use a unique, descriptive User-Agent that includes platform, app ID, version, and Reddit username contact.
- Respect rate limits. Reddit currently documents 100 queries per minute per OAuth client ID for eligible free Data API access, averaged over a 10-minute window.
- Remove deleted Reddit user content and related user-identifying data from any local storage. Reddit recommends routine deletion of stored user data/content within 48 hours.

### Requires Jeff

- Sign in to Reddit with the account that will own the request.
- Read and accept Reddit's Responsible Builder Policy, Developer Terms, and Data API Terms.
- Submit the Reddit API access request. For a business use case, obtain Reddit's explicit written commercial approval or contract.
- Register/create the app or receive OAuth credentials only after Reddit allows it.
- Provide client ID, client secret, approved redirect URI if applicable, approved scopes, Reddit username, and approved User-Agent.
- Approve retention limits, deletion handling, and whether Reddit data may be stored at all.

### Codex Can Install Only If Reopened Later

- Add secret names and local/deployment configuration documentation.
- Add a configured User-Agent value.
- Run `node scripts/seo-aeo/pull-reddit-trends.mjs` after Reddit API approval and credentials are configured.
- Keep every Reddit-derived row marked `discovery_only`.

### Storage

Treat Reddit client secrets, refresh tokens, access tokens, and approval correspondence as secrets. Do not commit them. Treat client ID and User-Agent as non-secret configuration unless Jeff requests otherwise.

### Sources

- Developer Platform and accessing Reddit data: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- Reddit API access request form: https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164
- Responsible Builder Policy: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
- Reddit Data API Wiki: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
- Reddit live API docs: https://www.reddit.com/dev/api/
- Reddit OAuth2 technical guidance, linked from Reddit Help with a legacy-docs caveat: https://github.com/reddit-archive/reddit/wiki/oauth2
