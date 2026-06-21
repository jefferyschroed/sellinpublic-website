import fs from "node:fs";
import path from "node:path";
import { isPathInside, loadPacket, REQUIRED_PACKET_FILES } from "./packet.mjs";
import {
  PUBLIC_READER_REPORT_FILE,
  renderedPostPathForSlug,
  reportPathForPacket,
  validatePublicReaderReport,
} from "../seo-aeo/lib/public-reader-gate.mjs";

const REQUIRED_BRIEF_FIELDS = [
  "packet_id",
  "status",
  "working_title",
  "slug",
  "owner",
  "created_at",
  "updated_at",
  "audience",
  "business_goal",
  "search_intent",
  "topic_map",
  "entity_targets",
  "angle",
  "cta",
  "word_count_target",
  "must_include",
  "must_avoid",
  "source_requirements",
  "approval",
];

const REQUIRED_META_FIELDS = [
  "title",
  "slug",
  "canonical_url",
  "meta_description",
  "og_title",
  "og_description",
  "og_image",
  "author",
  "author_url",
  "publish_date",
  "updated_date",
  "category",
  "tags",
  "excerpt",
  "robots",
  "schema_type",
  "internal_links",
  "topic_map",
  "cta",
];

const VALIDATION_STAGES = ["intake", "research", "outline", "draft", "publish"];

const STAGE_ARTIFACTS = {
  intake: ["brief.yaml"],
  research: ["brief.yaml", "research.md", "citations.json", "sme-notes.md"],
  outline: [
    "brief.yaml",
    "research.md",
    "citations.json",
    "sme-notes.md",
    "outline.md",
  ],
  draft: [
    "brief.yaml",
    "research.md",
    "citations.json",
    "sme-notes.md",
    "outline.md",
    "draft.md",
    "claims-ledger.csv",
  ],
  publish: REQUIRED_PACKET_FILES,
};

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function trimmedText(value) {
  return String(value ?? "").trim();
}

