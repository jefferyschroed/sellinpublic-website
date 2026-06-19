#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadPacket, writeJson } from "./blog/packet.mjs";
import { validatePacket, printValidation } from "./blog/validate-packet.mjs";
import { renderPost } from "./blog/render-post.mjs";
import { renderIndex } from "./blog/render-index.mjs";
import { renderFeeds } from "./blog/render-feeds.mjs";
import { checkAllPosts } from "./blog/check-all-posts.mjs";

const root = process.cwd();
const [command, ...args] = process.argv.slice(2);
const GOVERNED_GENERATION_ENV = "BLOG_GOVERNOR_GENERATION";

function usage(exitCode = 2) {
  console.log(`Usage:
  node scripts/blog-orchestrator.mjs validate [--stage intake|research|outline|draft|publish] content-packets/<packet>/
  node scripts/blog-orchestrator.mjs generate --dry-run content-packets/<packet>/
  node scripts/blog-orchestrator.mjs generate --dry-run --require-idempotent content-packets/<packet>/
  node scripts/blog-orchestrator.mjs generate content-packets/<packet>/ # governor-only write path
  node scripts/blog-orchestrator.mjs check-all`);
  process.exit(exitCode);
}

function normalizePacketArg(values) {
  const packetArg = values.find((value) => !value.startsWith("--"));
  if (!packetArg) usage();
  return packetArg;
}

function rejectUnknownFlags(values, allowedFlags) {
  const allowed = new Set(allowedFlags);
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    if (!allowed.has(value)) {
      console.error(`Unknown or malformed option: ${value}`);
      usage(2);
    }
  }
}

function stageArg(values) {
  const index = values.indexOf("--stage");
  if (index < 0) return "publish";
  const stage = values[index + 1];
  if (!stage || stage.startsWith("--")) usage();
  return stage;
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function runValidate(values) {
  rejectUnknownFlags(values.filter((value, index) => value !== "--stage" && values[index - 1] !== "--stage"), []);
  const packetArg = normalizePacketArg(values.filter((value, index) => value !== "--stage" && values[index - 1] !== "--stage"));
  const result = validatePacket(packetArg, root, { stage: stageArg(values) });
  printValidation(result);
  process.exit(result.ok ? 0 : 1);
}

function runGenerate(values) {
  rejectUnknownFlags(values, ["--dry-run", "--require-idempotent"]);
  const dryRun = values.includes("--dry-run");
  const requireIdempotent = values.includes("--require-idempotent");
  if (requireIdempotent && !dryRun) {
    console.error("--require-idempotent is only valid with --dry-run.");
    process.exit(1);
  }

  if (!dryRun && process.env[GOVERNED_GENERATION_ENV] !== "1") {
    console.error(
      "Non-dry-run blog generation is governed. Run scripts/seo-aeo/publish-governor.mjs --generate-approved after the publish gates pass. Direct generator use is limited to --dry-run."
    );
    process.exit(1);
  }

  const packetArg = normalizePacketArg(values);
  const validation = validatePacket(packetArg, root);
  printValidation(validation);
  if (!validation.ok) process.exit(1);

  const packet = loadPacket(packetArg, root);
  const outputs = [
    renderPost(packet, { dryRun }),
    renderIndex(root, { dryRun }),
    ...renderFeeds(root, { dryRun }),
  ];

  const report = {
    packet_id: packet.brief.packet_id,
    slug: packet.brief.slug,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    outputs: outputs.map((output) => ({
      path: relative(output.path),
      bytes: output.bytes,
      post_count: output.postCount,
      changed: Boolean(output.changed),
    })),
    validation: {
      ok: validation.ok,
      warnings: validation.warnings,
    },
  };

  if (!dryRun) {
    writeJson(packet.file("publish-report.json"), report);
  }

  console.log("\nGeneration report:");
  console.log(JSON.stringify(report, null, 2));

  if (dryRun && requireIdempotent && outputs.some((output) => output.changed)) {
    console.error("Dry-run output differs from existing files. Review the changed paths before writing.");
    process.exit(1);
  }
}

function runCheckAll() {
  const result = checkAllPosts(root);
  for (const item of result.results) {
    if (item.ok) {
      console.log(`PASS ${item.postFile}`);
    } else {
      console.error(`FAIL ${item.postFile}`);
      if (item.stderr) console.error(item.stderr.trim());
      if (item.stdout) console.error(item.stdout.trim());
    }
  }

  if (!result.results.length) {
    console.error("No blog post files found under blog/*/index.html.");
    process.exit(1);
  }

  process.exit(result.ok ? 0 : 1);
}

if (!command) usage();

switch (command) {
  case "validate":
    runValidate(args);
    break;
  case "generate":
    runGenerate(args);
    break;
  case "check-all":
    runCheckAll();
    break;
  default:
    usage();
}
