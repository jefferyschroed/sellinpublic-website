#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { envOrConfig, loadConfig } from "./lib/config.mjs";

const DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeOrigin(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readKeyFile(root, keyFileArg) {
  const candidates = keyFileArg
    ? [keyFileArg]
    : fs.readdirSync(root).filter((name) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(name));
  for (const candidate of candidates) {
    const relativePath = candidate.replace(/^\/+/, "");
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(root) || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    const key = fs.readFileSync(absolutePath, "utf8").trim();
    if (key && key === path.basename(relativePath, ".txt")) return { key, relativePath };
  }
  throw new Error("No valid IndexNow key file found. Expected a root {key}.txt file whose content is the same key.");
}

async function readSitemapUrls(sitemapUrl) {
  const response = await fetch(sitemapUrl);
  if (!response.ok) throw new Error(`Sitemap fetch failed ${response.status}: ${await response.text()}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((match) => match[1].trim()).filter(Boolean);
}

async function run() {
  const root = process.cwd();
  const config = loadConfig(root);
  const origin = normalizeOrigin(arg("--origin", envOrConfig("SITE_ORIGIN", config.site?.origin, "https://sellinpublic.co")));
  const sitemapUrl = arg("--sitemap", `${origin}/sitemap.xml`);
  const endpoint = arg("--endpoint", DEFAULT_ENDPOINT);
  const dryRun = hasFlag("--dry-run");
  const { key, relativePath } = readKeyFile(root, arg("--key-file"));
  const keyLocation = `${origin}/${relativePath}`;
  const urlList = await readSitemapUrls(sitemapUrl);
  const payload = {
    host: new URL(origin).host,
    key,
    keyLocation,
    urlList,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dry_run: true,
          endpoint,
          sitemapUrl,
          submitted_count: urlList.length,
          keyLocation,
          first_url: urlList[0] || "",
          last_url: urlList.at(-1) || "",
        },
        null,
        2
      )
    );
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  console.log(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        submitted_count: urlList.length,
        keyLocation,
        first_url: urlList[0] || "",
        last_url: urlList.at(-1) || "",
        body: body.slice(0, 500),
      },
      null,
      2
    )
  );
  if (!response.ok) process.exit(1);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
