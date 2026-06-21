#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./lib/config.mjs";
import { today } from "./lib/dates.mjs";

const FALLBACK_EXPECTED_AUTOMATIONS = [
  {
    id: "sell-in-public-seo-aeo-daily-pipeline",
    cadence: "daily",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: [
      "daily SEO/AEO controller",
      "validate the demand import pack",
      "run-status",
      "publish governor",
    ],
  },
  {
    id: "seo-aeo-weekly-topic-triage",
    cadence: "weekly",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: ["prioritize", "SEO/AEO content topics"],
  },
  {
    id: "seo-aeo-weekly-source-refresh",
    cadence: "weekly",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: ["source", "unsupported claims"],
  },
  {
    id: "seo-aeo-weekly-ai-citation-check",
    cadence: "weekly",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: ["AI citation", "Do not scrape"],
  },
  {
    id: "seo-aeo-weekly-performance-monitor",
    cadence: "weekly",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: ["SEO/content metrics", "Do not edit"],
  },
  {
    id: "seo-aeo-monthly-content-retro",
    cadence: "monthly",
    required: true,
    expectedStatus: "ACTIVE",
    promptMustInclude: ["past month", "content work"],
  },
];

function loadExpectedAutomations(root) {
  const manifestPath = path.join(root, "config", "codex-automations.json");
  if (!fs.existsSync(manifestPath)) {
    return { manifestPath, automations: FALLBACK_EXPECTED_AUTOMATIONS, manifestFound: false };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const globalPromptMustInclude = manifest.global_prompt_must_include || [];
  return {
    manifestPath,
    automations: (manifest.automations || []).map((automation) => ({
      id: automation.id,
      cadence: automation.cadence,
      required: automation.required !== false,
      expectedStatus: automation.status || "ACTIVE",
      expectedKind: automation.kind || "cron",
      expectedRrule: automation.rrule || "",
      expectedExecutionEnvironment: automation.execution_environment || "",
      promptMustInclude: [...globalPromptMustInclude, ...(automation.prompt_must_include || [])],
      commandContract: automation.command_contract || "",
    })),
    manifestFound: true,
  };
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

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function parseStringField(source, key) {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match ? match[1] : "";
}

function parseArrayField(source, key) {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]*)"/g)).map((item) => item[1]);
}

