#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SKILL_PATH = "/Users/jeff/.codex/skills/sellinpublic-seo-blog/SKILL.md";

function usage() {
  return `Usage: node scripts/seo-aeo/claude-blog-pass.mjs --packet <content-packet-dir> [--out <path>] [--model claude-sonnet-4-6]

Runs the final audience-copy pass for a Sell In Public blog packet through Claude.
Requires ANTHROPIC_API_KEY in the local environment. Never pass the key as an argument.`;
}

function readArgs(argv) {
  const args = {
    packet: "",
    out: "",
    model: process.env.ANTHROPIC_BLOG_MODEL || DEFAULT_MODEL,
    skillPath: process.env.SEO_WRITING_SKILL_PATH || DEFAULT_SKILL_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
    } else if (value === "--packet") {
      args.packet = argv[index + 1] || "";
      index += 1;
    } else if (value === "--out") {
      args.out = argv[index + 1] || "";
      index += 1;
    } else if (value === "--model") {
      args.model = argv[index + 1] || args.model;
      index += 1;
    } else if (value === "--skill-path") {
      args.skillPath = argv[index + 1] || args.skillPath;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  return args;
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function readOptional(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function buildPrompt(packetDir, skillText) {
  const files = {
    brief: readRequired(path.join(packetDir, "brief.yaml")),
    outline: readRequired(path.join(packetDir, "outline.md")),
    draft: readRequired(path.join(packetDir, "draft.md")),
    articleBlocks: readRequired(path.join(packetDir, "article.blocks.json")),
    citations: readRequired(path.join(packetDir, "citations.json")),
    claimsLedger: readRequired(path.join(packetDir, "claims-ledger.csv")),
    qaReport: readOptional(path.join(packetDir, "qa-report.md")),
    linkedinProfilePosts: readOptional(path.join(packetDir, "linkedin-profile-posts.json")),
    linkedinProfileTargets: readOptional(path.join(packetDir, "linkedin-profile-targets.json")),
  };

  return `You are doing the final audience-copy writing pass for a Sell In Public SEO/AEO blog post.

Use the provided Sell In Public SEO writing skill as binding style guidance. Preserve the factual source boundaries in citations and claims. Do not invent statistics, quotes, examples, URLs, customer results, or source support.

Required output:
1. A polished full draft in Markdown.
2. A matching article.blocks.json object that can replace the provided one.
3. A brief audit note listing material changes, source caveats, and any remaining blockers.

Hard rules:
- Use contractions naturally.
- Do not use em dashes.
- Write a literal article for the topic, not instructions for how to write that article.
- Keep brand mentions out of the informational body except author/publisher context and the final CTA.
- For examples posts, include concrete public examples and linked public posts when available.
- Keep source markers and claim IDs in the Markdown draft where claims are material.

SEO WRITING SKILL:
<<<SEO_SKILL
${skillText}
SEO_SKILL

BRIEF:
<<<BRIEF
${files.brief}
BRIEF

OUTLINE:
<<<OUTLINE
${files.outline}
OUTLINE

DRAFT:
<<<DRAFT
${files.draft}
DRAFT

ARTICLE BLOCKS:
<<<ARTICLE_BLOCKS
${files.articleBlocks}
ARTICLE_BLOCKS

CITATIONS:
<<<CITATIONS
${files.citations}
CITATIONS

CLAIMS LEDGER:
<<<CLAIMS_LEDGER
${files.claimsLedger}
CLAIMS_LEDGER

QA REPORT:
<<<QA_REPORT
${files.qaReport}
QA_REPORT

LINKEDIN PROFILE TARGETS:
<<<LINKEDIN_PROFILE_TARGETS
${files.linkedinProfileTargets}
LINKEDIN_PROFILE_TARGETS

LINKEDIN PROFILE POSTS CAPTURE:
<<<LINKEDIN_PROFILE_POSTS
${files.linkedinProfilePosts}
LINKEDIN_PROFILE_POSTS`;
}

function textFromMessage(message) {
  return (message.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.packet) throw new Error("--packet is required.");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Export it locally; do not commit or pass it as a CLI argument.");
  }

  const packetDir = path.resolve(args.packet);
  const skillText = readRequired(args.skillPath);
  const prompt = buildPrompt(packetDir, skillText);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 24000,
      output_config: { effort: "low" },
      system: "Respond directly with the requested replacement draft, article.blocks.json, and audit notes. Do not include preamble.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude writing pass failed (${response.status}): ${body}`);
  }

  const message = await response.json();
  const output = textFromMessage(message);
  const outPath = path.resolve(args.out || path.join(packetDir, "claude-writing-pass.md"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output);
  console.log(`Claude writing pass written to ${outPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