function sentenceCount(value) {
  const text = trimmedText(value).replace(/\s+/g, " ");
  if (!text) return 0;
  const endings = text.match(/[.!?](?:["')\]]+)?(?=\s|$)/g);
  return endings?.length || 1;
}

function collectClaimMarkers(source) {
  return Array.from(source.matchAll(/\[claim:([A-Za-z0-9_-]+)\]/g)).map((match) => match[1]);
}

function collectCitationMarkers(source) {
  return Array.from(source.matchAll(/\[cite:([A-Za-z0-9_-]+)\]/g)).map((match) => match[1]);
}

function stageOption(options) {
  const stage = options?.stage || "publish";
  if (!VALIDATION_STAGES.includes(stage)) {
    throw new Error(`Unsupported packet validation stage: ${stage}. Expected one of ${VALIDATION_STAGES.join(", ")}.`);
  }
  return stage;
}

function readOptionalJson(packet, fileName, errors) {
  if (!packet.exists(fileName)) return null;
  try {
    return JSON.parse(fs.readFileSync(packet.file(fileName), "utf8"));
  } catch (error) {
    errors.push(`${fileName} must be valid JSON: ${error.message}`);
    return null;
  }
}

function readOptionalText(packet, fileName) {
  return packet.exists(fileName) ? fs.readFileSync(packet.file(fileName), "utf8") : "";
}

function isPlaceholderText(value) {
  const text = String(value || "").trim();
  return !text || /Status:\s*not started\.?/i.test(text);
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

function isExamplesPacket(packet) {
  return /\bexamples?\b/i.test(
    [
      packet.brief?.slug,
      packet.brief?.working_title,
      packet.brief?.search_intent?.primary_query,
      packet.brief?.search_intent?.stage,
      packet.brief?.angle,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

function validateExamplesArticleIntent(packet, errors) {
  if (!isExamplesPacket(packet) || !packet.articleBlocks?.blocks) return;

  const publicText = collectStrings(packet.articleBlocks.blocks).join("\n");
  const bannedExamplesPatterns = [
    { label: "What to borrow:", pattern: /\bwhat to borrow\s*:/i },
    { label: "Use Examples Without Copying", pattern: /\buse examples without copying\b/i },
    { label: "How to Use Examples", pattern: /\bhow to use examples\b/i },
    { label: "How to Judge the Examples", pattern: /\bhow to judge (the )?examples\b/i },
    { label: "Copyable Example Checklist", pattern: /\bcopyable example checklist\b/i },
    { label: "What B2B teams can borrow", pattern: /\bwhat b2b teams can borrow\b/i },
    { label: "Quality test", pattern: /\bquality test\b/i },
    { label: "Quality bar", pattern: /\bquality bar\b/i },
    { label: "Selection criteria", pattern: /\bselection criteria\b/i },
    { label: "What Makes An Example Count", pattern: /\bwhat makes an example count\b/i },
    { label: "What makes an example worth studying", pattern: /\bwhat makes .{0,80}example worth studying\b/i },
    { label: "That's the bar worth holding", pattern: /\bthat'?s the bar worth holding\b/i },
    { label: "Helpful content guidance", pattern: /\bhelpful content guidance\b/i },
    { label: "People-first content", pattern: /\bpeople-first content\b/i },
    { label: "Could have been written by any competitor", pattern: /\bcould have been written by any competitor\b/i },
    { label: "How do you find examples inside your own company", pattern: /\bhow do you find examples inside your own company\b/i },
  ];

  for (const { label, pattern } of bannedExamplesPatterns) {
    if (pattern.test(publicText)) {
      errors.push(
        `Examples posts must publish literal example analysis, not meta-instruction sections. Remove "${label}" from article.blocks.json.`
      );
    }
  }
}

function validateClaudeWritingGate(packet, errors) {
  const qaReport = readOptionalText(packet, "qa-report.md");
  const hasOwnerException = /owner-approved exception/i.test(qaReport);
  const passText = readOptionalText(packet, "claude-writing-pass.md");

  if (!passText) {
    if (!hasOwnerException) {
      errors.push("claude-writing-pass.md is required before publish, unless qa-report.md records an owner-approved exception.");
    }
    return;
  }

  if (!/^Status:\s*applied\s*$/im.test(passText)) {
    errors.push("claude-writing-pass.md must record Status: applied before publish. Review-only sidecars are not enough.");
  }
  if (!/^Model:\s*claude-sonnet-4-6\s*$/im.test(passText)) {
    errors.push("claude-writing-pass.md must record Model: claude-sonnet-4-6 before publish.");
  }
  if (!/^Applied to draft\.md:\s*true\s*$/im.test(passText)) {
    errors.push("claude-writing-pass.md must record Applied to draft.md: true before publish.");
  }
  if (!/^Applied to article\.blocks\.json:\s*true\s*$/im.test(passText)) {
    errors.push("claude-writing-pass.md must record Applied to article.blocks.json: true before publish.");
  }
}

function validateArticleBlocks(packet, errors, warnings) {
  const blocks = packet.articleBlocks;
  if (!blocks || typeof blocks !== "object") {
    errors.push("article.blocks.json must be a JSON object.");
    return;
  }

  if (blocks.version !== 1) errors.push("article.blocks.json version must be 1.");
  if (blocks.slug !== packet.brief.slug) errors.push("article.blocks.json slug must match brief.yaml.");
  if (!hasValue(blocks.title)) errors.push("article.blocks.json title is required.");
  if (!hasValue(blocks.topic_map)) errors.push("article.blocks.json topic_map is required.");
  if (blocks.topic_map?.topic_id && packet.brief.topic_map?.topic_id && blocks.topic_map.topic_id !== packet.brief.topic_map.topic_id) {
    errors.push("article.blocks.json topic_map.topic_id must match brief.yaml.");
  }
  if (!blocks.hero?.src || !blocks.hero?.alt || !blocks.hero?.width || !blocks.hero?.height || !blocks.hero?.caption) {
    errors.push("article.blocks.json hero must include src, alt, width, and height.");
  }
  if (!Array.isArray(blocks.blocks) || !blocks.blocks.length) {
    errors.push("article.blocks.json must include at least one block.");
    return;
  }

  const hasAnswer = blocks.blocks.some((block) => block.type === "answer");
  const hasFaq = blocks.blocks.some((block) => block.type === "faq");
  const hasSources = blocks.blocks.some((block) => block.type === "sources");
  const hasCta = blocks.blocks.some((block) => block.type === "cta");

  if (!hasAnswer) errors.push("article.blocks.json must include an answer block near the top.");
  if (!hasFaq) warnings.push("article.blocks.json does not include FAQ blocks.");
  if (!hasSources) errors.push("article.blocks.json must include a sources block.");
  if (!hasCta) errors.push("article.blocks.json must include an article CTA block.");
  validateExamplesArticleIntent(packet, errors);

  const requireArray = (condition, message) => {
    if (!condition) errors.push(message);
  };

  blocks.blocks.forEach((block, index) => {
    const prefix = `article.blocks.json block ${index + 1}`;
    switch (block.type) {
      case "answer":
        if (!block.id || !block.label || !Array.isArray(block.paragraphs) || !block.paragraphs.length) {
          errors.push(`${prefix} answer requires id, label, and paragraphs.`);
        }
        break;
      case "paragraph":
        if (!hasValue(block.html)) errors.push(`${prefix} paragraph requires html.`);
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
        if (hasValue(block.body) && sentenceCount(block.body) !== 2) {
          errors.push(`${prefix} cta body must be exactly two sentences.`);
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
}

function validateBase(packet, errors) {
  if (!fs.existsSync(packet.packetPath)) {
    errors.push(`Packet directory does not exist: ${packet.packetPath}`);
    return false;
  }

  const packetRoot = path.join(packet.root, "content-packets");
  if (!isPathInside(packetRoot, packet.packetPath)) {
    errors.push("Packet path must be inside content-packets/.");
  }

  return true;
}

function validateBrief(packet, errors) {
  for (const field of REQUIRED_BRIEF_FIELDS) {
    if (!hasValue(packet.brief[field])) errors.push(`brief.yaml missing required field: ${field}`);
  }

  if (packet.brief.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packet.brief.slug)) {
    errors.push("brief.yaml slug must be lowercase kebab-case and cannot contain path separators.");
  }

  if (packet.brief.topic_map?.topic_score !== undefined && Number(packet.brief.topic_map.topic_score) < 0) {
    errors.push("brief.yaml topic_map.topic_score must be a non-negative number.");
  }
}

function validateIntake(packet, errors, warnings) {
  validateBrief(packet, errors);

  const intake = packet.exists("packet-intake.yaml") ? readOptionalText(packet, "packet-intake.yaml") : "";
  if (intake) {
    if (!/status:\s*"?intake_ready"?/i.test(intake)) errors.push("packet-intake.yaml must include status: intake_ready.");
    if (
      !/discovery_sources_excluded_from_evidence:\s*true/i.test(intake) &&
      !/discovery_inputs_citable:\s*false/i.test(intake)
    ) {
      errors.push("packet-intake.yaml must mark discovery inputs as excluded from factual evidence.");
    }
  } else {
    warnings.push("packet-intake.yaml is missing; inferred intake from brief.yaml for a legacy or migrated packet.");
  }

  const exclusions = readOptionalJson(packet, "discovery-exclusions.json", errors);
  if (exclusions) {
    if (!Array.isArray(exclusions.excluded_sources)) {
      errors.push("discovery-exclusions.json must include excluded_sources as an array.");
    }
    if (exclusions.evidence_policy !== "discovery_only_not_factual_evidence") {
      errors.push("discovery-exclusions.json must set evidence_policy: discovery_only_not_factual_evidence.");
    }
  } else {
    warnings.push("discovery-exclusions.json is missing; discovery-source boundary is not machine-readable for this packet.");
  }

  if (!packet.brief.topic_map?.topic_id) errors.push("brief.yaml topic_map.topic_id is required for intake.");
  if (!packet.brief.topic_map?.pillar_id) errors.push("brief.yaml topic_map.pillar_id is required for intake.");
  if (packet.brief.topic_map?.source_readiness !== "ready") {
    errors.push("brief.yaml topic_map.source_readiness must be ready for intake.");
  }
  if (packet.brief.topic_map?.target_asset && !["post", "refresh"].includes(packet.brief.topic_map.target_asset)) {
    warnings.push("brief.yaml topic_map.target_asset is not post or refresh; confirm this should be a packet.");
  }
  if (packet.brief.packet_intake?.status && packet.brief.packet_intake.status !== "intake_ready") {
    errors.push("brief.yaml packet_intake.status must be intake_ready when packet_intake is present.");
  }
  if (packet.brief.packet_intake?.discovery_sources_excluded_from_evidence === false) {
    errors.push("brief.yaml packet_intake.discovery_sources_excluded_from_evidence must not be false.");
  }
  if (packet.brief.packet_intake?.query_run_status && packet.brief.packet_intake.query_run_status !== "handoff_ready") {
    warnings.push(`brief.yaml packet_intake.query_run_status is ${packet.brief.packet_intake.query_run_status}, not handoff_ready.`);
  }
  if (packet.brief.approval?.strategy_gate !== true) {
    errors.push("brief.yaml approval.strategy_gate must be true for intake.");
  }
}

function validateResearch(packet, errors) {
  if (isPlaceholderText(readOptionalText(packet, "research.md"))) errors.push("research.md must be started before research validation passes.");
  if (isPlaceholderText(readOptionalText(packet, "sme-notes.md"))) errors.push("sme-notes.md must be started before research validation passes.");
  const citationIds = new Set(packet.citations.map((source) => source.id).filter(Boolean));
  if (!citationIds.size) errors.push("citations.json must contain stable source IDs.");
  if (packet.brief.approval?.source_gate !== true) errors.push("brief.yaml approval.source_gate must be true for research validation.");
}

function excludedSourceIds(packet, errors) {
  const exclusions = readOptionalJson(packet, "discovery-exclusions.json", errors);
  if (!exclusions || !Array.isArray(exclusions.excluded_sources)) return new Set();
  return new Set(exclusions.excluded_sources.map((source) => source.source_id).filter(Boolean));
}

function validateDiscoveryBoundary(packet, errors) {
  const excludedIds = excludedSourceIds(packet, errors);
  if (!excludedIds.size) return;

  for (const source of packet.citations) {
    if (excludedIds.has(source.id)) {
      errors.push(`citations.json must not include discovery-only source ID: ${source.id}`);
    }
  }

  for (const claim of packet.claims) {
    const sourceIds = String(claim.source_ids || "")
      .split(/[|;]/)
      .map((sourceId) => sourceId.trim())
      .filter(Boolean);
    for (const sourceId of sourceIds) {
      if (excludedIds.has(sourceId)) {
        errors.push(`Claim ${claim.claim_id || "unknown claim"} uses excluded discovery-only source ID: ${sourceId}`);
      }
    }
  }

  const draft = readOptionalText(packet, "draft.md");
  for (const sourceId of collectCitationMarkers(draft)) {
    if (excludedIds.has(sourceId)) {
      errors.push(`draft.md uses excluded discovery-only citation ID: ${sourceId}`);
    }
  }
}

function validateOutline(packet, errors) {
  const outline = readOptionalText(packet, "outline.md");
  if (isPlaceholderText(outline)) errors.push("outline.md must be started before outline validation passes.");
  if (!/(^|\n)#{1,3}\s+/m.test(outline)) errors.push("outline.md must include markdown headings.");
  if (packet.brief.approval?.outline_gate !== true) errors.push("brief.yaml approval.outline_gate must be true for outline validation.");
}

function validateDraft(packet, errors) {
  const citationIds = new Set(packet.citations.map((source) => source.id).filter(Boolean));
  const claimIds = new Set(packet.claims.map((claim) => claim.claim_id).filter(Boolean));
  if (!claimIds.size) errors.push("claims-ledger.csv must contain claim IDs.");

  for (const claim of packet.claims) {
    if (!["supported", "needs_sme", "needs_source", "revised", "removed"].includes(claim.status)) {
      errors.push(`claims-ledger.csv has invalid status for ${claim.claim_id || "unknown claim"}: ${claim.status}`);
    }
    const sourceIds = String(claim.source_ids || "")
      .split(/[|;]/)
      .map((sourceId) => sourceId.trim())
      .filter(Boolean);
    for (const sourceId of sourceIds) {
      if (!citationIds.has(sourceId)) {
        errors.push(`Claim ${claim.claim_id} references missing source ID: ${sourceId}`);
      }
    }
  }

  const draft = readOptionalText(packet, "draft.md");
  if (isPlaceholderText(draft)) errors.push("draft.md must be started before draft validation passes.");
  for (const claimId of collectClaimMarkers(draft)) {
    if (!claimIds.has(claimId)) errors.push(`draft.md references missing claim ID: ${claimId}`);
  }
  if (/\bTODO\b|\[source needed\]|\[cite needed\]/i.test(draft)) {
    errors.push("draft.md contains unresolved TODO or missing-citation markers.");
  }
}

function validatePublicReaderGate(packet, errors, warnings, options = {}) {
  const slug = packet.brief.slug || packet.publishMeta.slug || "";
  if (!slug) return;

  const reportPath = reportPathForPacket(packet);
  const shouldValidate = options.requirePublicReaderReport || packet.exists(PUBLIC_READER_REPORT_FILE);
  if (!shouldValidate) {
    warnings.push(`${PUBLIC_READER_REPORT_FILE} is not present yet; governed generation will run clean public-reader QA after rendering.`);
    return;
  }

  const result = validatePublicReaderReport({
    root: packet.root,
    slug,
    postPath: renderedPostPathForSlug(packet.root, slug),
    reportPath,
    requireModel: true,
  });
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}

function validatePublish(packet, errors, warnings, options = {}) {
  for (const field of REQUIRED_META_FIELDS) {
    if (!hasValue(packet.publishMeta[field])) errors.push(`publish-meta.yaml missing required field: ${field}`);
  }

  if (packet.brief.slug && packet.publishMeta.slug && packet.brief.slug !== packet.publishMeta.slug) {
    errors.push("brief.yaml slug and publish-meta.yaml slug must match.");
  }

  if (packet.publishMeta.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packet.publishMeta.slug)) {
    errors.push("publish-meta.yaml slug must be lowercase kebab-case and cannot contain path separators.");
  }

  if (packet.brief.topic_map?.topic_id && packet.publishMeta.topic_map?.topic_id) {
    if (packet.brief.topic_map.topic_id !== packet.publishMeta.topic_map.topic_id) {
      errors.push("brief.yaml topic_map.topic_id and publish-meta.yaml topic_map.topic_id must match.");
    }
  }

  for (const claim of packet.claims) {
    if (["needs_sme", "needs_source"].includes(claim.status)) {
      errors.push(`Claim ${claim.claim_id || "unknown claim"} is unresolved: ${claim.status}`);
    }
  }

  validateArticleBlocks(packet, errors, warnings);
  validateClaudeWritingGate(packet, errors);
  validatePublicReaderGate(packet, errors, warnings, options);

  if (packet.assetManifest?.assets) {
    for (const asset of packet.assetManifest.assets) {
      const assetPath = path.join(packet.root, asset.path || "");
      if (!fs.existsSync(assetPath)) errors.push(`Asset file does not exist: ${asset.path}`);
      if (!asset.width || !asset.height || !asset.alt) {
        errors.push(`Asset ${asset.id || asset.path} must include width, height, and alt text.`);
      }
    }
  }

  const approvedQa =
    packet.exists("qa-report.md") &&
    /^Decision:\s*`?(approved_with_notes|approved)`?\s*$/im.test(fs.readFileSync(packet.file("qa-report.md"), "utf8"));
  if (!approvedQa) errors.push("qa-report.md must be approved or approved_with_notes before validation passes.");
  if (packet.brief.approval?.qa_gate !== true) errors.push("brief.yaml approval.qa_gate must be true for publish validation.");
  if (packet.brief.approval?.publish_gate !== true) errors.push("brief.yaml approval.publish_gate must be true for publish validation.");
}

export function validatePacket(packetPath, root = process.cwd(), options = {}) {
  if (root && typeof root === "object") {
    options = root;
    root = process.cwd();
  }
  const stage = stageOption(options);
  const packet = loadPacket(packetPath, root);
  const errors = [];
  const warnings = [];

  if (!validateBase(packet, errors)) return { packet, errors, warnings, ok: false, stage };

  for (const fileName of STAGE_ARTIFACTS[stage]) {
    if (!packet.exists(fileName)) errors.push(`Missing required packet artifact: ${fileName}`);
  }

  validateIntake(packet, errors, warnings);
  if (["research", "outline", "draft", "publish"].includes(stage)) validateResearch(packet, errors);
  if (["outline", "draft", "publish"].includes(stage)) validateOutline(packet, errors);
  if (["draft", "publish"].includes(stage)) {
    validateDraft(packet, errors);
    validateDiscoveryBoundary(packet, errors);
  }
  if (stage === "publish") validatePublish(packet, errors, warnings, options);

  return { packet, errors, warnings, ok: errors.length === 0, stage };
}

export function printValidation(result) {
  const label = result.ok ? "passed" : "failed";
  console.log(`Packet validation ${label}: ${result.packet.packetName} (${result.stage || "publish"})`);
  if (result.errors.length) {
    console.log("\nErrors:");
    result.errors.forEach((error) => console.log(`- ${error}`));
  }
  if (result.warnings.length) {
    console.log("\nWarnings:");
    result.warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}
