import crypto from "node:crypto";
import fs from "node:fs";
import { envOrConfig, requireValue } from "./config.mjs";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function loadServiceAccount(config) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return {
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      source: "GOOGLE_SERVICE_ACCOUNT_JSON",
    };
  }

  const jsonPath = envOrConfig("GOOGLE_APPLICATION_CREDENTIALS", config.google?.serviceAccountJsonPath);
  if (jsonPath && fs.existsSync(jsonPath)) {
    return {
      credentials: JSON.parse(fs.readFileSync(jsonPath, "utf8")),
      source: jsonPath,
    };
  }
  return null;
}

function loadOauthCredentials(config) {
  if (process.env.GOOGLE_OAUTH_CREDENTIALS_JSON) {
    return {
      credentials: JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS_JSON),
      source: "GOOGLE_OAUTH_CREDENTIALS_JSON",
    };
  }

  const jsonPath = envOrConfig("GOOGLE_OAUTH_CREDENTIALS", config.google?.oauthCredentialJsonPath);
  if (jsonPath && fs.existsSync(jsonPath)) {
    return {
      credentials: JSON.parse(fs.readFileSync(jsonPath, "utf8")),
      source: jsonPath,
    };
  }
  return null;
}

function credentialMode(config) {
  const mode = String(envOrConfig("GOOGLE_CREDENTIAL_MODE", config.google?.credentialMode, "auto"))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (mode === "service_account" || mode === "oauth" || mode === "auto") return mode;
  throw new Error(`Unsupported GOOGLE_CREDENTIAL_MODE: ${mode}. Use oauth, service_account, or auto.`);
}

function loadGoogleCredentials(config) {
  const mode = credentialMode(config);
  const serviceAccount = loadServiceAccount(config);
  const oauth = loadOauthCredentials(config);

  if (mode === "oauth") {
    if (oauth) return { kind: "oauth", ...oauth };
    throwMissingCredentials(config, "OAuth credential mode is active, but no OAuth authorized-user credential was found.");
  }

  if (mode === "service_account") {
    if (serviceAccount) return { kind: "service_account", ...serviceAccount };
    throwMissingCredentials(config, "Service-account credential mode is active, but no service-account credential was found.");
  }

  if (serviceAccount) {
    return { kind: "service_account", ...serviceAccount };
  }

  if (oauth) {
    return { kind: "oauth", ...oauth };
  }

  throwMissingCredentials(config, "No Google credentials were found.");
}

function throwMissingCredentials(config, reason) {
  const serviceAccountPath = envOrConfig("GOOGLE_APPLICATION_CREDENTIALS", config.google?.serviceAccountJsonPath);
  const oauthPath = envOrConfig("GOOGLE_OAUTH_CREDENTIALS", config.google?.oauthCredentialJsonPath);
  const hints = [
    reason,
    "Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file.",
    "If service-account keys are blocked, set GOOGLE_OAUTH_CREDENTIALS or google.oauthCredentialJsonPath to an OAuth authorized-user JSON file.",
  ];
  if (serviceAccountPath) hints.push(`Configured service-account path was not found: ${serviceAccountPath}`);
  if (oauthPath) hints.push(`Configured OAuth path was not found: ${oauthPath}`);
  throw new Error(hints.join(" "));
}

async function getServiceAccountAccessToken(serviceAccount, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getOauthAccessToken(oauthCredentials) {
  requireValue(oauthCredentials.client_id, "OAuth credentials are missing client_id.");
  requireValue(oauthCredentials.client_secret, "OAuth credentials are missing client_secret.");
  requireValue(oauthCredentials.refresh_token, "OAuth credentials are missing refresh_token.");

  const response = await fetch(oauthCredentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauthCredentials.client_id,
      client_secret: oauthCredentials.client_secret,
      refresh_token: oauthCredentials.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function getGoogleAccessToken(config, scopes) {
  const loaded = loadGoogleCredentials(config);
  if (loaded.kind === "service_account") {
    return getServiceAccountAccessToken(loaded.credentials, scopes);
  }
  return getOauthAccessToken(loaded.credentials);
}
