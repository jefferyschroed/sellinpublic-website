#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const TREND_HEADERS = [
  "captured_at",
  "source",
  "source_id",
  "subreddit",
  "query",
  "post_id",
  "post_url",
  "title",
  "score",
  "comments",
  "created_utc",
  "normalized_topic",
  "intent",
  "evidence_use",
  "notes",
];

const NORMALIZED_DISCOVERY_HEADERS = [
  "query_id",
  "source_id",
  "source_type",
  "source_record_id",
  "query",
  "normalized_query",
  "canonical_query_key",
  "intent",
  "funnel_stage",
  "audience",
  "pillar_id",
  "topic_id",
  "surface",
  "country",
  "language",
  "observed_at",
  "page_url",
  "device",
  "volume",
  "difficulty",
  "impressions",
  "clicks",
  "ctr",
  "avg_position",
  "trend_delta",
  "trend_window",
  "confidence",
  "evidence_use",
  "allowed_public_use",
  "raw_path",
  "notes",
];

async function redditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT;
  if (!clientId || !clientSecret || !userAgent) {
    throw new Error("Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_USER_AGENT to pull Reddit discovery data.");
  }

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Reddit token request failed ${response.status}: ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

function classifyIntent(title) {
  const text = String(title).toLowerCase();
  if (/how|workflow|process|template|checklist/.test(text)) return "how_to";
  if (/vs|alternative|compare|better/.test(text)) return "comparison";
  if (/example|case study|breakdown/.test(text)) return "example";
  if (/metric|roi|measure|analytics/.test(text)) return "measurement";
  if (/what is|definition|mean/.test(text)) return "definition";
  return "discussion";
}

function normalizeTopic(title) {
  const text = String(title).toLowerCase();
  if (/employee advocacy|employee generated|employee-generated/.test(text)) return "employee-generated content";
  if (/linkedin/.test(text)) return "linkedin-led gtm";
  if (/thought leadership/.test(text)) return "b2b thought leadership";
  if (/founder/.test(text)) return "founder content";
  if (/social selling/.test(text)) return "social selling";
  return "market discussion";
}

function normalizeQuery(title) {
  return String(title).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();
}

function pillarForTopic(topic) {
  if (topic === "linkedin-led gtm" || topic === "social selling" || topic === "founder content") return "pillar-linkedin-led-gtm";
  if (topic === "b2b thought leadership") return "pillar-measurement-learning";
  return "pillar-employee-generated-content";
}

async function fetchListing({ token, subreddit, query, userAgent, limit }) {
  const endpoint = query
    ? `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/search?restrict_sr=1&sort=hot&t=day&limit=${limit}&q=${encodeURIComponent(query)}`
    : `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/top?t=day&limit=${limit}`;
  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": userAgent,
    },
  });
  if (!response.ok) {
    return { error: `Reddit fetch failed ${response.status}: ${await response.text()}`, rows: [] };
  }
  const data = await response.json();
  return { rows: data.data?.children?.map((child) => child.data) || [] };
}

