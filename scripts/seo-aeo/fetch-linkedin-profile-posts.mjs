#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ACTOR_ID = "harvestapi~linkedin-profile-posts";

function usage() {
  return `Usage: node scripts/seo-aeo/fetch-linkedin-profile-posts.mjs --input profiles.json --out posts.json [--max-posts 3]

Input JSON:
{
  "profiles": [
    { "company": "Clay", "name": "Jane Doe", "title": "VP Sales", "url": "https://www.linkedin.com/in/..." }
  ]
}

Requires APIFY_TOKEN in the local environment. Do not pass tokens as arguments.`;
}

function readArgs(argv) {
  const args = { input: "", out: "", maxPosts: 3, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
    } else if (value === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
    } else if (value === "--out") {
      args.out = argv[index + 1] || "";
      index += 1;
    } else if (value === "--max-posts") {
      args.maxPosts = Number(argv[index + 1] || args.maxPosts);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function normalizeProfiles(input) {
  const profiles = Array.isArray(input) ? input : input.profiles;
  if (!Array.isArray(profiles) || !profiles.length) {
    throw new Error("Input must contain a non-empty profiles array.");
  }
  return profiles.map((profile) => {
    if (!profile.url) throw new Error(`Profile is missing url: ${JSON.stringify(profile)}`);
    return {
      company: profile.company || "",
      name: profile.name || "",
      title: profile.title || "",
      url: profile.url,
    };
  });
}

function simplifyPost(item, profileByUrl) {
  const url = item.linkedinUrl || item.url || item.socialContent?.shareUrl || "";
  const authorUrl = item.author?.linkedinUrl || "";
  const profile = profileByUrl.get(authorUrl) || {};
  return {
    company: profile.company || "",
    profile_name: profile.name || item.author?.name || "",
    profile_title: profile.title || item.author?.info || "",
    profile_url: profile.url || authorUrl,
    post_url: url,
    posted_at: item.postedAt?.date || "",
    content: item.content || "",
    engagement: item.engagement || {},
  };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) throw new Error("--input is required.");
  if (!args.out) throw new Error("--out is required.");
  if (!process.env.APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN is not set. Export it locally; do not commit or pass it as a CLI argument.");
  }

  const profiles = normalizeProfiles(JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8")));
  const profileByUrl = new Map(profiles.map((profile) => [profile.url, profile]));
  const response = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.APIFY_TOKEN}`,
    },
    body: JSON.stringify({
      targetUrls: profiles.map((profile) => profile.url),
      maxPosts: args.maxPosts,
      scrapeReactions: false,
      scrapeComments: false,
      includeQuotePosts: true,
      includeReposts: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify LinkedIn actor failed (${response.status}): ${body}`);
  }

  const items = await response.json();
  const simplified = items.map((item) => simplifyPost(item, profileByUrl)).filter((item) => item.post_url || item.content);
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify({ fetched_at: new Date().toISOString(), actor_id: ACTOR_ID, posts: simplified }, null, 2)}\n`);
  console.log(`LinkedIn posts written to ${outPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
