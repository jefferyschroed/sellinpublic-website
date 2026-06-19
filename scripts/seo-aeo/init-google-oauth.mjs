#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ensureDir } from "./lib/config.mjs";

const DEFAULT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function readClientSecret(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const client = parsed.installed || parsed.web || parsed;
  if (!client.client_id || !client.client_secret) {
    throw new Error(`OAuth client file is missing client_id or client_secret: ${filePath}`);
  }
  return client;
}

function writeSecretJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmpPath, 0o600);
  fs.renameSync(tmpPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function listenForCode({ port, state }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      try {
        const url = new URL(request.url, `http://127.0.0.1:${port}`);
        if (url.pathname !== "/oauth2callback") {
          response.writeHead(404, { "content-type": "text/plain" });
          response.end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          response.writeHead(400, { "content-type": "text/plain" });
          response.end(`OAuth error: ${error}`);
          reject(new Error(`OAuth error: ${error}`));
          server.close();
          return;
        }
        const returnedState = url.searchParams.get("state");
        if (!returnedState || returnedState !== state) {
          response.writeHead(400, { "content-type": "text/plain" });
          response.end("OAuth state mismatch.");
          reject(new Error("OAuth state mismatch."));
          server.close();
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          response.writeHead(400, { "content-type": "text/plain" });
          response.end("Missing OAuth code.");
          reject(new Error("Missing OAuth code."));
          server.close();
          return;
        }
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<p>Google OAuth is connected for Sell in Public SEO/AEO automation. You can close this tab.</p>");
        resolve(code);
        server.close();
      } catch (error) {
        reject(error);
        server.close();
      }
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1");
  });
}

async function exchangeCode({ client, code, redirectUri }) {
  const response = await fetch(client.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth code exchange failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchUserInfo(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OAuth userinfo check failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const root = process.cwd();
  const clientPath = path.resolve(root, arg("--client", "secrets/google-oauth-client.json"));
  const outPath = path.resolve(root, arg("--out", "secrets/google-oauth.json"));
  const expectedEmail = normalizeEmail(arg("--expected-email", process.env.GOOGLE_OAUTH_EXPECTED_EMAIL || ""));
  const port = Number(arg("--port", "53682"));
  const scopes = (arg("--scopes") || DEFAULT_SCOPES.join(","))
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!fs.existsSync(clientPath)) {
    throw new Error(`OAuth client file not found: ${path.relative(root, clientPath)}`);
  }
  if (!expectedEmail) {
    throw new Error("Set --expected-email or GOOGLE_OAUTH_EXPECTED_EMAIL before starting OAuth.");
  }

  const client = readClientSecret(clientPath);
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = crypto.randomBytes(32).toString("hex");
  const authUrl = new URL(client.auth_uri || "https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("login_hint", expectedEmail);
  authUrl.searchParams.set("state", state);

  const codePromise = listenForCode({ port, state });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "open_auth_url",
        auth_url: authUrl.toString(),
        redirect_uri: redirectUri,
        expected_email: expectedEmail,
        output: path.relative(root, outPath),
      },
      null,
      2
    )
  );

  const code = await codePromise;
  const token = await exchangeCode({ client, code, redirectUri });
  if (!token.refresh_token) {
    throw new Error("OAuth response did not include a refresh_token. Re-run with prompt=consent and approve offline access.");
  }
  if (!token.access_token) {
    throw new Error("OAuth response did not include an access_token for account verification.");
  }

  const userInfo = await fetchUserInfo(token.access_token);
  const authorizedEmail = normalizeEmail(userInfo.email);
  if (!userInfo.email_verified || authorizedEmail !== expectedEmail) {
    throw new Error(
      `OAuth authorized the wrong Google account. Expected ${expectedEmail}, got ${authorizedEmail || "unknown"}.`
    );
  }

  writeSecretJsonAtomic(outPath, {
    type: "authorized_user",
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: token.refresh_token,
    token_uri: client.token_uri || "https://oauth2.googleapis.com/token",
    authorized_email: authorizedEmail,
    scopes,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "wrote_oauth_credentials",
        output: path.relative(root, outPath),
        authorized_email: authorizedEmail,
        file_mode: "0600",
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
