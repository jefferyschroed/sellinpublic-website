#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadPacket, normalizePath, writeJson, writeTextAtomic } from "../blog/packet.mjs";
import { renderPost } from "../blog/render-post.mjs";
import {
  articleHtmlFromRenderedPost,
  findPacketForSlug,
  PUBLIC_READER_REPORT_FILE,
  renderedHashes,
  renderedPostPathForSlug,
  reportPathForPacket,
  slugFromPostPath,
  validatePublicReaderReport,
} from "./lib/public-reader-gate.mjs";
import { loadLocalEnv } from "./lib/load-local-env.mjs";
import { extractPublicTextBlocks, scanAntiAiismsInBlocks } from "./lib/anti-aiism-scan.mjs";

loadLocalEnv();

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_CONTEXT_CHARS = 45000;
const REGRESSION_REGISTRY = "docs/seo-aeo/public-reader-regressions.json";

function usage(exitCode = 2) {
  console.log(`Usage:
  node scripts/seo-aeo/public-reader-qa.mjs --packet content-packets/<packet>/ [--apply]
  node scripts/seo-aeo/public-reader-qa.mjs --slug <slug> [--apply]
  node scripts/seo-aeo/public-reader-qa.mjs --post blog/<slug>/index.html --offline-scan --out /tmp/report.json

The model gate reads only the rendered public article text. It does not send packet, draft, outline, QA, claim, or citation artifacts to the model.

Options:
  --packet <path>        Content packet directory. Default report path is public-reader-report.json inside this packet.
  --slug <slug>          Blog slug. The script will try to find the matching packet.
  --post <path>          Rendered blog HTML path. Defaults to blog/<slug>/index.html.
  --out <path>           Override report output path.
  --apply                Apply exact model rewrites to draft.md/article.blocks.json, rerender, and recheck.
  --offline-scan         Run deterministic local scans only. This is useful for debugging but is not publish-eligible.
  --max-loops <n>        Maximum model/rewrite loops when --apply is set. Default: 2.
  --no-regression-record Do not append failed findings to docs/seo-aeo/public-reader-regressions.json.`);
  process.exit(exitCode);
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function numberArg(name, fallback) {
  const value = Number(arg(name, ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function rejectUnknownFlags(argv) {
  const flagsWithValues = new Set(["--packet", "--slug", "--post", "--out", "--max-loops", "--model"]);
  const bareFlags = new Set(["--apply", "--offline-scan", "--no-regression-record", "--help", "-h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && value !== "-h") continue;
    if (bareFlags.has(value)) continue;
    if (flagsWithValues.has(value)) {
      index += 1;
      continue;
    }
    console.error(`Unknown or malformed option: ${value}`);
    usage(2);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deterministicFindings(root, blocks, { examplesPost = false } = {}) {
  return scanAntiAiismsInBlocks(blocks, {
    root,
    examplesPost,
    source: "deterministic_scan",
  });
}

function buildPrompt({ slug, blocks, deterministicHits = [] }) {
  const publicText = blocks
    .map((block) => `${block.locator} [${block.tag}]\n${block.text}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
  const deterministicContext = deterministicHits.length
    ? `\nA local scanner already flagged these rendered public quotes. Judge them like a public reader and provide a clean replacement when the quote should not ship:\n\n${deterministicHits
        .map(
          (finding) =>
            `- ${finding.locator || "unknown"}: "${finding.quote}" (${finding.category || "blocked_pattern"})`
        )
        .join("\n")}\n`
    : "";

  return `You are the final public-reader QA agent for Sell In Public blog posts.

You have a clean context. You are only seeing the rendered public article text from blog slug "${slug}". You have not seen the packet, outline, draft, QA notes, claim ledger, citations registry, source policy, or writer instructions.

Read this like a busy B2B revenue leader would read the published article.

Fail the article if any public text sounds:
- AI-ish, generic, padded, or like SEO filler.
- Like an instruction to the writer instead of the article itself.
- Like QA rubric language, source-policy language, or editorial-process language.
- Like an internal note about claims, citations, examples, validation, or quality gates.
- Like an examples article that talks about how to judge examples instead of analyzing the public examples themselves.
- Like binary correction cadence when it sounds padded, formulaic, or generic: "not only X, but Y" or "it's not just X, it's Y."

Explicit anti-AIism rules for any replacement copy you write:
- Do not use em dashes. The character U+2014 is forbidden. Rewrite with a comma, period, colon, semicolon, or parentheses.
- Do not use banned words: "unlock", "leverage" as a verb, "supercharge", "game-changer", "revolutionize", "seamless", "robust", "cutting-edge", "transformative", "elevate", "empower", "delve", "holistic", "synergy", "frictionless", "impactful", "actionable", "utilize", "facilitate", or "demonstrate".
- Do not use filler phrases: "in today's fast-paced world", "in today's competitive landscape", "now more than ever", "it's no secret that", "we all know that", "the truth is", "let's be honest", "here's the thing", "the reality is", "In this article", "By the end of this post", "At the end of the day", "drive results", "move the needle", "add value", or "stand out from the noise".
- Do not use binary correction pairs as emphasis. Banned examples: "The best system isn't complicated. It's repeatable.", "LinkedIn is a signal surface. It's not a controlled content foundation.", "This isn't just about visibility. It's about pipeline.", "The goal isn't more content. It's better demand.", "It's not just posting more. It's posting with a reason.", and "Not only does this build trust, but it also creates demand."
- Rewrite binary contrasts into one concrete sentence, or support the distinction with a source, workflow, example, or operating implication. Do not replace one banned pair with another.
- Do not pass forward public-facing rubric or process language such as "quality test", "quality bar", "selection criteria", "helpful content guidance", "people-first content", "claim ledger", "QA report", or "source policy".

Do not nitpick normal style preferences. Only flag text that would stand out to a reader as non-public, generic, AI-ish, or instruction-like.

Return strict JSON only with this shape:
{
  "pass": true,
  "summary": "one sentence",
  "findings": [
    {
      "severity": "blocker|high|medium|low",
      "category": "ai_ish|binary_correction_cadence|instruction_leak|rubric_leak|internal_process_leak|generic_seo|source_reasoning|examples_drift|other",
      "locator": "block-001",
      "quote": "exact public text that fails",
      "why": "why this reads wrong to a public reader",
      "rewrite": "replacement public copy, or empty string if a rewrite is not safe",
      "root_cause_hint": "likely process source, based only on the public text"
    }
  ]
}

If there are any findings, pass must be false. If pass is true, findings must be an empty array.
${deterministicContext}

Rendered public article text:

${publicText}`;
}

function parseJsonResponse(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(source);
}

async function callAnthropic(prompt, model) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to a local ignored env file such as secrets/seo-aeo.env, or use --offline-scan for a non-publishable deterministic scan.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${JSON.stringify(payload).slice(0, 600)}`);
  }

  const text = (payload.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  return parseJsonResponse(text);
}

function normalizeFinding(finding, index) {
  return {
    id: finding.id || `finding-${String(index + 1).padStart(3, "0")}`,
    severity: finding.severity || "blocker",
    category: finding.category || "other",
    locator: finding.locator || "",
    quote: String(finding.quote || "").trim(),
    why: String(finding.why || "").trim(),
    rewrite: String(finding.rewrite || "").trim(),
    root_cause_hint: String(finding.root_cause_hint || "").trim(),
    source: finding.source || "model",
    rule_id: finding.rule_id || "",
  };
}

function inspectRootCause(packet, findings) {
  if (!packet) {
    return {
      status: findings.length ? "needs_packet_for_triage" : "not_needed",
      inspected_artifacts: [],
      hypotheses: [],
    };
  }

  const artifactNames = [
    "outline.md",
    "draft.md",
    "article.blocks.json",
    "qa-report.md",
    "claude-writing-pass.md",
    "research.md",
    "subagent-work-order.md",
  ];
  const inspected = [];
  const hypotheses = [];

  for (const artifact of artifactNames) {
    if (!packet.exists(artifact)) continue;
    const text = fs.readFileSync(packet.file(artifact), "utf8");
    inspected.push(artifact);
    for (const finding of findings) {
      const quote = finding.quote.slice(0, 240);
      const exactHit = quote && text.includes(quote);
      const categoryHit =
        finding.category &&
        new RegExp(escapeRegExp(finding.category).replace(/_/g, "[ _-]"), "i").test(text);
      if (exactHit || categoryHit) {
        hypotheses.push({
          finding_id: finding.id,
          artifact,
          evidence: exactHit ? "exact_quote_present" : "category_language_present",
          recommendation:
            artifact === "article.blocks.json"
              ? "Rewrite the rendered source of truth, then rerender and rerun public-reader QA."
              : `Tighten ${artifact} so internal rubric or instruction language cannot feed future public copy.`,
        });
      }
    }
  }

  return {
    status: findings.length ? "triaged" : "not_needed",
    inspected_artifacts: inspected,
    hypotheses,
  };
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function recordRegressions(root, slug, findings, rootCause) {
  if (!findings.length) return;
  const filePath = path.join(root, REGRESSION_REGISTRY);
  const registry = readJsonIfExists(filePath, {
    version: 1,
    updated_at: "",
    patterns: [],
    incidents: [],
  });
  if (!Array.isArray(registry.patterns)) registry.patterns = [];
  if (!Array.isArray(registry.incidents)) registry.incidents = [];

  const existingPatternKeys = new Set(
    registry.patterns.map((item) => `${item.category || ""}:${String(item.pattern || item.quote || "").toLowerCase()}`)
  );

  for (const finding of findings) {
    const quote = finding.quote.slice(0, 160).trim();
    if (!quote) continue;
    const key = `${finding.category}:${quote.toLowerCase()}`;
    if (!existingPatternKeys.has(key)) {
      registry.patterns.push({
        category: finding.category,
        label: `${finding.category}: ${quote.slice(0, 60)}`,
        pattern: quote,
        ...(finding.category === "rubric_leak" && /\bexamples\b/i.test(slug || "") ? { scope: "examples_only" } : {}),
        source: "public-reader-qa",
        added_at: new Date().toISOString(),
      });
      existingPatternKeys.add(key);
    }
  }

  registry.incidents.push({
    slug,
    recorded_at: new Date().toISOString(),
    findings: findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      locator: finding.locator,
      quote: finding.quote.slice(0, 300),
    })),
    root_cause: rootCause,
  });
  registry.updated_at = new Date().toISOString();
  writeJson(filePath, registry);
}

function replaceInJsonStrings(value, before, after) {
  if (typeof value === "string") {
    return {
      value: value.includes(before) ? value.split(before).join(after) : value,
      count: value.includes(before) ? value.split(before).length - 1 : 0,
    };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const result = replaceInJsonStrings(item, before, after);
      count += result.count;
      return result.value;
    });
    return { value: next, count };
  }
  if (value && typeof value === "object") {
    let count = 0;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const result = replaceInJsonStrings(item, before, after);
      count += result.count;
      next[key] = result.value;
    }
    return { value: next, count };
  }
  return { value, count: 0 };
}

function applyRewrites(packet, findings) {
  if (!packet) return { changed: false, replacements: [] };
  const replacements = [];

  const blockPath = packet.file("article.blocks.json");
  if (packet.exists("article.blocks.json")) {
    let blocks = JSON.parse(fs.readFileSync(blockPath, "utf8"));
    let totalCount = 0;
    for (const finding of findings) {
      if (!finding.quote || !finding.rewrite) continue;
      const result = replaceInJsonStrings(blocks, finding.quote, finding.rewrite);
      blocks = result.value;
      totalCount += result.count;
      if (result.count) {
        replacements.push({
          artifact: "article.blocks.json",
          finding_id: finding.id,
          count: result.count,
        });
      }
    }
    if (totalCount) writeJson(blockPath, blocks);
  }

  const draftPath = packet.file("draft.md");
  if (packet.exists("draft.md")) {
    let draft = fs.readFileSync(draftPath, "utf8");
    let totalCount = 0;
    for (const finding of findings) {
      if (!finding.quote || !finding.rewrite || !draft.includes(finding.quote)) continue;
      const count = draft.split(finding.quote).length - 1;
      draft = draft.split(finding.quote).join(finding.rewrite);
      totalCount += count;
      replacements.push({
        artifact: "draft.md",
        finding_id: finding.id,
        count,
      });
    }
    if (totalCount) writeTextAtomic(draftPath, draft);
  }

  if (replacements.length) {
    const refreshedPacket = loadPacket(packet.packetPath, packet.root);
    renderPost(refreshedPacket, { dryRun: false });
  }

  return { changed: replacements.length > 0, replacements };
}

function buildReport({ root, packet, slug, postPath, mode, model, modelPayload, deterministicHits, loop, rewritesApplied }) {
  const hashes = renderedHashes(root, postPath);
  const findings = [
    ...deterministicHits,
    ...(Array.isArray(modelPayload?.findings) ? modelPayload.findings.map(normalizeFinding) : []),
  ].map(normalizeFinding);
  const pass = modelPayload ? modelPayload.pass === true && findings.length === 0 : findings.length === 0;
  const rootCause = inspectRootCause(packet, findings);

  return {
    version: 1,
    slug,
    mode,
    model_provider: mode === "model" ? "anthropic" : "",
    model: mode === "model" ? model : "",
    generated_at: new Date().toISOString(),
    rendered_html_path: normalizePath(path.relative(root, postPath)),
    rendered_html_sha256: hashes.renderedHtmlSha256,
    article_text_sha256: hashes.articleTextSha256,
    context_policy: {
      clean_context: true,
      packet_visible_to_model: false,
      sources_visible_to_model: deterministicHits.length
        ? ["rendered_public_html_article_text", "deterministic_public_quote_flags"]
        : ["rendered_public_html_article_text"],
      root_cause_inspection_after_reader_verdict: true,
    },
    pass,
    gate_eligible: mode === "model" && pass && findings.length === 0,
    summary: modelPayload?.summary || (findings.length ? "Public-reader QA found blocking public-copy issues." : "Public-reader QA passed."),
    loop,
    findings,
    rewrites_applied: rewritesApplied,
    root_cause: rootCause,
  };
}

async function runOnce({ root, packet, slug, postPath, offlineScan, model, loop, rewritesApplied }) {
  const html = fs.readFileSync(postPath, "utf8");
  const articleHtml = articleHtmlFromRenderedPost(html);
  if (!articleHtml) throw new Error(`Rendered post is missing .blog-article: ${normalizePath(path.relative(root, postPath))}`);
  const blocks = extractPublicTextBlocks(articleHtml);
  if (!blocks.length) throw new Error("Rendered article has no readable public text blocks.");

  const deterministicHits = deterministicFindings(root, blocks, {
    examplesPost: /\bexamples\b/i.test(slug || ""),
  });
  if (offlineScan) {
    return buildReport({
      root,
      packet,
      slug,
      postPath,
      mode: offlineScan ? "offline_scan" : "deterministic_block",
      model: "",
      modelPayload: null,
      deterministicHits,
      loop,
      rewritesApplied,
    });
  }

  const modelPayload = await callAnthropic(buildPrompt({ slug, blocks, deterministicHits }), model);
  return buildReport({
    root,
    packet,
    slug,
    postPath,
    mode: "model",
    model,
    modelPayload,
    deterministicHits,
    loop,
    rewritesApplied,
  });
}

async function run() {
  rejectUnknownFlags(process.argv.slice(2));
  if (hasFlag("--help") || hasFlag("-h")) usage(0);

  const root = process.cwd();
  const packetArg = arg("--packet");
  const slugArg = arg("--slug");
  const postArg = arg("--post");
  const outArg = arg("--out");
  const apply = hasFlag("--apply");
  const offlineScan = hasFlag("--offline-scan");
  const maxLoops = numberArg("--max-loops", 2);
  const model = arg("--model", process.env.ANTHROPIC_PUBLIC_READER_MODEL || process.env.ANTHROPIC_BLOG_MODEL || DEFAULT_MODEL);
  const recordRegression = !hasFlag("--no-regression-record");

  let packet = packetArg ? loadPacket(packetArg, root) : null;
  let slug = slugArg || packet?.brief?.slug || packet?.publishMeta?.slug || "";
  let postPath = postArg ? path.resolve(root, postArg) : slug ? renderedPostPathForSlug(root, slug) : "";

  if (!slug && postPath) slug = slugFromPostPath(root, postPath);
  if (!packet && slug) packet = findPacketForSlug(root, slug);
  if (!slug) usage(2);
  if (!postPath) postPath = renderedPostPathForSlug(root, slug);
  if (!fs.existsSync(postPath)) throw new Error(`Rendered blog post not found: ${normalizePath(path.relative(root, postPath))}`);

  const reportPath = outArg ? path.resolve(root, outArg) : packet ? reportPathForPacket(packet) : "";
  if (!reportPath) {
    throw new Error("A packet or --out path is required so the public-reader report can be written.");
  }

  let latestReport = null;
  let rewritesApplied = [];
  const remediationHistory = [];
  const loops = apply ? maxLoops : 1;

  for (let loop = 1; loop <= loops; loop += 1) {
    latestReport = await runOnce({
      root,
      packet,
      slug,
      postPath,
      offlineScan,
      model,
      loop,
      rewritesApplied,
    });

    if (latestReport.pass || !apply || offlineScan) break;
    const rewriteResult = applyRewrites(packet, latestReport.findings);
    remediationHistory.push({
      loop,
      findings: latestReport.findings,
      root_cause: latestReport.root_cause,
      rewrites_applied: rewriteResult.replacements,
    });
    rewritesApplied = [...rewritesApplied, ...rewriteResult.replacements];
    if (!rewriteResult.changed) break;
  }

  if (latestReport) latestReport.remediation_history = remediationHistory;

  const regressionFindings = remediationHistory.flatMap((item) => item.findings || []);
  if (latestReport?.findings?.length) regressionFindings.push(...latestReport.findings);
  if (recordRegression && regressionFindings.length) {
    recordRegressions(root, slug, regressionFindings, {
      status: latestReport.pass ? "remediated" : latestReport.root_cause.status,
      final_root_cause: latestReport.root_cause,
      remediation_history: remediationHistory.map((item) => ({
        loop: item.loop,
        root_cause: item.root_cause,
        rewrites_applied: item.rewrites_applied,
      })),
    });
  }

  writeJson(reportPath, latestReport);
  const gate = validatePublicReaderReport({
    root,
    slug,
    postPath,
    reportPath,
    requireModel: !offlineScan,
    requireGateEligible: !offlineScan,
  });

  console.log(JSON.stringify({
    ok: gate.ok,
    slug,
    report: normalizePath(path.relative(root, reportPath)),
    pass: latestReport.pass,
    mode: latestReport.mode,
    findings: latestReport.findings.length,
    rewrites_applied: latestReport.rewrites_applied.length,
    errors: gate.errors,
  }, null, 2));

  process.exit(gate.ok ? 0 : 1);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
