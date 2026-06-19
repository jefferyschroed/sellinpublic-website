#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SKILL_PATH = "/Users/jeff/.codex/skills/sellinpublic-seo-blog/SKILL.md";

function usage() {
  return `Usage: node scripts/seo-aeo/claude-blog-pass.mjs --packet <content-packet-dir> [--out <path>] [--model claude-sonnet-4-6] [--apply] [--from-scratch]

Runs the final audience-copy pass for a Sell In Public blog packet through Claude.
Requires ANTHROPIC_API_KEY in the local environment. Never pass the key as an argument.

Use --apply for publish work. It writes Claude's replacement draft.md and
article.blocks.json directly, then records an applied writing-pass audit.

Use --from-scratch when the current public copy is contaminated. It preserves
metadata and source files but omits the current draft/body from the prompt.`;
}

function readArgs(argv) {
  const args = {
    packet: "",
    out: "",
    model: process.env.ANTHROPIC_BLOG_MODEL || DEFAULT_MODEL,
    skillPath: process.env.SEO_WRITING_SKILL_PATH || DEFAULT_SKILL_PATH,
    apply: false,
    fromScratch: false,
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
    } else if (value === "--apply") {
      args.apply = true;
    } else if (value === "--from-scratch") {
      args.fromScratch = true;
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

function parseJson(filePath) {
  return JSON.parse(readRequired(filePath));
}

function publicStructureSummary(packetDir) {
  const currentBlocks = parseJson(path.join(packetDir, "article.blocks.json"));
  const { blocks: _blocks, ...metadata } = currentBlocks;
  return JSON.stringify(metadata, null, 2);
}

function existingCopyInputs(packetDir, fromScratch) {
  if (fromScratch) {
    return `CURRENT PUBLIC COPY:
<<<CURRENT_PUBLIC_COPY
Omitted intentionally. Rewrite the post from scratch. Do not reuse the current
draft, headings, callouts, tables, FAQs, CTA body, source list wording, or article
block sequence. Preserve only the structural metadata and source boundaries.
CURRENT_PUBLIC_COPY`;
  }

  return `DRAFT:
<<<DRAFT
${readRequired(path.join(packetDir, "draft.md"))}
DRAFT

ARTICLE BLOCKS:
<<<ARTICLE_BLOCKS
${readRequired(path.join(packetDir, "article.blocks.json"))}
ARTICLE_BLOCKS`;
}

function buildPrompt(packetDir, skillText, { apply = false, fromScratch = false } = {}) {
  const files = {
    brief: readRequired(path.join(packetDir, "brief.yaml")),
    outline: readRequired(path.join(packetDir, "outline.md")),
    publicStructure: publicStructureSummary(packetDir),
    existingCopy: existingCopyInputs(packetDir, fromScratch),
    citations: readRequired(path.join(packetDir, "citations.json")),
    claimsLedger: readRequired(path.join(packetDir, "claims-ledger.csv")),
    qaReport: readOptional(path.join(packetDir, "qa-report.md")),
    linkedinProfilePosts: readOptional(path.join(packetDir, "linkedin-profile-posts.json")),
    linkedinProfileTargets: readOptional(path.join(packetDir, "linkedin-profile-targets.json")),
  };

  const outputContract = apply
    ? `Return only valid JSON with this exact shape:
{
  "draft_md": "complete replacement Markdown for draft.md",
  "article_blocks": {
    "version": 1,
    "slug": "...",
    "title": "...",
    "kicker": "...",
    "dek": "...",
    "publishDateLabel": "...",
    "updatedDateLabel": "...",
    "readTime": "...",
    "topic_map": {},
    "hero": { "src": "...", "alt": "...", "width": 0, "height": 0, "caption": "..." },
    "blocks": []
  },
  "audit_notes_md": "brief Markdown audit notes"
}

Do not wrap the JSON in markdown fences. Do not include any prose outside the JSON.`
    : `Return the replacement draft, replacement article.blocks.json, and audit notes as plain Markdown sections. This mode is for review only and is not sufficient for publish.`;

  return `You are doing the final audience-copy writing pass for a Sell In Public SEO/AEO blog post.

Use the provided Sell In Public SEO writing skill as binding style guidance. Preserve the factual source boundaries in citations and claims. Do not invent statistics, quotes, examples, URLs, customer results, or source support.

Required output:
${outputContract}

Required article.blocks.json block schema:
- article_blocks must preserve every top-level metadata field from PUBLIC STRUCTURAL METADATA TO PRESERVE, including kicker, dek, date labels, readTime, topic_map, and hero.
- Use only these block types: answer, paragraph, heading, callout, table, list, media, copy_block, faq, sources, cta.
- answer: {"type":"answer","id":"short-answer","label":"Short answer","paragraphs":["..."]}
- paragraph: {"type":"paragraph","html":"..."} Use html, not text. Inline links are allowed as <a href="...">label</a>.
- heading: {"type":"heading","level":2,"id":"kebab-case-id","text":"..."} Use heading, not h2.
- callout: {"type":"callout","label":"...","paragraphs":["..."]} Avoid callouts in examples posts unless they add source-specific analysis.
- table: {"type":"table","headers":["..."],"rows":[["..."]]}
- faq: {"type":"faq","id":"faq","items":[{"question":"...","answer":"..."}]} Every question and answer must contain non-empty reader-facing text after trimming whitespace. Do not include placeholder, blank, duplicate, or whitespace-only FAQ items.
- sources: {"type":"sources","id":"sources","items":[{"label":"...","url":"..."}]}
- cta: {"type":"cta","label":"...","heading":"...","body":"...","actions":[{"label":"...","url":"...","style":"primary"}]}
- Do not use paragraph.text, h2, cta.text, markdown-only blocks, or raw source IDs as public copy.

Hard rules:
- Use contractions naturally.
- Do not use em dashes. The character U+2014 is forbidden in the Markdown draft, article block text, FAQ answers, and CTA copy. Use a period, comma, colon, or parentheses instead.
- Write a literal article for the topic, not instructions for how to write that article.
- Keep brand mentions out of the informational body except author/publisher context and the final CTA.
- The article.blocks.json object is the publish source. It must contain the same final public article as the Markdown draft, not notes, instructions, or a partial outline.
- For examples posts, the examples must be the article. Include concrete public examples and linked public posts when available.
- For examples posts, do not include meta-instruction sections such as "Use Examples Without Copying Them," "How to Use Examples," "How to Judge the Examples," "Copyable Example Checklist," or repeated "What to borrow:" paragraphs unless the user explicitly asks for a separate checklist article.
- For examples posts, avoid "borrow" framing in table headers or section labels. Prefer "Why it counts," "What it shows," or "Pattern it reveals."
  - For examples posts, do not publish generic quality criteria, source-policy criteria, or editorial testing language as article copy. Banned examples include "Quality test," "quality bar," "selection criteria," "What Makes An Example Count," "what makes [anything] example worth studying," "that's the bar worth holding," "helpful content guidance," "people-first content," "if the public asset could have been written by any competitor," and "How do you find examples inside your own company?"
  - For examples posts, write the synthesis as source analysis: what the public artifact is, who created it, what it shows, why it counts, and what pattern it reveals.
  - For examples posts, FAQs must answer definitional, channel, format, revenue-proof, or example-specific questions. Do not use FAQ questions that ask what makes an example count, good, valid, worth studying, or high quality.
  - Keep source markers and claim IDs in the Markdown draft where claims are material. Use explicit markers like [claim:C001] and [cite:src-008]. Do not use shorthand like [C001, src-008].
  - Do not put claim IDs, citation IDs, or markdown marker syntax in article.blocks.json. The public article blocks should contain clean reader-facing copy and links.

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

PUBLIC STRUCTURAL METADATA TO PRESERVE:
<<<PUBLIC_STRUCTURE
${files.publicStructure}
PUBLIC_STRUCTURE

${files.existingCopy}

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

function extractJsonPayload(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));

  throw new Error("Claude output did not include a JSON payload to apply.");
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function trimmedText(value) {
  return String(value ?? "").trim();
}

function isExamplesPacket(packetDir) {
  const brief = readRequired(path.join(packetDir, "brief.yaml"));
  const outline = readRequired(path.join(packetDir, "outline.md"));
  return /\bexamples?\b/i.test(`${brief}\n${outline}`);
}

function validateArticleBlockShape(articleBlocks) {
  const errors = [];

  if (!Array.isArray(articleBlocks.blocks) || !articleBlocks.blocks.length) {
    errors.push("article_blocks.blocks must be a non-empty array.");
    return errors;
  }

  if (!articleBlocks.blocks.some((block) => block.type === "answer")) {
    errors.push("article_blocks.blocks must include an answer block near the top.");
  }

  const requireArray = (condition, message) => {
    if (!condition) errors.push(message);
  };

  articleBlocks.blocks.forEach((block, index) => {
    const prefix = `article_blocks block ${index + 1}`;
    switch (block.type) {
      case "answer":
        if (!block.id || !block.label || !Array.isArray(block.paragraphs) || !block.paragraphs.length) {
          errors.push(`${prefix} answer requires id, label, and paragraphs.`);
        }
        break;
      case "paragraph":
        if (!block.html) errors.push(`${prefix} paragraph requires html.`);
        if ("text" in block) errors.push(`${prefix} paragraph must use html, not text.`);
        break;
      case "heading":
        if (![2, 3].includes(block.level) || !block.id || !block.text) {
          errors.push(`${prefix} heading requires level 2 or 3, id, and text.`);
        }
        break;
      case "callout":
        if (!block.label || !Array.isArray(block.paragraphs) || !block.paragraphs.length) {
          errors.push(`${prefix} callout requires label and paragraphs.`);
        }
        break;
      case "table":
        requireArray(Array.isArray(block.headers) && block.headers.length, `${prefix} table requires headers.`);
        requireArray(Array.isArray(block.rows) && block.rows.length, `${prefix} table requires rows.`);
        if (Array.isArray(block.rows) && Array.isArray(block.headers)) {
          block.rows.forEach((row, rowIndex) => {
            if (!Array.isArray(row) || row.length !== block.headers.length) {
              errors.push(`${prefix} table row ${rowIndex + 1} must match header count.`);
            }
          });
        }
        break;
      case "list":
        requireArray(Array.isArray(block.items) && block.items.length, `${prefix} list requires items.`);
        break;
      case "media":
        if (!block.src || !block.alt || !block.width || !block.height || !block.caption) {
          errors.push(`${prefix} media requires src, alt, width, height, and caption.`);
        }
        break;
      case "copy_block":
        if (!block.title || !block.code) errors.push(`${prefix} copy_block requires title and code.`);
        break;
      case "faq":
        requireArray(Array.isArray(block.items) && block.items.length, `${prefix} faq requires items.`);
        {
          const seenQuestions = new Set();
          block.items?.forEach((item, itemIndex) => {
            const question = trimmedText(item?.question);
            if (!question || !trimmedText(item?.answer)) {
              errors.push(`${prefix} faq item ${itemIndex + 1} requires non-empty question and answer text.`);
            }
            const key = question.toLowerCase();
            if (key && seenQuestions.has(key)) {
              errors.push(`${prefix} faq item ${itemIndex + 1} duplicates an earlier question.`);
            }
            if (key) seenQuestions.add(key);
          });
        }
        break;
      case "sources":
        requireArray(Array.isArray(block.items) && block.items.length, `${prefix} sources requires items.`);
        block.items?.forEach((item, itemIndex) => {
          if (!item.label || !item.url) errors.push(`${prefix} source item ${itemIndex + 1} requires label and url.`);
        });
        break;
      case "cta":
        if (!block.label || !block.heading || !block.body || !Array.isArray(block.actions) || !block.actions.length) {
          errors.push(`${prefix} cta requires label, heading, body, and actions.`);
        }
        block.actions?.forEach((action, actionIndex) => {
          if (!action.label || !action.url || !["primary", "secondary"].includes(action.style)) {
            errors.push(`${prefix} cta action ${actionIndex + 1} requires label, url, and primary/secondary style.`);
          }
        });
        break;
      default:
        errors.push(`${prefix} has unsupported type: ${block.type}`);
    }
  });

  return errors;
}

function validateAppliedPayload(payload, packetDir) {
  const errors = [];
  const currentBlocks = JSON.parse(readRequired(path.join(packetDir, "article.blocks.json")));

  if (!payload || typeof payload !== "object") {
    errors.push("Claude payload must be an object.");
  }
  if (!payload.draft_md || typeof payload.draft_md !== "string") {
    errors.push("Claude payload must include draft_md as a string.");
  }
  if (!payload.article_blocks || typeof payload.article_blocks !== "object") {
    errors.push("Claude payload must include article_blocks as an object.");
  }
  if (!payload.audit_notes_md || typeof payload.audit_notes_md !== "string") {
    errors.push("Claude payload must include audit_notes_md as a string.");
  }

  const articleBlocks = payload.article_blocks || {};
  if (articleBlocks.version !== 1) errors.push("article_blocks.version must be 1.");
  if (articleBlocks.slug !== currentBlocks.slug) errors.push(`article_blocks.slug must stay ${currentBlocks.slug}.`);
  if (!Array.isArray(articleBlocks.blocks) || !articleBlocks.blocks.length) {
    errors.push("article_blocks.blocks must be a non-empty array.");
  }
  if (!articleBlocks.hero?.src || !articleBlocks.hero?.alt || !articleBlocks.hero?.width || !articleBlocks.hero?.height) {
    errors.push("article_blocks.hero must preserve src, alt, width, and height.");
  }
  errors.push(...validateArticleBlockShape(articleBlocks));

  const publicText = collectStrings([payload.draft_md || "", articleBlocks.blocks || []]).join("\n");
  if (publicText.includes("—")) errors.push("Claude output contains em dashes.");
  if (/\[[A-Z]\d{3,}\s*,\s*src-\d{3,}\]/i.test(payload.draft_md || "")) {
    errors.push("draft_md must use [claim:C###] and [cite:src-###] markers, not shorthand [C###, src-###] markers.");
  }

  if (isExamplesPacket(packetDir)) {
    const bannedExamplesPatterns = [
      /\bwhat to borrow\s*:/i,
      /\buse examples without copying\b/i,
      /\bhow to use examples\b/i,
      /\bhow to judge (the )?examples\b/i,
      /\bcopyable example checklist\b/i,
      /\bwhat b2b teams can borrow\b/i,
      /\bquality test\b/i,
      /\bquality bar\b/i,
      /\bselection criteria\b/i,
      /\bwhat makes an example count\b/i,
      /\bwhat makes .{0,80}example worth studying\b/i,
      /\bthat'?s the bar worth holding\b/i,
      /\bhelpful content guidance\b/i,
      /\bpeople-first content\b/i,
      /\bcould have been written by any competitor\b/i,
      /\bhow do you find examples inside your own company\b/i,
      /\binstructions for (how to )?(write|make|create).{0,80}examples article\b/i,
    ];
    for (const pattern of bannedExamplesPatterns) {
      if (pattern.test(publicText)) {
        errors.push(`Examples article still contains meta-instruction pattern: ${pattern}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Claude output is not safe to apply:\n- ${errors.join("\n- ")}`);
  }
}

function writeAppliedOutput(payload, packetDir, outPath, model, { fromScratch = false } = {}) {
  fs.writeFileSync(path.join(packetDir, "draft.md"), `${payload.draft_md.trim()}\n`);
  fs.writeFileSync(path.join(packetDir, "article.blocks.json"), `${JSON.stringify(payload.article_blocks, null, 2)}\n`);

  const audit = `# Claude Writing Pass

Status: applied
Model: ${model}
Applied to draft.md: true
Applied to article.blocks.json: true
From scratch: ${fromScratch ? "true" : "false"}
Generated at: ${new Date().toISOString()}

The static blog renderer publishes article.blocks.json. This pass wrote the
Claude-reviewed public article directly to both packet source files.

## Audit Notes

${payload.audit_notes_md.trim()}
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, audit);
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
  const prompt = buildPrompt(packetDir, skillText, { apply: args.apply, fromScratch: args.fromScratch });

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
      system: args.apply
        ? "Respond only with the valid JSON object requested by the user. Do not include preamble or markdown fences."
        : "Respond directly with the requested replacement draft, article.blocks.json, and audit notes. Do not include preamble.",
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

  if (args.apply) {
    const payload = extractJsonPayload(output);
    validateAppliedPayload(payload, packetDir);
    writeAppliedOutput(payload, packetDir, outPath, args.model, { fromScratch: args.fromScratch });
    console.log(`Claude writing pass applied to ${packetDir}`);
    console.log(`Claude writing pass audit written to ${outPath}`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
    console.log(`Claude writing pass written to ${outPath}`);
    console.log("Review-only mode: rerun with --apply before publish so draft.md and article.blocks.json are updated.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