async function run() {
  const root = process.cwd();
  const config = loadConfig(root);
  const runDate = process.argv.includes("--date") ? process.argv[process.argv.indexOf("--date") + 1] : today();
  const enabledByEnv = process.env.SEO_AEO_REDDIT_ENABLED === "true";
  const enabledByConfig = config.reddit?.enabled === true;
  const explicitPolicyOverride = process.env.SEO_AEO_ALLOW_REDDIT_API === "true";
  if ((!enabledByEnv && !enabledByConfig) || !explicitPolicyOverride) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          source: "reddit",
          runDate,
          manual_capture_path: "imports/reddit-manual-captures/*.csv",
          reason: explicitPolicyOverride
            ? "Reddit API discovery is disabled. Set SEO_AEO_REDDIT_ENABLED=true or reddit.enabled=true after approval."
            : "Reddit API discovery is policy-disabled for now. Use the sanitized manual Reddit capture lane unless the owner explicitly reopens Reddit API use.",
        },
        null,
        2
      )
    );
    return;
  }
  const runId = `${runDate}-daily-discovery`;
  const outputDir = ensureDir(path.join(root, "research", "trend-intelligence", runId));
  const rawDir = ensureDir(path.join(outputDir, "raw"));
  const token = await redditToken();
  const userAgent = process.env.REDDIT_USER_AGENT || config.reddit?.userAgent;
  const subreddits = config.reddit?.subreddits || [];
  const queries = config.reddit?.queries || [];
  const limit = Number(config.trendDiscovery?.dailyTopicLimit || 25);
  const minScore = Number(config.trendDiscovery?.minRedditScore || 0);
  const capturedAt = new Date().toISOString();
  const rows = [];
  const errors = [];

  for (const subreddit of subreddits) {
    const top = await fetchListing({ token, subreddit, query: "", userAgent, limit });
    errors.push(...(top.error ? [{ subreddit, query: "", error: top.error }] : []));
    for (const post of top.rows) {
      if (Number(post.score || 0) < minScore) continue;
      rows.push({
        captured_at: capturedAt,
        source: "reddit",
        source_id: `reddit:${subreddit}:top:${runDate}`,
        subreddit,
        query: "",
        post_id: post.id,
        post_url: `https://www.reddit.com${post.permalink}`,
        title: post.title,
        score: post.score,
        comments: post.num_comments,
        created_utc: post.created_utc,
        normalized_topic: normalizeTopic(post.title),
        intent: classifyIntent(post.title),
        evidence_use: "discovery_only",
        notes: "Reddit is used for topic discovery only, never factual evidence.",
      });
    }

    for (const query of queries) {
      const listing = await fetchListing({ token, subreddit, query, userAgent, limit: Math.min(10, limit) });
      errors.push(...(listing.error ? [{ subreddit, query, error: listing.error }] : []));
      for (const post of listing.rows) {
        if (Number(post.score || 0) < minScore) continue;
        rows.push({
          captured_at: capturedAt,
          source: "reddit",
          source_id: `reddit:${subreddit}:search:${runDate}`,
          subreddit,
          query,
          post_id: post.id,
          post_url: `https://www.reddit.com${post.permalink}`,
          title: post.title,
          score: post.score,
          comments: post.num_comments,
          created_utc: post.created_utc,
          normalized_topic: normalizeTopic(post.title),
          intent: classifyIntent(post.title),
          evidence_use: "discovery_only",
          notes: "Reddit is used for topic discovery only, never factual evidence.",
        });
      }
    }
  }

  const deduped = Array.from(new Map(rows.map((row) => [row.post_id, row])).values()).sort(
    (a, b) => Number(b.score) + Number(b.comments) - (Number(a.score) + Number(a.comments))
  );
  const rawPath = path.join("research", "trend-intelligence", runId, "raw", `reddit-${runDate}.csv`);
  writeCsvAtomic(path.join(root, rawPath), TREND_HEADERS, deduped);
  writeCsvAtomic(path.join(outputDir, "reddit-trends.csv"), TREND_HEADERS, deduped);
  writeCsvAtomic(
    path.join(outputDir, "normalized-discovery-queries.csv"),
    NORMALIZED_DISCOVERY_HEADERS,
    deduped.map((row, index) => ({
      query_id: `reddit-${String(index + 1).padStart(4, "0")}`,
      source_id: row.source_id,
      source_type: "reddit_api_export",
      source_record_id: row.post_id,
      query: row.title,
      normalized_query: normalizeQuery(row.title),
      canonical_query_key: `${row.normalized_topic}:${row.intent}`,
      intent: row.intent,
      funnel_stage: "unknown",
      audience: "b2b_gtm_operator",
      pillar_id: pillarForTopic(row.normalized_topic),
      topic_id: "",
      surface: `reddit:${row.subreddit}`,
      country: "US",
      language: "en",
      observed_at: runDate,
      page_url: row.post_url,
      device: "",
      volume: "",
      difficulty: "",
      impressions: "",
      clicks: "",
      ctr: "",
      avg_position: "",
      trend_delta: "",
      trend_window: "day",
      confidence: row.query ? "medium" : "low",
      evidence_use: "discovery_only",
      allowed_public_use: "none",
      raw_path: rawPath,
      notes: "Reddit title normalized into discovery language. Do not cite as evidence.",
    }))
  );
  writeJsonAtomic(path.join(outputDir, "source-manifest.json"), {
    schema_version: "1.0",
    run_id: runId,
    run_date: runDate,
    captured_at: capturedAt,
    sources: [
      {
        source_id: `reddit-api-${runDate}`,
        source_type: "reddit_api_export",
        name: "Reddit discovery API export",
        captured_by: "scripts/seo-aeo/pull-reddit-trends.mjs",
        captured_at: capturedAt,
        surface: "reddit",
        country: "US",
        language: "en",
        path: rawPath,
        evidence_use: "discovery_only",
        allowed_public_use: "none",
        collection_method: "approved_reddit_oauth_api",
        license_or_terms_note: "Requires Reddit API approval and compliant use.",
        sanitization_status: "titles_only_no_usernames",
        notes: "Subreddits and queries are configured in config/seo-aeo.config.json.",
        subreddits,
        queries,
      },
    ],
    errors,
  });
  const topicCandidateRows = Object.values(
    deduped.reduce((acc, row) => {
      const key = `${row.normalized_topic}|${row.intent}`;
      acc[key] ||= {
        captured_at: capturedAt,
        topic: row.normalized_topic,
        intent: row.intent,
        source_count: 0,
        max_score: 0,
        evidence_use: "discovery_only",
        recommended_next_action: "cluster_with_query_intelligence_before_opening_packet",
      };
      acc[key].source_count += 1;
      acc[key].max_score = Math.max(acc[key].max_score, Number(row.score || 0));
      return acc;
    }, {})
  );
  writeCsvAtomic(
    path.join(outputDir, "topic-candidates.csv"),
    ["captured_at", "topic", "intent", "source_count", "max_score", "evidence_use", "recommended_next_action"],
    topicCandidateRows
  );
  fs.writeFileSync(
    path.join(outputDir, "daily-discovery-rollup.md"),
    `# Daily Discovery Rollup\n\nRun date: ${runDate}\n\n## Summary\n\n- Reddit rows captured: ${deduped.length}\n- Topic candidates: ${topicCandidateRows.length}\n- Evidence use: discovery_only\n\n## Missing Lanes\n\n- AnswerThePublic-style exports: not imported by this script.\n- Google Trends exports: not imported by this script.\n- Manual AI prompt exports: not imported by this script.\n\n## Rule\n\nReddit output can shape topic discovery, source gaps, H2s, FAQs, and questions. It must not be cited as factual evidence.\n`
  );
  fs.writeFileSync(
    path.join(outputDir, "brief-handoff-candidates.yaml"),
    `schema_version: "1.0"\nrun_id: "${runId}"\ncreated_at: "${runDate}"\nhandoff_status: "draft"\nrule: "Discovery candidates require source and SME review before packet creation."\n\ncandidates:\n${topicCandidateRows
      .map(
        (row, index) => `  - candidate_id: "reddit-candidate-${String(index + 1).padStart(3, "0")}"\n    cluster_id: "${row.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${row.intent}"\n    recommended_title: ""\n    slug_candidate: ""\n    primary_query: "${row.topic}"\n    secondary_queries: []\n    aeo_question: ""\n    pillar_id: "${pillarForTopic(row.topic)}"\n    topic_id: ""\n    recommended_asset: "monitor_or_section"\n    decision: "monitor"\n    cluster_confidence: "low"\n    discovery_sources:\n      - "reddit-api-${runDate}"\n    excluded_sources_for_evidence:\n      - "reddit-api-${runDate}"\n    source_gaps: []\n    sme_questions: []\n    internal_links: []\n    reason_to_create_or_refresh: ""\n    reason_to_wait: "Needs validation beyond Reddit discovery inputs."\n`
      )
      .join("") || "  []\n"}`
  );

  console.log(JSON.stringify({ ok: true, source: "reddit", runDate, outputDir, rows: deduped.length, errors }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