function commandSnippets(commandContract) {
  const text = String(commandContract || "");
  const snippets = [];
  for (const match of text.matchAll(/node\s+scripts\/seo-aeo\/[A-Za-z0-9-]+\.mjs/g)) {
    snippets.push(match[0]);
  }
  for (const match of text.matchAll(/--[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?/g)) {
    const snippet = match[0].replace(/\s+<[^>]+>/g, "");
    if (!/--date$/.test(snippet)) snippets.push(snippet);
  }
  return Array.from(new Set(snippets));
}

function readAutomation(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return {
    source,
    id: parseStringField(source, "id"),
    kind: parseStringField(source, "kind"),
    name: parseStringField(source, "name"),
    status: parseStringField(source, "status"),
    rrule: parseStringField(source, "rrule"),
    prompt: parseStringField(source, "prompt"),
    execution_environment: parseStringField(source, "execution_environment"),
    cwds: parseArrayField(source, "cwds"),
    path: filePath,
  };
}

function scanAutomations(homeDir) {
  const automationsDir = path.join(homeDir, "automations");
  if (!fs.existsSync(automationsDir)) return [];
  const entries = fs.readdirSync(automationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(automationsDir, entry.name, "automation.toml"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readAutomation(filePath));
}

function evaluateAutomation(root, expected, automation) {
  const checks = [];
  checks.push({
    check: "exists",
    ok: Boolean(automation),
    detail: automation ? relative(root, automation.path) : "not found",
  });
  if (!automation) {
    return {
      id: expected.id,
      cadence: expected.cadence,
      status: expected.required ? "missing" : "optional_missing",
      checks,
    };
  }

  checks.push({
    check: "kind_cron",
    ok: automation.kind === (expected.expectedKind || "cron"),
    detail: automation.kind || "missing",
  });
  checks.push({
    check: "status",
    ok: automation.status === expected.expectedStatus,
    detail: automation.status || "missing",
  });
  checks.push({
    check: "workspace",
    ok: automation.cwds.includes(root),
    detail: automation.cwds.join(", "),
  });
  checks.push({
    check: "schedule",
    ok: expected.expectedRrule ? automation.rrule === expected.expectedRrule : Boolean(automation.rrule),
    detail: automation.rrule || "missing",
  });
  if (expected.expectedExecutionEnvironment) {
    checks.push({
      check: "execution_environment",
      ok: automation.execution_environment === expected.expectedExecutionEnvironment,
      detail: automation.execution_environment || "missing",
    });
  }
  const normalizedPrompt = automation.prompt.toLowerCase();
  for (const phrase of expected.promptMustInclude || []) {
    const phrasePresent = normalizedPrompt.includes(String(phrase).toLowerCase());
    checks.push({
      check: `prompt_contains:${phrase}`,
      ok: phrasePresent,
      detail: phrasePresent ? "present" : "missing",
    });
  }
  for (const snippet of commandSnippets(expected.commandContract)) {
    const snippetPresent = normalizedPrompt.includes(snippet.toLowerCase());
    checks.push({
      check: `prompt_contains_command_contract:${snippet}`,
      ok: snippetPresent,
      detail: snippetPresent ? "present" : "missing",
    });
  }

  return {
    id: expected.id,
    cadence: expected.cadence,
    status: checks.every((check) => check.ok) ? "ready" : "needs_update",
    checks,
  };
}

function writeMarkdown(filePath, report) {
  const lines = [
    "# Codex Automation Audit",
    "",
    `Run date: ${report.run_date}`,
    `Status: ${report.status}`,
    "",
    "| Automation | Cadence | Status | Missing checks |",
    "|---|---|---|---|",
    ...report.automations.map((item) => {
      const missing = item.checks.filter((check) => !check.ok).map((check) => check.check).join("<br>") || "None";
      return `| ${item.id} | ${item.cadence} | ${item.status} | ${missing} |`;
    }),
    "",
    "## Rule",
    "",
    "This audit checks Codex app automation wiring only. It does not prove that external analytics sources have produced rows or that content is publish-ready.",
    "",
  ];
  fs.writeFileSync(filePath, lines.join("\n"));
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const outputDir = ensureDir(path.join(root, "automation-runs", runDate));
  const automations = scanAutomations(codexHome());
  const expected = loadExpectedAutomations(root);
  const byId = new Map(automations.map((automation) => [automation.id, automation]));
  const evaluated = expected.automations.map((automation) => evaluateAutomation(root, automation, byId.get(automation.id)));
  const missingRequired = evaluated.filter((item) => item.status === "missing").length;
  const needsUpdate = evaluated.filter((item) => item.status === "needs_update").length;
  const ready = evaluated.filter((item) => item.status === "ready").length;
  const status = missingRequired ? "missing_required_automations" : needsUpdate ? "needs_update" : "ready";
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    status,
    codex_home: codexHome(),
    expected_manifest_path: relative(root, expected.manifestPath),
    expected_manifest_found: expected.manifestFound,
    summary: {
      ready,
      needs_update: needsUpdate,
      missing_required: missingRequired,
      total_expected: evaluated.length,
    },
    automations: evaluated,
  };
  const jsonPath = path.join(outputDir, "codex-automation-audit.json");
  const markdownPath = path.join(outputDir, "codex-automation-audit.md");
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(markdownPath, report);

  const output = {
    ok: true,
    run_date: runDate,
    status,
    summary: report.summary,
    codex_automation_audit_json: relative(root, jsonPath),
    codex_automation_audit_md: relative(root, markdownPath),
  };
  console.log(JSON.stringify(output, null, 2));
  if (hasFlag("--fail-on-missing") && status !== "ready") process.exit(1);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
