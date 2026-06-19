#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, envOrConfig, loadConfig, writeJsonAtomic } from "./lib/config.mjs";
import { readCsv, writeCsvAtomic } from "./lib/csv.mjs";
import { today } from "./lib/dates.mjs";

const WORKLIST_HEADERS = [
  "date",
  "candidate_id",
  "topic_id",
  "pillar_id",
  "topic",
  "intent",
  "aeo_question",
  "gate_reasons",
  "source_readiness",
  "priority",
  "import_rank",
  "primary_recommended_import",
  "priority_reason",
  "recommended_import_type",
  "template_path",
  "destination_path",
  "query_or_topic_to_validate",
  "required_review_fields",
  "owner",
  "status",
  "notes",
];

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function relative(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hasQueryDemandGap(candidate) {
  const text = [candidate.gate_reasons, candidate.next_action, candidate.required_before_packet, candidate.query_run_status]
    .join(" ")
    .toLowerCase();
  return /query_handoff|validated demand|handoff_(draft|starter)|daily_discovery_draft/.test(text);
}

function isActionableCandidate(candidate) {
  const status = String(candidate.packet_intake_status || "").trim();
  if (status === "intake_ready") return false;
  if (!hasQueryDemandGap(candidate)) return false;
  return ["blocked_before_packet", "gap_resolution_required"].includes(status);
}

function priorityFor(candidate) {
  const score = Number(candidate.topic_score_guess || 0);
  if (score >= 85) return "P0";
  if (score >= 80) return "P1";
  if (score >= 65) return "P2";
  return "P3";
}

function queryFor(candidate) {
  return candidate.aeo_question || candidate.canonical_topic || candidate.topic;
}

function normalizedSourceText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isGscSource(value) {
  const text = normalizedSourceText(value);
  return text === "gsc" || /\bgsc\b|\bgoogle search console\b|\bsearch console\b/.test(text);
}

function isBingSource(value) {
  const text = normalizedSourceText(value);
  return text === "bing webmaster tools" || (/\bbing\b/.test(text) && /\b(webmaster|search performance|query stats)\b/.test(text));
}

function hasSearchQuerySignal(row) {
  return Boolean(
    String(row.query || "").trim() &&
      [row.clicks, row.impressions, row.avg_position].some((value) => String(value ?? "").trim())
  );
}

function sourceAvailability(root) {
  const config = loadConfig(root);
  const hasBingSetup = Boolean(
    envOrConfig("BING_WEBMASTER_SITE_URL", config.bing?.webmasterSiteUrl) &&
      envOrConfig("BING_WEBMASTER_API_KEY", config.bing?.webmasterApiKey)
  );
  const hasGscSetup = Boolean(
    envOrConfig("GSC_SITE_URL", config.site?.searchConsoleSiteUrl) &&
      (envOrConfig("GOOGLE_OAUTH_CREDENTIALS", config.google?.oauthCredentialJsonPath) ||
        envOrConfig("GOOGLE_APPLICATION_CREDENTIALS", config.google?.serviceAccountJsonPath))
  );
  const { rows: queryRows } = readCsv(path.join(root, "analytics", "search_query_daily.csv"));
  const bingRows = queryRows.filter((row) => isBingSource(row.source) && hasSearchQuerySignal(row));
  const gscRows = queryRows.filter((row) => isGscSource(row.source) && hasSearchQuerySignal(row));
  const hasBingRows = bingRows.length > 0;
  const hasGscRows = gscRows.length > 0;
  return {
    bing_webmaster_available: hasBingSetup || hasBingRows,
    bing_webmaster_api_configured: hasBingSetup,
    bing_webmaster_rows_present: hasBingRows,
    bing_webmaster_row_count: bingRows.length,
    gsc_search_console_available: hasGscRows,
    gsc_search_console_configured: hasGscSetup,
    gsc_search_console_rows_present: hasGscRows,
    gsc_search_console_row_count: gscRows.length,
    reviewed_generic_query_tool_available: true,
    manual_google_trends_csv_available: true,
  };
}

function isRefreshOrPublishedCandidate(candidate) {
  const text = [
    candidate.coverage_status,
    candidate.strategic_asset_decision,
    candidate.asset_decision,
    candidate.recommended_asset,
    candidate.next_action,
  ]
    .join(" ")
    .toLowerCase();
  return /published|refresh/.test(text);
}

function isTrendCandidate(candidate) {
  const text = [candidate.candidate_id, candidate.source_signal, candidate.topic, candidate.intent].join(" ").toLowerCase();
  return /^trend-/.test(String(candidate.candidate_id || "")) || /trend|rss|feed|news/.test(text);
}

function isLongTailAeoCandidate(candidate) {
  const intent = String(candidate.intent || "").toLowerCase();
  const question = String(candidate.aeo_question || "").trim();
  return Boolean(question) || /definition|comparison|how_to|examples|faq|question|playbook|template|checklist/.test(intent);
}

function importDefinitions(runDate, slug) {
  return {
    google_trends_csv_export: {
      template_path: "docs/seo-aeo/templates/imports/google-trends-export.csv",
      destination_path: `imports/trends/${runDate}-google-trends-${slug}.csv`,
      required_review_fields: "date,query,term,topic,country,language,trend_delta,trend_window,geo,category,property,notes",
      notes: "Manual Google Trends CSV/API export can validate relative demand. RSS/feed captures do not qualify.",
    },
    bing_webmaster_query_export: {
      template_path: "docs/seo-aeo/templates/imports/bing-webmaster-query-export.csv",
      destination_path: `imports/query-exports/${runDate}-bing-webmaster-${slug}.csv`,
      required_review_fields: "source,Date,Search Keywords,Page URL,Device,Country,Clicks,Impressions,CTR,Average Position",
      notes: "Use Bing Webmaster query exports only when rows come from the verified Sell In Public property.",
    },
    gsc_search_query_export: {
      template_path: "docs/seo-aeo/templates/imports/search-query-export.csv",
      destination_path: `imports/query-exports/${runDate}-gsc-search-query-${slug}.csv`,
      required_review_fields:
        "date,source,source_export_id,source_file,property_id,timezone,captured_by,reviewed_by,query,page_url,device,country,clicks,impressions,ctr,avg_position",
      notes:
        "Use Search Console query exports only from the verified Sell In Public property. These rows validate refresh-prioritization demand but do not supply factual article evidence.",
    },
    reviewed_generic_query_tool_export: {
      template_path: "docs/seo-aeo/templates/imports/generic-query-tool-export.csv",
      destination_path: `imports/query-exports/${runDate}-reviewed-query-tool-${slug}.csv`,
      required_review_fields: "source,query,validated_demand,validation_source,reviewed_by",
      notes: "Generic tools count only when validated_demand is yes/validated and validation_source plus reviewed_by are populated.",
    },
  };
}

function bingFallbackReason() {
  return "Fallback because optional Bing Webmaster data is not configured or present locally; use only if a reviewed verified-property manual export is available.";
}

function gscFallbackReason(availability) {
  if (availability.gsc_search_console_configured) {
    return "Fallback because Search Console API access is configured but no local GSC query rows are present yet; use only when a verified-property export has real query metrics.";
  }
  return "Fallback because no local Search Console query rows are present; use only when a reviewed verified-property GSC export is available.";
}

function rankedImportTypes(candidate, availability) {
  if (isRefreshOrPublishedCandidate(candidate)) {
    if (availability.gsc_search_console_rows_present) {
      return [
        {
          type: "gsc_search_query_export",
          reason: "Rank 1 because first-party Google Search Console query rows are the strongest search-demand signal for existing or refresh candidates.",
        },
        {
          type: availability.bing_webmaster_available ? "bing_webmaster_query_export" : "reviewed_generic_query_tool_export",
          reason: availability.bing_webmaster_available
            ? "Rank 2 because verified-property Bing rows can corroborate first-party query demand after GSC."
            : "Rank 2 because reviewed query-tool data can validate precise demand when another first-party export is missing.",
        },
        {
          type: availability.bing_webmaster_available ? "reviewed_generic_query_tool_export" : "google_trends_csv_export",
          reason: availability.bing_webmaster_available
            ? "Rank 3 because reviewed query-tool data can validate precise long-tail demand after first-party rows."
            : "Rank 3 because Google Trends can compare broader topic momentum after exact-query validation is attempted.",
        },
        {
          type: availability.bing_webmaster_available ? "google_trends_csv_export" : "bing_webmaster_query_export",
          reason: availability.bing_webmaster_available
            ? "Rank 4 because broader trend data is useful context after first-party and exact-query validation."
            : bingFallbackReason(),
        },
      ];
    }

    if (!availability.bing_webmaster_available) {
      return [
        {
          type: "reviewed_generic_query_tool_export",
          reason: "Rank 1 because first-party Bing data is not configured or present, so exact reviewed query validation is the most practical demand signal for this existing or refresh candidate.",
        },
        {
          type: "google_trends_csv_export",
          reason: "Rank 2 because Google Trends can compare broader topic momentum after exact-query validation is attempted.",
        },
        {
          type: "bing_webmaster_query_export",
          reason: bingFallbackReason(),
        },
        {
          type: "gsc_search_query_export",
          reason: gscFallbackReason(availability),
        },
      ];
    }

    return [
      {
        type: "bing_webmaster_query_export",
        reason: "Rank 1 because first-party verified-property search data is the strongest demand signal for existing or refresh candidates. If the export has no rows, move to rank 2.",
      },
      {
        type: "reviewed_generic_query_tool_export",
        reason: "Rank 2 because reviewed query-tool data can validate precise demand when first-party rows are missing or too sparse.",
      },
      {
        type: "google_trends_csv_export",
        reason: "Rank 3 because broader trend data is useful context after first-party and exact-query validation.",
      },
      {
        type: "gsc_search_query_export",
        reason: gscFallbackReason(availability),
      },
    ];
  }

  if (isTrendCandidate(candidate)) {
    return [
      {
        type: "google_trends_csv_export",
        reason: "Rank 1 because trend-born candidates should first validate broad public momentum with Google Trends data.",
      },
      {
        type: "reviewed_generic_query_tool_export",
        reason: "Rank 2 because reviewed query-tool data can translate broad momentum into exact query language.",
      },
      {
        type: "bing_webmaster_query_export",
        reason: availability.bing_webmaster_available
          ? "Rank 3 because verified-property Bing rows are supplemental for new topic discovery unless there is existing page demand."
          : bingFallbackReason(),
      },
    ];
  }

  if (isLongTailAeoCandidate(candidate)) {
    return [
      {
        type: "reviewed_generic_query_tool_export",
        reason: "Rank 1 because long-tail AEO questions need exact-query validation before broader trend comparison.",
      },
      {
        type: "google_trends_csv_export",
        reason: "Rank 2 because Google Trends can compare relative topic momentum after the exact question language is validated.",
      },
      {
        type: "bing_webmaster_query_export",
        reason: availability.bing_webmaster_available
          ? "Rank 3 because verified-property Bing rows are useful only if the site already has query impressions for this topic."
          : bingFallbackReason(),
      },
    ];
  }

  return [
    {
      type: "google_trends_csv_export",
      reason: "Rank 1 because broader topic demand should be validated before opening a packet.",
    },
    {
      type: "reviewed_generic_query_tool_export",
      reason: "Rank 2 because reviewed query-tool data can supply exact long-tail language after broad demand is checked.",
    },
    {
      type: "bing_webmaster_query_export",
      reason: availability.bing_webmaster_available
        ? "Rank 3 because verified-property Bing rows are a supplemental first-party signal for topics without known page demand."
        : bingFallbackReason(),
    },
  ];
}

function worklistRows(root, runDate, candidates) {
  const rows = [];
  const availability = sourceAvailability(root);
  const actionable = candidates.filter(isActionableCandidate).sort((a, b) => Number(b.topic_score_guess || 0) - Number(a.topic_score_guess || 0));

  for (const candidate of actionable) {
    const slug = slugify(candidate.topic_id || candidate.candidate_id || candidate.topic);
    const query = queryFor(candidate);
    const base = {
      date: runDate,
      candidate_id: candidate.candidate_id,
      topic_id: candidate.topic_id,
      pillar_id: candidate.pillar_id,
      topic: candidate.topic,
      intent: candidate.intent,
      aeo_question: candidate.aeo_question,
      gate_reasons: candidate.gate_reasons,
      source_readiness: candidate.source_readiness,
      priority: priorityFor(candidate),
      query_or_topic_to_validate: query,
      owner: "Query Intelligence Agent",
      status: "requested",
    };
    const definitions = importDefinitions(runDate, slug);
    const rankedTypes = rankedImportTypes(candidate, availability);

    rankedTypes.forEach((ranked, index) => {
      const definition = definitions[ranked.type];
      rows.push({
        ...base,
        import_rank: index + 1,
        primary_recommended_import: index === 0 ? "yes" : "no",
        priority_reason: ranked.reason,
        recommended_import_type: ranked.type,
        ...definition,
      });
    });
  }

  return rows;
}

function writeMarkdown(filePath, report) {
  const rows = report.rows;
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.candidate_id)) grouped.set(row.candidate_id, []);
    grouped.get(row.candidate_id).push(row);
  }

  const body = Array.from(grouped.entries())
    .map(([candidateId, items]) => {
      const first = items[0];
      const lines = items
        .sort((a, b) => Number(a.import_rank || 0) - Number(b.import_rank || 0))
        .map(
          (item) =>
            `- Rank ${item.import_rank} (${item.primary_recommended_import === "yes" ? "primary" : "fallback"}): ${item.recommended_import_type}: validate \`${item.query_or_topic_to_validate}\` using \`${item.template_path}\`; place reviewed export at \`${item.destination_path}\`. ${item.priority_reason}`
        )
        .join("\n");
      return `## ${candidateId}: ${first.topic}

- Priority: ${first.priority}
- Topic ID: ${first.topic_id || "unmapped"}
- Gate reasons: ${first.gate_reasons || "none recorded"}
- Source readiness: ${first.source_readiness || "unknown"}

${lines}
`;
    })
    .join("\n");

  const markdown = `# Demand Import Worklist

Run date: ${report.run_date}
Generated at: ${report.generated_at}
Candidate count: ${report.candidate_count}
Request count: ${rows.length}
Bing Webmaster available: ${report.source_availability?.bing_webmaster_available ? "yes" : "no"}
Search Console rows present: ${report.source_availability?.gsc_search_console_rows_present ? "yes" : "no"}
Search Console configured: ${report.source_availability?.gsc_search_console_configured ? "yes" : "no"}

## Rule

This worklist does not create evidence, claims, packets, drafts, or posts. It tells the Query Intelligence Agent which validated-demand imports would be needed before packet intake can become ready.

${body || "No demand-import requests were generated."}
`;

  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, filePath);
}

