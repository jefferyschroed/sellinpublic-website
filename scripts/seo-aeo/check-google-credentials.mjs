#!/usr/bin/env node
import { envOrConfig, loadConfig, requireValue } from "./lib/config.mjs";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

async function getJson(url, token, label) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const config = loadConfig(process.cwd());
  const propertyId = requireValue(
    envOrConfig("GA4_PROPERTY_ID", config.google?.ga4PropertyId),
    "Set GA4_PROPERTY_ID or google.ga4PropertyId in config/seo-aeo.config.json."
  );
  const siteUrl = requireValue(
    envOrConfig("GSC_SITE_URL", config.site?.searchConsoleSiteUrl),
    "Set GSC_SITE_URL or site.searchConsoleSiteUrl in config/seo-aeo.config.json."
  );

  const token = await getGoogleAccessToken(config, REQUIRED_SCOPES);
  const tokenInfo = await getJson(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    token,
    "Google tokeninfo"
  );
  const grantedScopes = new Set(String(tokenInfo.scope || "").split(/\s+/).filter(Boolean));
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length) {
    throw new Error(`Google token is missing required scope(s): ${missingScopes.join(", ")}`);
  }

  const gaMetadata = await getJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}/metadata`,
    token,
    "GA4 metadata access check"
  );
  const gscSite = await getJson(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`,
    token,
    "Search Console site access check"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        credential_mode: config.google?.credentialMode || process.env.GOOGLE_CREDENTIAL_MODE || "auto",
        ga4_property_id: propertyId,
        ga4_metadata_resource: gaMetadata.name || "",
        gsc_site_url: siteUrl,
        gsc_permission_level: gscSite.permissionLevel || "",
        scopes: REQUIRED_SCOPES,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
