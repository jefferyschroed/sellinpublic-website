#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listPacketDirs, normalizePath } from "../blog/packet.mjs";
import { validatePacket } from "../blog/validate-packet.mjs";
import { ensureDir, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { contentDecisionHasDecisionGradeEvidence } from "./lib/content-decisions.mjs";
import { readCsv } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const DEFAULT_GOVERNOR = {
  maxPostsPerDay: 3,
  allowMultiPostGeneration: false,
  maxPostsPerPillarPerDay: 2,
  coverageRoleDailyLimits: {
    hub: 1,
    spoke: 3,
    case_study: 1,
    refresh: 2,
  },
  minimumTopicScore: 80,
  allowedSourceReadiness: ["ready"],
  allowedTargetAssets: ["post"],
  eligibleStatuses: ["approved", "approved_with_notes", "ready", "ready_to_publish", "publish_ready"],
  blockedStatuses: ["draft", "planned", "rejected", "parked", "published", "published_draft"],
  blockingTopicDecisions: ["resolve_gap_first", "map_as_h2_faq_or_section", "monitor", "park", "merge", "retire"],
  requiredApprovalGates: ["strategy_gate", "source_gate", "outline_gate", "qa_gate", "publish_gate"],
  approvedContentDecisionStatuses: ["approved", "accepted", "owner_approved", "completed"],
  blockingContentDecisions: ["merge", "retire", "park"],
  requireQueryHandoffReady: true,
  allowedQueryRunStatuses: ["handoff_ready"],
  requireApprovedContentDecision: false,
  blockOnFailedDailyReport: true,
  allowRepublish: false,
};

const DECISION_PRIORITY = new Map([
  ["refresh", 0],
  ["update", 0],
  ["expand", 1],
  ["create", 1],
  ["keep", 2],
  ["monitor", 3],
]);

const ROLE_PRIORITY = new Map([
  ["hub", 0],
  ["spoke", 1],
  ["case_study", 2],
  ["case-study", 2],
  ["post", 3],
]);

function usage(exitCode = 2) {
  console.log(`Usage:
  node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd
  node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd --generate-approved
  node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd --generate-approved --dry-run
  node scripts/seo-aeo/publish-governor.mjs --date yyyy-mm-dd --generate-approved --allow-multi-post

Default mode is a dry-run plan only. --generate-approved calls the blog orchestrator only for selected packets within the daily publish limits.`);
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

function rejectUnknownFlags(argv) {
  const allowedFlags = new Set([
    "--date",
    "--generate-approved",
    "--dry-run",
    "--allow-multi-post",
    "--help",
    "-h",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && value !== "-h") continue;
    if (!allowedFlags.has(value)) {
      console.error(`Unknown or malformed option: ${value}`);
      usage(2);
    }
    if (value === "--date") {
      index += 1;
    }
  }
}

function toArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return fallback;
  return [value];
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTokenArray(values, fallback = []) {
  return toArray(values, fallback).map(normalizeToken).filter(Boolean);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function numberOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  return value === true || normalizeToken(value) === "true";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return "";
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${key}:\\s*['"]?([^'"\\n#]+)`, "m");
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function loadGovernorConfig(config) {
  const raw = config.publishGovernor || {};
  const legacy = config.publishing || {};
  const coverageRoleDailyLimits = {};
  const rawRoleLimits = raw.coverageRoleDailyLimits || DEFAULT_GOVERNOR.coverageRoleDailyLimits;
  for (const [role, limit] of Object.entries(rawRoleLimits)) {
    coverageRoleDailyLimits[normalizeToken(role)] = positiveInteger(limit, Number.POSITIVE_INFINITY);
  }

  return {
    maxPostsPerDay: positiveInteger(
      raw.maxPostsPerDay ?? raw.dailyPostLimit ?? legacy.maxPostsPerDay ?? legacy.dailyLimit,
      DEFAULT_GOVERNOR.maxPostsPerDay
    ),
    allowMultiPostGeneration: Boolean(raw.allowMultiPostGeneration ?? DEFAULT_GOVERNOR.allowMultiPostGeneration),
    maxPostsPerPillarPerDay: positiveInteger(
      raw.maxPostsPerPillarPerDay,
      DEFAULT_GOVERNOR.maxPostsPerPillarPerDay
    ),
    coverageRoleDailyLimits,
    minimumTopicScore: numberOrNull(raw.minimumTopicScore) ?? DEFAULT_GOVERNOR.minimumTopicScore,
    allowedSourceReadiness: normalizeTokenArray(
      raw.allowedSourceReadiness,
      DEFAULT_GOVERNOR.allowedSourceReadiness
    ),
    allowedTargetAssets: normalizeTokenArray(raw.allowedTargetAssets, DEFAULT_GOVERNOR.allowedTargetAssets),
    eligibleStatuses: normalizeTokenArray(raw.eligibleStatuses, DEFAULT_GOVERNOR.eligibleStatuses),
    blockedStatuses: normalizeTokenArray(raw.blockedStatuses, DEFAULT_GOVERNOR.blockedStatuses),
    blockingTopicDecisions: normalizeTokenArray(
      raw.blockingTopicDecisions,
      DEFAULT_GOVERNOR.blockingTopicDecisions
    ),
    requiredApprovalGates: toArray(raw.requiredApprovalGates, DEFAULT_GOVERNOR.requiredApprovalGates).filter(Boolean),
    approvedContentDecisionStatuses: normalizeTokenArray(
      raw.approvedContentDecisionStatuses,
      DEFAULT_GOVERNOR.approvedContentDecisionStatuses
    ),
    blockingContentDecisions: normalizeTokenArray(
      raw.blockingContentDecisions,
      DEFAULT_GOVERNOR.blockingContentDecisions
    ),
    requireQueryHandoffReady: Boolean(raw.requireQueryHandoffReady ?? DEFAULT_GOVERNOR.requireQueryHandoffReady),
    allowedQueryRunStatuses: normalizeTokenArray(
      raw.allowedQueryRunStatuses,
      DEFAULT_GOVERNOR.allowedQueryRunStatuses
    ),
    requireApprovedContentDecision: Boolean(raw.requireApprovedContentDecision ?? DEFAULT_GOVERNOR.requireApprovedContentDecision),
    blockOnFailedDailyReport: Boolean(raw.blockOnFailedDailyReport ?? DEFAULT_GOVERNOR.blockOnFailedDailyReport),
    allowRepublish: Boolean(raw.allowRepublish ?? DEFAULT_GOVERNOR.allowRepublish),
  };
}

function readTopicCoverage(root) {
  const rows = readCsv(path.join(root, "docs", "seo-aeo", "topic-coverage.csv")).rows;
  const byTopicId = new Map();
  const bySlug = new Map();
  for (const row of rows) {
    if (row.topic_id) byTopicId.set(row.topic_id, row);
    if (row.slug) bySlug.set(row.slug, row);
  }
  return { rows, byTopicId, bySlug };
}

function readContentDecisions(root) {
  const rows = readCsv(path.join(root, "analytics", "content_decisions.csv")).rows;
  return rows
    .filter((row) => row.slug || row.page_url)
    .filter((row) => isOpenContentDecision(row))
    .filter((row) => contentDecisionHasDecisionGradeEvidence(row))
    .sort((a, b) => {
      const dateCompare = lifecycleDate(a).localeCompare(lifecycleDate(b));
      if (dateCompare !== 0) return dateCompare;
      const pageCompare = `${a.slug || ""}${a.page_url || ""}`.localeCompare(`${b.slug || ""}${b.page_url || ""}`);
      if (pageCompare !== 0) return pageCompare;
      return String(a.decision_id || "").localeCompare(String(b.decision_id || ""));
    });
}

const CLOSED_CONTENT_DECISION_OUTCOMES = new Set(["completed", "closed", "superseded", "rejected", "no_action", "no-action"]);
const CLOSED_CONTENT_DECISION_STATUSES = new Set(["completed", "closed", "superseded", "rejected"]);

function lifecycleDate(row) {
  return String(row.last_seen_date || row.decision_date || row.first_seen_date || "");
}

function isOpenContentDecision(row) {
  const status = normalizeToken(row.status);
  const outcome = normalizeToken(row.outcome);
  return !CLOSED_CONTENT_DECISION_STATUSES.has(status) && (!outcome || !CLOSED_CONTENT_DECISION_OUTCOMES.has(outcome));
}

function latestContentDecision(decisions, packet) {
  const slug = packet.brief?.slug || packet.publishMeta?.slug || "";
  const canonicalUrl = packet.publishMeta?.canonical_url || "";
  const matches = decisions.filter((row) => {
    return (slug && row.slug === slug) || (canonicalUrl && row.page_url === canonicalUrl);
  });
  return matches.at(-1) || null;
}

function readDailyReadiness(root, runDate, governor) {
  const reportPath = path.join(root, "automation-runs", runDate, "daily-report.json");
  const currentQueryRunDirPath = path.join(root, "research", "query-intelligence", `${runDate}-daily-discovery`);
  const currentQueryHandoffPath = path.join(currentQueryRunDirPath, "brief-handoff.yaml");
  const currentQueryHandoffFromDisk = readYamlScalar(currentQueryHandoffPath, "handoff_status");
  const currentQueryRunDirFromDisk = fs.existsSync(currentQueryRunDirPath) ? relative(root, currentQueryRunDirPath) : "";

  if (!fs.existsSync(reportPath)) {
    const currentQueryHandoffStatus = currentQueryHandoffFromDisk || "missing";
    return {
      path: relative(root, reportPath),
      exists: false,
      status: "missing",
      blockers:
        governor.requireQueryHandoffReady && currentQueryHandoffStatus !== "ready"
          ? [`Current daily query handoff is ${currentQueryHandoffStatus}; governed publishing requires the current run to be ready.`]
          : [],
      current_query_handoff_status: currentQueryHandoffStatus,
      current_query_run_dir: currentQueryRunDirFromDisk,
      notes: ["No daily-report.json found for this date; packet-level gates still apply."],
    };
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const blockers = [];
    if (governor.blockOnFailedDailyReport && report.status === "failed") {
      blockers.push("Daily report status is failed.");
    }

    const blogFoundationStep = (report.steps || []).find((step) => step.name === "Validate current blog foundation");
    if (blogFoundationStep && blogFoundationStep.status === "failed") {
      blockers.push("Daily blog foundation check failed.");
    }

    const currentQueryStep = (report.steps || []).find((step) => step.name === "Validate current query intelligence");
    let currentQueryHandoffStatus = "missing";
    let currentQueryRunDir = "";
    if (currentQueryStep) {
      try {
        const parsed = JSON.parse(currentQueryStep.output || "{}");
        currentQueryHandoffStatus = parsed.handoff_status || currentQueryHandoffStatus;
        currentQueryRunDir = parsed.query_run_dir || parsed.run_dir || "";
        if (!parsed.skipped && parsed.run_dir) {
          const handoffPath = path.resolve(root, parsed.run_dir, "brief-handoff.yaml");
          currentQueryHandoffStatus = readYamlScalar(handoffPath, "handoff_status") || currentQueryHandoffStatus;
        }
      } catch {
        currentQueryHandoffStatus = currentQueryStep.status || "unreadable";
      }
    }
    if (currentQueryHandoffFromDisk) {
      currentQueryHandoffStatus = currentQueryHandoffFromDisk;
      currentQueryRunDir = currentQueryRunDirFromDisk;
    }

    if (governor.requireQueryHandoffReady && currentQueryHandoffStatus !== "ready") {
      blockers.push(
        `Current daily query handoff is ${currentQueryHandoffStatus}; governed publishing requires the current run to be ready.`
      );
    }

    return {
      path: relative(root, reportPath),
      exists: true,
      status: report.status || "unknown",
      blockers,
      current_query_handoff_status: currentQueryHandoffStatus,
      current_query_run_dir: currentQueryRunDir,
      notes: (report.next_manual_actions || []).slice(0, 10),
    };
  } catch (error) {
    return {
      path: relative(root, reportPath),
      exists: true,
      status: "unreadable",
      blockers: [`Daily report is not valid JSON: ${error.message}`],
      notes: [],
    };
  }
}

function reason(code, message, detail = {}) {
  return { code, message, ...detail };
}

function qaDecision(packet) {
  const qaPath = packet.file("qa-report.md");
  const qa = readTextIfExists(qaPath);
  const match = qa.match(/^Decision:\s*`?([^`\n]+)`?\s*$/im);
  return match ? normalizeToken(match[1]) : "";
}

function packetAlreadyPublished(root, packet, governor) {
  if (governor.allowRepublish) return false;
  const slug = packet.brief?.slug || packet.publishMeta?.slug || "";
  const outputPath = slug ? path.join(root, "blog", slug, "index.html") : "";
  return packet.exists("publish-report.json") || (outputPath && fs.existsSync(outputPath));
}

function coverageForPacket(topicCoverage, packet) {
  const topicId = packet.brief?.topic_map?.topic_id || packet.publishMeta?.topic_map?.topic_id || "";
  const slug = packet.brief?.slug || packet.publishMeta?.slug || "";
  return topicCoverage.byTopicId.get(topicId) || topicCoverage.bySlug.get(slug) || {};
}

function inspectPacket(root, packetDir, context) {
  const packetPath = relative(root, packetDir);
  const reasons = [];
  let validation;

  try {
    validation = validatePacket(packetPath, root);
  } catch (error) {
    return {
      packet: packetPath,
      packet_name: path.basename(packetDir),
      slug: "",
      valid: false,
      selected: false,
      reasons: [reason("packet_unreadable", `Packet could not be read: ${error.message}`)],
      validation: {
        ok: false,
        errors: [error.message],
        warnings: [],
      },
    };
  }

  const { governor, topicCoverage, contentDecisions, readiness } = context;
  const packet = validation.packet;
  const coverage = coverageForPacket(topicCoverage, packet);
  const latestDecision = latestContentDecision(contentDecisions, packet);

  const status = normalizeToken(packet.brief.status);
  const packetIntakeStatus = normalizeToken(packet.brief?.packet_intake?.status);
  const queryRunStatus = normalizeToken(packet.brief?.packet_intake?.query_run_status);
  const sourceReadiness = normalizeToken(firstValue(packet.brief?.topic_map?.source_readiness, coverage.source_readiness));
  const targetAsset = normalizeToken(firstValue(packet.brief?.topic_map?.target_asset, coverage.target_asset));
  const topicDecision = normalizeToken(firstValue(packet.brief?.topic_map?.topic_decision, coverage.decision));
  const coverageStatus = normalizeToken(coverage.status);
  const coverageRole = normalizeToken(firstValue(packet.brief?.topic_map?.coverage_role, coverage.coverage_role));
  const pillarId = firstValue(packet.brief?.topic_map?.pillar_id, coverage.pillar_id);
  const topicId = firstValue(packet.brief?.topic_map?.topic_id, coverage.topic_id);
  const topicScore = numberOrNull(firstValue(packet.brief?.topic_map?.topic_score, coverage.score));
  const decisionStatus = normalizeToken(latestDecision?.status);
  const decision = normalizeToken(latestDecision?.decision);

  if (!validation.ok) {
    reasons.push(
      reason("strict_validation_failed", "Strict packet validation failed.", {
        errors: validation.errors,
      })
    );
  }

  for (const blocker of readiness.blockers) {
    reasons.push(reason("daily_readiness_blocker", blocker));
  }

  if (governor.blockedStatuses.includes(status)) {
    reasons.push(reason("blocked_packet_status", `Packet status is blocked: ${packet.brief.status}.`));
  } else if (!governor.eligibleStatuses.includes(status)) {
    reasons.push(reason("ineligible_packet_status", `Packet status is not publish eligible: ${packet.brief.status}.`));
  }

  if (
    governor.requireQueryHandoffReady &&
    !governor.allowedQueryRunStatuses.includes(queryRunStatus)
  ) {
    reasons.push(
      reason(
        "query_handoff_not_ready",
        `Query handoff is not publish eligible: ${queryRunStatus || "missing"}. Require ${governor.allowedQueryRunStatuses.join(" or ")} before governed generation.`,
        { query_run_status: queryRunStatus || "", packet_intake_status: packetIntakeStatus || "" }
      )
    );
  }

  if (!governor.allowedSourceReadiness.includes(sourceReadiness)) {
    reasons.push(
      reason("source_readiness_not_allowed", `Source readiness is not publish eligible: ${sourceReadiness || "missing"}.`)
    );
  }

  if (!governor.allowedTargetAssets.includes(targetAsset)) {
    reasons.push(reason("target_asset_not_allowed", `Target asset is not publish eligible: ${targetAsset || "missing"}.`));
  }

  if (governor.blockingTopicDecisions.includes(topicDecision)) {
    reasons.push(reason("topic_decision_blocked", `Topic decision blocks publishing: ${topicDecision}.`));
  }

  if (!governor.allowRepublish && coverageStatus && governor.blockedStatuses.includes(coverageStatus)) {
    reasons.push(reason("coverage_status_blocked", `Topic coverage status is already blocked for publishing: ${coverage.status}.`));
  }

  if (topicScore === null || topicScore < governor.minimumTopicScore) {
    reasons.push(
      reason("topic_score_below_minimum", `Topic score is below the publish minimum ${governor.minimumTopicScore}.`, {
        topic_score: topicScore,
      })
    );
  }

  for (const gate of governor.requiredApprovalGates) {
    if (!booleanValue(packet.brief?.approval?.[gate])) {
      reasons.push(reason("approval_gate_missing", `Required approval gate is not true: ${gate}.`, { gate }));
    }
  }

  const qa = qaDecision(packet);
  if (!["approved", "approved_with_notes"].includes(qa)) {
    reasons.push(reason("qa_not_approved", "QA report is not approved or approved_with_notes."));
  }

  if (packetAlreadyPublished(root, packet, governor)) {
    reasons.push(reason("already_published", "Packet already has generated publish output; republishing is disabled."));
  }

  if (latestDecision && governor.approvedContentDecisionStatuses.includes(decisionStatus)) {
    if (governor.blockingContentDecisions.includes(decision)) {
      reasons.push(reason("content_decision_blocks_publish", `Approved content decision blocks publishing: ${decision}.`));
    }
  } else if (governor.requireApprovedContentDecision) {
    reasons.push(reason("approved_content_decision_missing", "No approved content decision exists for this packet."));
  }

  return {
    packet: packetPath,
    packet_name: packet.packetName,
    slug: packet.brief.slug || packet.publishMeta.slug || "",
    title: packet.publishMeta.title || packet.brief.working_title || "",
    valid: validation.ok,
    selected: false,
    status,
    packet_intake_status: packetIntakeStatus,
    query_run_status: queryRunStatus,
    source_readiness: sourceReadiness,
    target_asset: targetAsset,
    topic_decision: topicDecision,
    coverage_status: coverageStatus,
    coverage_role: coverageRole,
    pillar_id: pillarId,
    topic_id: topicId,
    topic_score: topicScore,
    publish_date: packet.publishMeta.publish_date || "",
    updated_date: packet.publishMeta.updated_date || packet.brief.updated_at || "",
    qa_decision: qa,
    latest_content_decision: latestDecision,
    reasons,
    selection_reasons: [],
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };
}

function contentDecisionPriority(packet, governor) {
  const status = normalizeToken(packet.latest_content_decision?.status);
  const decision = normalizeToken(packet.latest_content_decision?.decision);
  if (!status || !decision) return 9;
  if (!governor.approvedContentDecisionStatuses.includes(status) && status !== "approved") return 8;
  return DECISION_PRIORITY.get(decision) ?? 7;
}

function rolePriority(packet) {
  return ROLE_PRIORITY.get(packet.coverage_role) ?? 9;
}

function sortEligiblePackets(packets, governor) {
  return [...packets].sort((a, b) => {
    const decisionCompare = contentDecisionPriority(a, governor) - contentDecisionPriority(b, governor);
    if (decisionCompare !== 0) return decisionCompare;
    const scoreCompare = (b.topic_score ?? -1) - (a.topic_score ?? -1);
    if (scoreCompare !== 0) return scoreCompare;
    const roleCompare = rolePriority(a) - rolePriority(b);
    if (roleCompare !== 0) return roleCompare;
    const publishDateCompare = String(a.publish_date || "").localeCompare(String(b.publish_date || ""));
    if (publishDateCompare !== 0) return publishDateCompare;
    return a.packet.localeCompare(b.packet);
  });
}

function applyDailyLimits(inspections, governor) {
  const selected = [];
  const blocked = inspections.filter((packet) => packet.reasons.length);
  const eligible = sortEligiblePackets(
    inspections.filter((packet) => !packet.reasons.length),
    governor
  );
  const pillarCounts = new Map();
  const roleCounts = new Map();

  for (const packet of eligible) {
    const limitReasons = [];
    const pillarKey = packet.pillar_id || "missing_pillar";
    const roleKey = packet.coverage_role || "missing_role";

    if (selected.length >= governor.maxPostsPerDay) {
      limitReasons.push(
        reason("daily_post_limit_reached", `Daily post limit reached: ${governor.maxPostsPerDay}.`)
      );
    }

    if ((pillarCounts.get(pillarKey) || 0) >= governor.maxPostsPerPillarPerDay) {
      limitReasons.push(
        reason("daily_pillar_limit_reached", `Daily pillar limit reached for ${pillarKey}: ${governor.maxPostsPerPillarPerDay}.`)
      );
    }

    const roleLimit = governor.coverageRoleDailyLimits[roleKey] ?? Number.POSITIVE_INFINITY;
    if ((roleCounts.get(roleKey) || 0) >= roleLimit) {
      limitReasons.push(reason("daily_role_limit_reached", `Daily coverage role limit reached for ${roleKey}: ${roleLimit}.`));
    }

    if (limitReasons.length) {
      packet.reasons.push(...limitReasons);
      blocked.push(packet);
      continue;
    }

    packet.selected = true;
    packet.selection_reasons.push(
      "Strict packet validation passed.",
      `Status ${packet.status}, source readiness ${packet.source_readiness}, topic score ${packet.topic_score}.`,
      "Within configured daily publish limits."
    );
    selected.push(packet);
    pillarCounts.set(pillarKey, (pillarCounts.get(pillarKey) || 0) + 1);
    roleCounts.set(roleKey, (roleCounts.get(roleKey) || 0) + 1);
  }

  return {
    selected,
    blocked: blocked.sort((a, b) => a.packet.localeCompare(b.packet)),
  };
}

function runStep(root, name, args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return {
    name,
    command: [process.execPath, ...args].join(" "),
    status: result.status === 0 ? "completed" : "failed",
    exit_code: result.status,
    output,
  };
}

function runGeneration(root, selected, dryRun, options = {}) {
  const steps = [];
  if (!dryRun && selected.length > 1 && !options.allowMultiPostGeneration) {
    return [
      {
        name: "Generation preflight",
        command: "scripts/seo-aeo/publish-governor.mjs --generate-approved",
        status: "failed",
        exit_code: 1,
        output: `${selected.length} packets were selected. Non-dry-run multi-post generation requires --allow-multi-post or publishGovernor.allowMultiPostGeneration=true.`,
      },
    ];
  }

  for (const packet of selected) {
    const args = ["scripts/blog-orchestrator.mjs", "generate"];
    if (dryRun) args.push("--dry-run");
    args.push(packet.packet);
    const env = dryRun ? {} : { BLOG_GOVERNOR_GENERATION: "1" };
    const step = runStep(root, `${dryRun ? "Dry-run generate" : "Generate"} ${packet.packet}`, args, env);
    steps.push(step);
    if (step.status === "failed") return steps;
  }

  if (selected.length) {
    steps.push(runStep(root, "Check all generated blog posts", ["scripts/blog-orchestrator.mjs", "check-all"]));
  }

  return steps;
}

function formatReasons(reasons) {
  if (!reasons.length) return "No blockers.";
  return reasons
    .map((item) => {
      const suffix = item.errors?.length ? ` (${item.errors.slice(0, 3).join("; ")})` : "";
      return `${item.code}: ${item.message}${suffix}`;
    })
    .join("; ");
}

function writeMarkdownReport(filePath, report) {
  const selectedLines = report.selected_packets.length
    ? report.selected_packets
        .map(
          (packet, index) =>
            `${index + 1}. ${packet.packet} (${packet.slug}) - score ${packet.topic_score}; ${packet.selection_reasons.join(" ")}`
        )
        .join("\n")
    : "- None.";

  const blockedLines = report.blocked_packets.length
    ? report.blocked_packets
        .map((packet) => `- ${packet.packet || packet.packet_name}: ${formatReasons(packet.reasons)}`)
        .join("\n")
    : "- None.";

  const generationLines = report.generation_steps.length
    ? report.generation_steps
        .map((step) => `## ${step.name}\n\nStatus: ${step.status}\n\n\`\`\`text\n${step.output || "(no output)"}\n\`\`\``)
        .join("\n\n")
    : "No generation commands were run.";

  const roleLimits = Object.entries(report.limits.coverage_role_daily_limits)
    .map(([role, limit]) => `${role}: ${limit}`)
    .join(", ");

  const markdown = `# Daily Publish Plan

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Mode: ${report.mode}
Status: ${report.status}

## Limits

- Max posts per day: ${report.limits.max_posts_per_day}
- Max posts per pillar per day: ${report.limits.max_posts_per_pillar_per_day}
- Coverage role limits: ${roleLimits || "none"}
- Minimum topic score: ${report.limits.minimum_topic_score}
- Allowed source readiness: ${report.limits.allowed_source_readiness.join(", ")}
- Required query handoff: ${report.limits.require_query_handoff_ready ? report.limits.allowed_query_run_statuses.join(", ") : "disabled"}

## Readiness Inputs

- Config: ${report.inputs.config_path}${report.inputs.using_example_config ? " (example fallback)" : ""}
- Daily report: ${report.inputs.daily_report.path} (${report.inputs.daily_report.status})
- Content decisions read: ${report.inputs.content_decisions_read}
- Packets inspected: ${report.inputs.packets_inspected}

## Selected Packets

${selectedLines}

## Blocked Packets

${blockedLines}

## Generation

${generationLines}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function reportStatus({ selected, generationSteps, generateApproved, dryRunGenerate }) {
  if (generationSteps.some((step) => step.status === "failed")) return "generation_failed";
  if (generateApproved && dryRunGenerate && selected.length) return "dry_run_generated";
  if (generateApproved && selected.length) return "generated";
  if (selected.length) return "ready";
  return "blocked";
}

function publicLimitReport(governor) {
  return {
    max_posts_per_day: governor.maxPostsPerDay,
    allow_multi_post_generation: governor.allowMultiPostGeneration,
    max_posts_per_pillar_per_day: governor.maxPostsPerPillarPerDay,
    coverage_role_daily_limits: governor.coverageRoleDailyLimits,
    minimum_topic_score: governor.minimumTopicScore,
    allowed_source_readiness: governor.allowedSourceReadiness,
    allowed_target_assets: governor.allowedTargetAssets,
    eligible_statuses: governor.eligibleStatuses,
    blocked_statuses: governor.blockedStatuses,
    blocking_topic_decisions: governor.blockingTopicDecisions,
    required_approval_gates: governor.requiredApprovalGates,
    approved_content_decision_statuses: governor.approvedContentDecisionStatuses,
    blocking_content_decisions: governor.blockingContentDecisions,
    require_query_handoff_ready: governor.requireQueryHandoffReady,
    allowed_query_run_statuses: governor.allowedQueryRunStatuses,
    require_approved_content_decision: governor.requireApprovedContentDecision,
    block_on_failed_daily_report: governor.blockOnFailedDailyReport,
    allow_republish: governor.allowRepublish,
  };
}

function nextManualActions({ selected, generationSteps, generateApproved }) {
  if (generationSteps.some((step) => step.status === "failed")) {
    return ["Generation failed. Review generation_steps before retrying."];
  }
  if (selected.length && !generateApproved) {
    return ["Review selected packets and obtain publish approval before running --generate-approved."];
  }
  if (!selected.length) {
    return ["No packets were selected. Review blocked packet reasons before attempting generation."];
  }
  return [];
}

function run() {
  rejectUnknownFlags(process.argv.slice(2));
  if (hasFlag("--help") || hasFlag("-h")) usage(0);

  const root = process.cwd();
  const runDate = arg("--date", today());
  const generateApproved = hasFlag("--generate-approved");
  const dryRunGenerate = hasFlag("--dry-run");
  const allowMultiPostFlag = hasFlag("--allow-multi-post");
  const config = loadConfig(root);
  const governor = loadGovernorConfig(config);
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const topicCoverage = readTopicCoverage(root);
  const contentDecisions = readContentDecisions(root);
  const readiness = readDailyReadiness(root, runDate, governor);
  const context = { governor, topicCoverage, contentDecisions, readiness };
  const packetDirs = listPacketDirs(root);
  const inspections = packetDirs.map((packetDir) => inspectPacket(root, packetDir, context));
  const { selected, blocked } = applyDailyLimits(inspections, governor);
  const generationSteps = generateApproved
    ? runGeneration(root, selected, dryRunGenerate, {
        allowMultiPostGeneration: allowMultiPostFlag || governor.allowMultiPostGeneration,
      })
    : [];
  const status = reportStatus({ selected, generationSteps, generateApproved, dryRunGenerate });
  const mode = generateApproved ? (dryRunGenerate ? "generate_approved_dry_run" : "generate_approved") : "dry_run_plan";

  const report = {
    run_date: runDate,
    generated_at: new Date().toISOString(),
    mode,
    status,
    limits: publicLimitReport(governor),
    inputs: {
      config_path: relative(root, config._path),
      using_example_config: config._usingExample,
      daily_report: readiness,
      content_decisions_read: contentDecisions.length,
      packets_inspected: packetDirs.length,
      allow_multi_post_flag: allowMultiPostFlag,
    },
    selected_packets: selected,
    blocked_packets: blocked,
    generation_steps: generationSteps,
    next_manual_actions: nextManualActions({ selected, generationSteps, generateApproved }),
  };

  const jsonPath = path.join(outputDir, "publish-plan.json");
  const markdownPath = path.join(outputDir, "publish-plan.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdownReport(markdownPath, report);

  console.log(
    JSON.stringify(
      {
        ok: !generationSteps.some((step) => step.status === "failed"),
        run_date: runDate,
        mode,
        status,
        selected: selected.length,
        blocked: blocked.length,
        publish_plan_json: relative(root, jsonPath),
        publish_plan_md: relative(root, markdownPath),
      },
      null,
      2
    )
  );

  process.exit(generationSteps.some((step) => step.status === "failed") ? 1 : 0);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