function run() {
  const root = process.cwd();
  const runDate = arg("--date", today());
  const planPath = path.join(root, "research", "daily-content-plan", runDate, "topic-candidates.csv");
  const outputDir = ensureDir(path.join(root, "research", "daily-content-plan", runDate));
  const { rows: candidates } = readCsv(planPath);
  const rows = worklistRows(root, runDate, candidates);
  const candidateCount = new Set(rows.map((row) => row.candidate_id)).size;
  const csvPath = path.join(outputDir, "demand-import-worklist.csv");
  const jsonPath = path.join(outputDir, "demand-import-worklist.json");
  const mdPath = path.join(outputDir, "demand-import-worklist.md");
  const report = {
    schema_version: "1.0",
    run_date: runDate,
    generated_at: new Date().toISOString(),
    source_plan_path: fs.existsSync(planPath) ? relative(root, planPath) : "",
    source_availability: sourceAvailability(root),
    candidate_count: candidateCount,
    request_count: rows.length,
    rows,
  };

  writeCsvAtomic(csvPath, WORKLIST_HEADERS, rows);
  writeJsonAtomic(jsonPath, report);
  writeMarkdown(mdPath, report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        run_date: runDate,
        candidate_count: candidateCount,
        request_count: rows.length,
        csv_path: relative(root, csvPath),
        json_path: relative(root, jsonPath),
        markdown_path: relative(root, mdPath),
      },
      null,
      2
    )
  );
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
