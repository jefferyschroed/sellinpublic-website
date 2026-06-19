#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readCsv } from "./lib/csv.mjs";
import {
  MIN_DECISION_EVIDENCE_ROWS,
  PAGE_SIGNAL_FIELDS,
  hasNumericValue,
  isPresent,
  pageDecisionEvidence,
  pageEvidenceKey,
} from "./lib/scoring.mjs";

const EXPECTED_ENV_KEYS = [
  "SEO_AEO_CONFIG",
  "GOOGLE_CREDENTIAL_MODE",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_OAUTH_CREDENTIALS",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_OAUTH_CREDENTIALS_JSON",
  "GA4_PROPERTY_ID",
  "GA4_MEASUREMENT_ID",
  "GSC_SITE_URL",
  "GSC_VERIFICATION_TOKEN",
  "BING_WEBMASTER_SITE_URL",
  "BING_WEBMASTER_API_KEY",
  "SEO_AEO_REDDIT_ENABLED",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_USER_AGENT",
];

const ANALYTICS_FILE_SPECS = {
  "analytics/page_daily.csv": {
    requiredHeaders: [
      "date",
      "page_url",
      "slug",
      "source_export_id",
      "source_file",
      "captured_by",
      "reviewed_by",
      "content_health_score",
      "refresh_priority_score",
      "decision_evidence_status",
      "decision_evidence_row_count",
      "decision_evidence_date_count",
      "decision_evidence_required_date_count",
      "decision_evidence_included",
      "decision_evidence_reason",
    ],
    identityFields: ["date"],
    oneOfIdentityFields: ["page_url", "slug"],
    numericSignalFields: PAGE_SIGNAL_FIELDS,
    provenanceFields: ["source_export_id", "source_file"],
    reviewFields: ["reviewed_by"],
    decisionEvidence: true,
  },
  "analytics/search_query_daily.csv": {
    requiredHeaders: [
      "date",
      "source",
      "query",
      "page_url",
      "slug",
      "source_export_id",
      "source_file",
      "captured_by",
      "reviewed_by",
    ],
    identityFields: ["date", "source", "query"],
    oneOfIdentityFields: ["page_url", "slug"],
    sourceOnlyIdentitySources: ["bing_webmaster_tools"],
    numericSignalFields: ["clicks", "impressions", "ctr", "avg_position"],
    textSignalFields: ["search_intent", "serp_features", "content_action"],
    provenanceFields: ["source_export_id", "source_file"],
    reviewFields: ["reviewed_by"],
  },
  "analytics/ai_citation_log.csv": {
    requiredHeaders: [
      "capture_date",
      "query",
      "surface",
      "source_export_id",
      "source_file",
      "reviewer",
      "target_page_url",
      "cited_url",
      "is_sell_in_public",
      "answer_accuracy",
    ],
    identityFields: ["capture_date", "query", "surface"],
    oneOfIdentityFields: ["target_page_url", "cited_url", "cited_domain"],
    numericSignalFields: ["citation_position"],
    textSignalFields: [
      "is_sell_in_public",
      "answer_angle",
      "answer_accuracy",
      "competitors_cited",
      "missing_angle",
      "recommended_action",
    ],
    provenanceFields: ["source_export_id", "source_file"],
    reviewFields: ["reviewer"],
  },
  "analytics/distribution_daily.csv": {
    requiredHeaders: [
      "date",
      "channel",
      "source_export_id",
      "source_file",
      "captured_by",
      "reviewed_by",
      "content_url",
      "slug",
    ],
    identityFields: ["date", "channel"],
    oneOfIdentityFields: ["content_url", "slug", "post_url"],
    numericSignalFields: ["impressions", "engagements", "clicks", "ctr", "comments", "shares", "saves", "leads", "meetings_booked"],
    textSignalFields: ["campaign", "next_action", "notes"],
    provenanceFields: ["source_export_id", "source_file"],
    reviewFields: ["reviewed_by"],
  },
  "analytics/content_decisions.csv": {
    requiredHeaders: [
      "decision_date",
      "slug",
      "page_url",
      "decision",
      "status",
      "decision_owner",
      "evidence_window_start",
      "evidence_window_end",
      "source_export_ids",
      "reviewed_by",
      "evidence_status",
      "evidence_row_count",
      "evidence_date_count",
      "evidence_required_date_count",
      "content_health_score",
      "refresh_priority_score",
      "primary_signal",
      "secondary_signal",
      "reason",
      "recommended_action",
      "due_date",
      "completed_date",
      "notes",
      "decision_id",
      "first_seen_date",
      "last_seen_date",
      "evidence_signature",
      "supersedes_decision_id",
      "packet_path",
      "refresh_notes_path",
      "outcome",
      "outcome_date",
    ],
    identityFields: ["decision_date", "decision", "status"],
    oneOfIdentityFields: ["slug", "page_url"],
    numericSignalFields: ["content_health_score", "refresh_priority_score", "evidence_row_count", "evidence_date_count"],
    textSignalFields: ["primary_signal", "reason", "recommended_action", "evidence_signature"],
    provenanceFields: ["source_export_ids"],
    reviewFields: ["reviewed_by"],
  },
};

function usage() {
  console.log(`Usage:
  node scripts/seo-aeo/audit-readiness.mjs
  node scripts/seo-aeo/audit-readiness.mjs --json
  node scripts/seo-aeo/audit-readiness.mjs --skip-packet-validation
  node scripts/seo-aeo/audit-readiness.mjs --fail-on-blocker

The audit reports ready, warn, and blocker checks. Missing credentials are warnings by default, not hard failures.`);
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function existsFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
}

function existsNonEmptyFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return existsFile(root, relativePath) && fs.statSync(absolutePath).size > 0;
}

function existsDir(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory();
}

function readTextIfExists(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return "";
  return fs.readFileSync(absolutePath, "utf8");
}

function parseDotEnv(source) {
  const values = {};
  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 1) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
}

function readJson(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { exists: false, value: null, error: "" };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(absolutePath, "utf8")), error: "" };
  } catch (error) {
    return { exists: true, value: null, error: error.message };
  }
}

function getPath(object, keys) {
  let cursor = object;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isMeaningful(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  return text !== "" && !/\bREPLACE\b|REPLACE_WITH_/i.test(text);
}

function item(category, area, check, detail, extra = {}) {
  return { category, area, check, detail, ...extra };
}

function add(items, category, area, check, detail, extra = {}) {
  items.push(item(category, area, check, detail, extra));
}

function configuredValue({ envName, configPath, dotEnv, localConfig, fallbackConfig }) {
  if (isMeaningful(process.env[envName])) {
    return { value: process.env[envName], source: "process environment" };
  }
  if (hasOwn(dotEnv, envName) && isMeaningful(dotEnv[envName])) {
    return { value: dotEnv[envName], source: ".env" };
  }
  if (localConfig && configPath) {
    const configValue = getPath(localConfig, configPath);
    if (isMeaningful(configValue)) {
      return { value: configValue, source: "config/seo-aeo.config.json" };
    }
  }
  if (fallbackConfig && configPath) {
    const configValue = getPath(fallbackConfig, configPath);
    if (isMeaningful(configValue)) {
      return { value: configValue, source: "config/seo-aeo.config.example.json fallback" };
    }
  }
  return { value: "", source: "" };
}

function sourceNote(source) {
  if (source === ".env") return " Present in .env; load it into the shell before running pull scripts.";
  if (source === "config/seo-aeo.config.example.json fallback") return " Using the checked-in example config fallback.";
  return "";
}

function checkSampleFiles(root, dotEnv, localConfigRead, exampleConfigRead, items) {
  if (existsNonEmptyFile(root, ".env.example")) {
    const sample = parseDotEnv(readTextIfExists(root, ".env.example"));
    const missingKeys = EXPECTED_ENV_KEYS.filter((key) => !hasOwn(sample, key));
    if (missingKeys.length) {
      add(items, "blocker", "setup", ".env.example keys", `Missing sample keys: ${missingKeys.join(", ")}.`);
    } else {
      add(items, "ready", "setup", ".env.example", "Environment sample exists with the expected SEO/AEO keys.");
    }
  } else {
    add(items, "blocker", "setup", ".env.example", "Missing or empty .env.example.");
  }

  if (exampleConfigRead.exists && !exampleConfigRead.error) {
    add(items, "ready", "setup", "config example", "config/seo-aeo.config.example.json exists and parses.");
  } else if (exampleConfigRead.exists) {
    add(items, "blocker", "setup", "config example", `config/seo-aeo.config.example.json is invalid JSON: ${exampleConfigRead.error}`);
  } else {
    add(items, "blocker", "setup", "config example", "Missing config/seo-aeo.config.example.json.");
  }

  if (existsNonEmptyFile(root, ".env")) {
    const present = EXPECTED_ENV_KEYS.filter((key) => isMeaningful(dotEnv[key]));
    add(items, "ready", "setup", ".env", `.env exists with ${present.length} populated expected key(s).`);
  } else {
    add(items, "warn", "setup", ".env", ".env is not present. This is okay if values are exported another way.");
  }

  if (localConfigRead.exists && !localConfigRead.error) {
    add(items, "ready", "setup", "local config", "config/seo-aeo.config.json exists and parses.");
  } else if (localConfigRead.exists) {
    add(items, "blocker", "setup", "local config", `config/seo-aeo.config.json is invalid JSON: ${localConfigRead.error}`);
  } else {
    add(items, "warn", "setup", "local config", "Optional config/seo-aeo.config.json is not present; scripts will fall back to env vars and the example config.");
  }
}

function checkGoogleSetup(root, dotEnv, localConfig, fallbackConfig, items) {
  const googleChecks = [
    {
      envName: "GA4_MEASUREMENT_ID",
      configPath: ["google", "ga4MeasurementId"],
      check: "GA4 measurement ID",
      missing: "Missing GA4_MEASUREMENT_ID or google.ga4MeasurementId; Google tag install is not ready.",
    },
    {
      envName: "GA4_PROPERTY_ID",
      configPath: ["google", "ga4PropertyId"],
      check: "GA4 property ID",
      missing: "Missing GA4_PROPERTY_ID or google.ga4PropertyId; GA4 Data API pulls will skip or fail setup.",
    },
    {
      envName: "GSC_SITE_URL",
      configPath: ["site", "searchConsoleSiteUrl"],
      check: "GSC site URL",
      missing: "Missing GSC_SITE_URL or site.searchConsoleSiteUrl; Search Console pulls will skip or fail setup.",
    },
  ];

  for (const check of googleChecks) {
    const configured = configuredValue({ ...check, dotEnv, localConfig, fallbackConfig });
    if (configured.value) {
      add(items, "ready", "google", check.check, `${check.envName} is configured via ${configured.source}.${sourceNote(configured.source)}`);
    } else {
      add(items, "warn", "google", check.check, check.missing);
    }
  }

  const verificationToken = configuredValue({
    envName: "GSC_VERIFICATION_TOKEN",
    configPath: null,
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  if (verificationToken.value) {
    add(items, "ready", "google", "GSC verification token", `GSC_VERIFICATION_TOKEN is configured via ${verificationToken.source}.${sourceNote(verificationToken.source)}`);
  } else {
    add(items, "warn", "google", "GSC verification token", "GSC_VERIFICATION_TOKEN is not set. This is okay if Search Console uses DNS/domain verification.");
  }

  const credentialModeConfigured = configuredValue({
    envName: "GOOGLE_CREDENTIAL_MODE",
    configPath: ["google", "credentialMode"],
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  const credentialMode = String(credentialModeConfigured.value || "auto")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (!["oauth", "service_account", "auto"].includes(credentialMode)) {
    add(items, "blocker", "google", "credential mode", `Unsupported Google credential mode: ${credentialMode}. Use oauth, service_account, or auto.`);
  } else {
    add(items, "ready", "google", "credential mode", `Google credential mode is ${credentialMode} via ${credentialModeConfigured.source}.${sourceNote(credentialModeConfigured.source)}`);
  }

  const serviceAccountJson = configuredValue({
    envName: "GOOGLE_SERVICE_ACCOUNT_JSON",
    configPath: null,
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  if (serviceAccountJson.value && credentialMode !== "oauth") {
    try {
      JSON.parse(serviceAccountJson.value);
      add(items, "ready", "google", "service account JSON", `GOOGLE_SERVICE_ACCOUNT_JSON is set and parses as JSON via ${serviceAccountJson.source}.${sourceNote(serviceAccountJson.source)}`);
    } catch (error) {
      add(items, "blocker", "google", "service account JSON", `GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${error.message}`);
    }
    return;
  }

  const oauthJson = configuredValue({
    envName: "GOOGLE_OAUTH_CREDENTIALS_JSON",
    configPath: null,
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  if (oauthJson.value && credentialMode !== "service_account") {
    try {
      const parsed = JSON.parse(oauthJson.value);
      if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
        add(items, "blocker", "google", "OAuth credentials JSON", "GOOGLE_OAUTH_CREDENTIALS_JSON parses but is missing client_id, client_secret, or refresh_token.");
      } else {
        add(items, "ready", "google", "OAuth credentials JSON", `GOOGLE_OAUTH_CREDENTIALS_JSON is set and parses via ${oauthJson.source}.${sourceNote(oauthJson.source)}`);
      }
    } catch (error) {
      add(items, "blocker", "google", "OAuth credentials JSON", `GOOGLE_OAUTH_CREDENTIALS_JSON is set but is not valid JSON: ${error.message}`);
    }
    return;
  }

  const serviceAccountPath = configuredValue({
    envName: "GOOGLE_APPLICATION_CREDENTIALS",
    configPath: ["google", "serviceAccountJsonPath"],
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  const oauthPath = configuredValue({
    envName: "GOOGLE_OAUTH_CREDENTIALS",
    configPath: ["google", "oauthCredentialJsonPath"],
    dotEnv,
    localConfig,
    fallbackConfig,
  });

  if (serviceAccountPath.value && credentialMode !== "oauth") {
    const absolutePath = path.resolve(root, serviceAccountPath.value);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      add(items, "ready", "google", "service account file", `Service-account file exists at ${relative(root, absolutePath)} via ${serviceAccountPath.source}.${sourceNote(serviceAccountPath.source)}`);
      return;
    }
  }

  if (oauthPath.value && credentialMode !== "service_account") {
    const absolutePath = path.resolve(root, oauthPath.value);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      try {
        const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
        if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
          add(items, "blocker", "google", "OAuth credentials file", `OAuth credentials file exists at ${relative(root, absolutePath)} but is missing client_id, client_secret, or refresh_token.`);
        } else {
          add(items, "ready", "google", "OAuth credentials file", `OAuth credentials file exists at ${relative(root, absolutePath)} via ${oauthPath.source}.${sourceNote(oauthPath.source)}`);
        }
      } catch (error) {
        add(items, "blocker", "google", "OAuth credentials file", `OAuth credentials file is not valid JSON: ${error.message}`);
      }
      return;
    }
  }

  const configuredPaths = [];
  if (serviceAccountPath.value && credentialMode !== "oauth") configuredPaths.push(`service-account path ${serviceAccountPath.value} via ${serviceAccountPath.source}`);
  if (oauthPath.value && credentialMode !== "service_account") configuredPaths.push(`OAuth path ${oauthPath.value} via ${oauthPath.source}`);
  add(
    items,
    "warn",
    "google",
    "Google credentials file",
    configuredPaths.length
      ? `Configured credential paths are missing (${configuredPaths.join("; ")}). Google pulls will skip until one exists.`
      : "No Google credential path is configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_OAUTH_CREDENTIALS."
  );
}

function checkBingSetup(dotEnv, localConfig, fallbackConfig, items) {
  const siteUrl = configuredValue({
    envName: "BING_WEBMASTER_SITE_URL",
    configPath: ["bing", "webmasterSiteUrl"],
    dotEnv,
    localConfig,
    fallbackConfig,
  });
  const apiKey = configuredValue({
    envName: "BING_WEBMASTER_API_KEY",
    configPath: ["bing", "webmasterApiKey"],
    dotEnv,
    localConfig,
    fallbackConfig,
  });

  if (siteUrl.value && siteUrl.source !== "config/seo-aeo.config.example.json fallback") {
    add(items, "ready", "bing", "Bing Webmaster site URL", `BING_WEBMASTER_SITE_URL is configured via ${siteUrl.source}.${sourceNote(siteUrl.source)}`);
  } else {
    add(items, "warn", "bing", "Bing Webmaster site URL", "Optional Bing Webmaster API pulls will skip until BING_WEBMASTER_SITE_URL or bing.webmasterSiteUrl is configured.");
  }

  if (apiKey.value && apiKey.source !== "config/seo-aeo.config.example.json fallback") {
    add(items, "ready", "bing", "Bing Webmaster API key", `BING_WEBMASTER_API_KEY is configured via ${apiKey.source}.${sourceNote(apiKey.source)}`);
  } else {
    add(items, "warn", "bing", "Bing Webmaster API key", "Optional Bing Webmaster API pulls will skip until BING_WEBMASTER_API_KEY or bing.webmasterApiKey is configured. Keep this value secret.");
  }
}

function booleanSetting({ envName, configPath, dotEnv, localConfig, fallbackConfig, fallback = false }) {
  if (process.env[envName] === "true") return true;
  if (process.env[envName] === "false") return false;
  if (dotEnv[envName] === "true") return true;
  if (dotEnv[envName] === "false") return false;
  const value = getPath(localConfig, configPath);
  if (value === true || value === false) return value;
  const fallbackValue = getPath(fallbackConfig, configPath);
  if (fallbackValue === true || fallbackValue === false) return fallbackValue;
  return fallback;
}

function checkRedditSetup(dotEnv, localConfig, fallbackConfig, items) {
  const enabled = booleanSetting({
    envName: "SEO_AEO_REDDIT_ENABLED",
    configPath: ["reddit", "enabled"],
    dotEnv,
    localConfig,
    fallbackConfig,
    fallback: false,
  });

  if (!enabled) {
    add(items, "ready", "reddit", "Reddit discovery", "Reddit API discovery is disabled by default and is not required for the current SEO/AEO loop.");
    return;
  }

  const envOnlyChecks = [
    {
      envName: "REDDIT_CLIENT_ID",
      check: "Reddit client ID",
      missing: "Missing REDDIT_CLIENT_ID; Reddit discovery pulls will skip or fail setup.",
    },
    {
      envName: "REDDIT_CLIENT_SECRET",
      check: "Reddit client secret",
      missing: "Missing REDDIT_CLIENT_SECRET; Reddit discovery pulls will skip or fail setup.",
    },
    {
      envName: "REDDIT_USER_AGENT",
      check: "Reddit user agent",
      missing: "Missing REDDIT_USER_AGENT; Reddit discovery pulls will skip or fail setup.",
    },
  ];

  for (const check of envOnlyChecks) {
    const configured = configuredValue({ envName: check.envName, configPath: null, dotEnv, localConfig, fallbackConfig });
    if (configured.value) {
      add(items, "ready", "reddit", check.check, `${check.envName} is configured via ${configured.source}.${sourceNote(configured.source)}`);
    } else {
      add(items, "warn", "reddit", check.check, check.missing);
    }
  }

  const configUserAgent = getPath(localConfig, ["reddit", "userAgent"]) || getPath(fallbackConfig, ["reddit", "userAgent"]);
  if (!isMeaningful(process.env.REDDIT_USER_AGENT) && !isMeaningful(dotEnv.REDDIT_USER_AGENT) && isMeaningful(configUserAgent)) {
    add(items, "warn", "reddit", "Reddit config user agent", "reddit.userAgent exists in local config, but pull-reddit-trends.mjs requires REDDIT_USER_AGENT in the environment.");
  }

  const subreddits = getPath(localConfig, ["reddit", "subreddits"]) || getPath(fallbackConfig, ["reddit", "subreddits"]);
  const queries = getPath(localConfig, ["reddit", "queries"]) || getPath(fallbackConfig, ["reddit", "queries"]);
  if (Array.isArray(subreddits) && subreddits.length && Array.isArray(queries) && queries.length) {
    add(items, "ready", "reddit", "Reddit discovery config", "Local config includes subreddit and query targets.");
  } else {
    add(items, "warn", "reddit", "Reddit discovery config", "No local Reddit subreddit/query config found; scripts may fall back to the example config.");
  }
}

function checkOutputs(root, items) {
  for (const relativePath of ["sitemap.xml", "feed.xml", "blog/index.html"]) {
    if (existsNonEmptyFile(root, relativePath)) {
      add(items, "ready", "outputs", relativePath, `${relativePath} exists and is non-empty.`);
    } else {
      add(items, "blocker", "outputs", relativePath, `${relativePath} is missing or empty.`);
    }
  }

  const blogRoot = path.join(root, "blog");
  const posts = fs.existsSync(blogRoot)
    ? fs
        .readdirSync(blogRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsNonEmptyFile(root, path.join("blog", entry.name, "index.html")))
        .map((entry) => `blog/${entry.name}/index.html`)
        .sort()
    : [];

  if (posts.length) {
    add(items, "ready", "outputs", "blog posts", `${posts.length} generated blog post(s) found.`, { posts });
  } else {
    add(items, "warn", "outputs", "blog posts", "No generated blog post output found under blog/*/index.html.");
  }

  const sitemap = readTextIfExists(root, "sitemap.xml");
  const feed = readTextIfExists(root, "feed.xml");
  if (posts.length && sitemap && sitemap.includes("/blog/")) {
    add(items, "ready", "outputs", "sitemap blog URLs", "sitemap.xml includes blog URLs.");
  } else if (posts.length) {
    add(items, "warn", "outputs", "sitemap blog URLs", "Generated blog posts exist, but sitemap.xml does not appear to include blog URLs.");
  }

  if (posts.length && feed && feed.includes("/blog/")) {
    add(items, "ready", "outputs", "feed blog URLs", "feed.xml includes blog URLs.");
  } else if (posts.length) {
    add(items, "warn", "outputs", "feed blog URLs", "Generated blog posts exist, but feed.xml does not appear to include blog URLs.");
  }
}

function hasEveryField(row, fields = []) {
  return fields.every((field) => isPresent(row[field]));
}

function hasAnyField(row, fields = []) {
  return fields.some((field) => isPresent(row[field]));
}

function hasAnyNumericField(row, fields = []) {
  return fields.some((field) => hasNumericValue(row, field));
}

function missingHeaders(headers, requiredHeaders = []) {
  const available = new Set(headers);
  return requiredHeaders.filter((header) => !available.has(header));
}

function isSignalBearingAnalyticsRow(row, spec) {
  const sourceOnlyIdentity = (spec.sourceOnlyIdentitySources || []).includes(String(row.source || "").trim());
  const hasIdentity = hasEveryField(row, spec.identityFields) && (sourceOnlyIdentity || hasAnyField(row, spec.oneOfIdentityFields));
  const hasSignal = hasAnyNumericField(row, spec.numericSignalFields) || hasAnyField(row, spec.textSignalFields);
  return hasIdentity && hasSignal;
}

function groupPageRows(rows) {
  const rowsByPage = new Map();
  for (const row of rows) {
    const key = pageEvidenceKey(row);
    if (!key) continue;
    if (!rowsByPage.has(key)) rowsByPage.set(key, []);
    rowsByPage.get(key).push(row);
  }
  return rowsByPage;
}

function checkAnalyticsDecisionEvidence(rows, items) {
  const evidenceByPage = Array.from(groupPageRows(rows).entries()).map(([key, pageRows]) => ({
    key,
    evidence: pageDecisionEvidence(pageRows),
  }));
  const readyPages = evidenceByPage.filter((entry) => entry.evidence.ok);

  if (readyPages.length) {
    add(
      items,
      "ready",
      "analytics-decisions",
      "page decision evidence",
      `${readyPages.length} page(s) have at least ${MIN_DECISION_EVIDENCE_ROWS} reviewed, provenance-bearing signal rows across distinct dates.`
    );
    return;
  }

  const example = evidenceByPage.find((entry) => entry.evidence.missing.length);
  const detail = example
    ? `No page has decision-grade evidence yet. Example gap for ${example.key}: ${example.evidence.missing.join("; ")}.`
    : "No page-level rows are available for decision evidence yet.";
  add(items, "warn", "analytics-decisions", "page decision evidence", detail);
}

function checkAnalyticsFiles(root, items) {
  for (const [relativePath, spec] of Object.entries(ANALYTICS_FILE_SPECS)) {
    const absolutePath = path.join(root, relativePath);
    if (!existsFile(root, relativePath)) {
      add(items, "warn", "analytics-schema", relativePath, `${relativePath} is missing. Create it from the template before importing signals.`);
      continue;
    }

    const { headers, rows } = readCsv(absolutePath);
    if (!headers.length) {
      add(items, "blocker", "analytics-schema", relativePath, `${relativePath} exists but has no header row.`);
      continue;
    }

    const missing = missingHeaders(headers, spec.requiredHeaders);
    if (missing.length) {
      add(items, "blocker", "analytics-schema", relativePath, `${relativePath} is missing required header(s): ${missing.join(", ")}.`);
    } else {
      add(items, "ready", "analytics-schema", relativePath, `${relativePath} schema/header is ready with ${headers.length} header(s) and ${rows.length} data row(s).`);
    }

    const signalRows = rows.filter((row) => isSignalBearingAnalyticsRow(row, spec));
    if (!rows.length) {
      add(items, "warn", "analytics-signal", relativePath, `${relativePath} is header-only; schema is ready but no signal-bearing data is present.`);
    } else if (!signalRows.length) {
      add(items, "warn", "analytics-signal", relativePath, `${relativePath} has ${rows.length} data row(s), but none have enough identity plus metric or observation fields to count as signal-bearing.`);
    } else {
      add(items, "ready", "analytics-signal", relativePath, `${signalRows.length} of ${rows.length} data row(s) contain signal-bearing data.`);
    }

    if (signalRows.length) {
      const provenanceRows = signalRows.filter((row) => hasAnyField(row, spec.provenanceFields));
      const reviewedRows = signalRows.filter((row) => hasAnyField(row, spec.reviewFields));

      if (provenanceRows.length === signalRows.length) {
        add(items, "ready", "analytics-provenance", relativePath, "Every signal-bearing row has source_export_id or source_file provenance.");
      } else {
        add(items, "warn", "analytics-provenance", relativePath, `${signalRows.length - provenanceRows.length} signal-bearing row(s) are missing source_export_id/source_file provenance.`);
      }

      if (reviewedRows.length === signalRows.length) {
        add(items, "ready", "analytics-review", relativePath, "Every signal-bearing row has reviewer attribution.");
      } else {
        add(items, "warn", "analytics-review", relativePath, `${signalRows.length - reviewedRows.length} signal-bearing row(s) are missing reviewer attribution.`);
      }
    }

    if (spec.decisionEvidence) checkAnalyticsDecisionEvidence(rows, items);
  }
}

function checkPipelineDirectories(root, items) {
  for (const dir of ["analytics", "imports", "research", "automation-runs"]) {
    if (existsDir(root, dir)) {
      add(items, "ready", "pipeline", dir, `${dir}/ exists.`);
    } else {
      add(items, "warn", "pipeline", dir, `${dir}/ is missing. It may be created by pipeline runs when needed.`);
    }
  }

  checkAnalyticsFiles(root, items);
}

function listPacketDirs(root) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot) || !fs.statSync(packetRoot).isDirectory()) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetRoot, entry.name))
    .sort();
}

function checkPackets(root, items, { validatePackets }) {
  const packetRoot = path.join(root, "content-packets");
  const packetDirs = listPacketDirs(root);
  if (fs.existsSync(packetRoot) && fs.statSync(packetRoot).isDirectory()) {
    add(items, "ready", "packets", "content-packets directory", "content-packets/ exists.");
  } else {
    add(items, "warn", "packets", "content-packets directory", "content-packets/ is missing. Packet scaffolding will need to create it.");
  }

  if (packetDirs.length) {
    add(items, "ready", "packets", "packet directories", `${packetDirs.length} packet director${packetDirs.length === 1 ? "y" : "ies"} found.`, {
      packets: packetDirs.map((packetDir) => relative(root, packetDir)),
    });
  } else {
    add(items, "warn", "packets", "packet directories", "No content packet directories found.");
    return [];
  }

  if (!validatePackets) {
    add(items, "warn", "packets", "strict packet validation", "Skipped by --skip-packet-validation.");
    return [];
  }

  if (!existsFile(root, "scripts/blog-orchestrator.mjs")) {
    add(items, "warn", "packets", "strict packet validation", "scripts/blog-orchestrator.mjs is missing, so strict packet validation was not practical.");
    return [];
  }

  const validations = [];
  for (const packetDir of packetDirs) {
    const packet = relative(root, packetDir);
    const result = spawnSync(process.execPath, ["scripts/blog-orchestrator.mjs", "validate", packet], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: process.env,
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    const validation = {
      packet,
      status: result.status === 0 ? "passed" : "failed",
      exit_code: result.status,
      output,
    };
    validations.push(validation);
    if (result.status === 0) {
      add(items, "ready", "packets", `strict validation: ${packet}`, output.split("\n")[0] || "Packet validation passed.");
    } else {
      const reason = output.split("\n").filter(Boolean).slice(0, 4).join(" ");
      add(items, "blocker", "packets", `strict validation: ${packet}`, reason || "Packet validation failed or timed out.");
    }
  }
  return validations;
}

function buildReport(root, options) {
  const items = [];
  const dotEnv = existsFile(root, ".env") ? parseDotEnv(readTextIfExists(root, ".env")) : {};
  const localConfigRead = readJson(root, "config/seo-aeo.config.json");
  const exampleConfigRead = readJson(root, "config/seo-aeo.config.example.json");
  const localConfig = localConfigRead.exists && !localConfigRead.error ? localConfigRead.value : null;
  const fallbackConfig = exampleConfigRead.exists && !exampleConfigRead.error ? exampleConfigRead.value : null;

  checkSampleFiles(root, dotEnv, localConfigRead, exampleConfigRead, items);
  checkGoogleSetup(root, dotEnv, localConfig, fallbackConfig, items);
  checkBingSetup(dotEnv, localConfig, fallbackConfig, items);
  checkRedditSetup(dotEnv, localConfig, fallbackConfig, items);
  checkOutputs(root, items);
  checkPipelineDirectories(root, items);
  const packetValidations = checkPackets(root, items, options);

  const counts = {
    ready: items.filter((entry) => entry.category === "ready").length,
    warn: items.filter((entry) => entry.category === "warn").length,
    blocker: items.filter((entry) => entry.category === "blocker").length,
  };

  return {
    ok: counts.blocker === 0,
    status: counts.blocker ? "blocked" : counts.warn ? "ready_with_warnings" : "ready",
    generated_at: new Date().toISOString(),
    root,
    counts,
    items,
    packet_validations: packetValidations,
  };
}

function printText(report) {
  console.log("SEO/AEO readiness audit");
  console.log(`Status: ${report.status}`);
  console.log(`Ready: ${report.counts.ready}  Warn: ${report.counts.warn}  Blockers: ${report.counts.blocker}`);
  for (const category of ["blocker", "warn", "ready"]) {
    const entries = report.items.filter((entry) => entry.category === category);
    if (!entries.length) continue;
    console.log(`\n${category.toUpperCase()}`);
    for (const entry of entries) {
      console.log(`- [${entry.area}] ${entry.check}: ${entry.detail}`);
    }
  }
}

if (hasFlag("--help") || hasFlag("-h")) {
  usage();
  process.exit(0);
}

const root = process.cwd();
const report = buildReport(root, {
  validatePackets: !hasFlag("--skip-packet-validation"),
});

if (hasFlag("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printText(report);
}

if (hasFlag("--fail-on-blocker") && report.counts.blocker > 0) {
  process.exit(1);
}
