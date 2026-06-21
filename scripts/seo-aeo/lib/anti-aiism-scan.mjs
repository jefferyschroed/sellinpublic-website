import fs from "node:fs";
import path from "node:path";

const REGRESSION_REGISTRY = "docs/seo-aeo/public-reader-regressions.json";

const EXACT_BANNED_PHRASES = [
  ["landscape_fast_paced", "in today's fast-paced world", "banned_ai_phrase"],
  ["landscape_competitive", "in today's competitive landscape", "banned_ai_phrase"],
  ["landscape_ever_evolving", "in an ever-evolving industry", "banned_ai_phrase"],
  ["now_more_than_ever", "now more than ever", "banned_ai_phrase"],
  ["sales_landscape_changed", "the sales landscape has changed", "banned_ai_phrase"],
  ["buyers_buy_changed", "the way buyers buy has changed", "banned_ai_phrase"],
  ["no_secret", "it's no secret that", "banned_ai_phrase"],
  ["we_all_know", "we all know that", "banned_ai_phrase"],
  ["truth_is", "the truth is", "banned_ai_phrase"],
  ["lets_be_honest", "let's be honest", "banned_ai_phrase"],
  ["heres_the_thing", "here's the thing", "banned_ai_phrase"],
  ["reality_is", "the reality is", "banned_ai_phrase"],
  ["fact_of_matter", "the fact of the matter is", "banned_ai_phrase"],
  ["in_this_article", "In this article", "banned_ai_phrase"],
  ["by_end_post", "By the end of this post", "banned_ai_phrase"],
  ["without_further_ado", "Without further ado", "banned_ai_phrase"],
  ["with_that_said", "With that said", "banned_ai_phrase"],
  ["that_being_said", "That being said", "banned_ai_phrase"],
  ["having_said_that", "Having said that", "banned_ai_phrase"],
  ["at_end_day", "At the end of the day", "banned_ai_phrase"],
  ["when_all_said_done", "When all is said and done", "banned_ai_phrase"],
  ["drive_results", "drive results", "banned_ai_phrase"],
  ["move_needle", "move the needle", "banned_ai_phrase"],
  ["add_value", "add value", "banned_ai_phrase"],
  ["make_impact", "make an impact", "banned_ai_phrase"],
  ["achieve_success", "achieve success", "banned_ai_phrase"],
  ["reach_goals", "reach your goals", "banned_ai_phrase"],
  ["meaningful_connections", "build meaningful connections", "banned_ai_phrase"],
  ["stand_out_noise", "stand out from the noise", "banned_ai_phrase"],
  ["cut_through_clutter", "cut through the clutter", "banned_ai_phrase"],
  ["and_honestly", "and honestly?", "banned_ai_phrase"],
  ["heres_why_matters", "here's why that matters", "banned_ai_phrase"],
  ["heres_catch", "but here's the catch", "banned_ai_phrase"],
  ["what_does_mean", "so, what does this mean for you?", "banned_ai_phrase"],
  ["exactly_why", "and that's exactly why", "banned_ai_phrase"],
  ["this_isnt_just_about", "this isn't just about", "binary_correction_cadence"],
  ["quality_test", "quality test", "rubric_leak"],
  ["quality_bar", "quality bar", "rubric_leak"],
  ["selection_criteria", "selection criteria", "rubric_leak"],
  ["what_makes_example_count", "What Makes An Example Count", "rubric_leak"],
  ["people_first_content", "people-first content", "rubric_leak"],
  ["helpful_content_guidance", "helpful content guidance", "rubric_leak"],
  ["could_written_competitor", "could have been written by any competitor", "rubric_leak"],
  ["claim_ledger", "claim ledger", "internal_process_leak"],
  ["qa_report", "QA report", "internal_process_leak"],
  ["source_policy", "source policy", "internal_process_leak"],
];

const RULE_SCOPES = new Map([
  ["quality_test", "examples_only"],
  ["quality_bar", "examples_only"],
  ["selection_criteria", "examples_only"],
  ["what_makes_example_count", "examples_only"],
  ["people_first_content", "examples_only"],
  ["helpful_content_guidance", "examples_only"],
  ["could_written_competitor", "examples_only"],
]);

const REGEX_RULES = [
  {
    id: "the_result_question_fragment",
    label: "the result? fragment",
    category: "banned_ai_phrase",
    pattern: /\bthe result\?\s+[^.!?]{2,120}[.!?]/gi,
  },
  {
    id: "the_problem_question_fragment",
    label: "the problem? fragment",
    category: "banned_ai_phrase",
    pattern: /\bthe problem\?\s+[^.!?]{2,120}[.!?]/gi,
  },
  {
    id: "not_only_but",
    label: "not only X, but Y",
    category: "binary_correction_cadence",
    pattern: /\bnot only\b[^.!?]{2,120},\s*but\b[^.!?]{2,120}[.!?]/gi,
  },
  {
    id: "its_about_triplet",
    label: "it's about X. it's about Y. it's about Z.",
    category: "binary_correction_cadence",
    pattern: /\bit(?:'s| is) about [^.!?]{2,80}\.\s*it(?:'s| is) about [^.!?]{2,80}\.\s*it(?:'s| is) about [^.!?]{2,80}[.!?]/gi,
  },
  {
    id: "not_just_its",
    label: "it's not just X, it's Y",
    category: "binary_correction_cadence",
    pattern: /\bit(?:'s| is) not just\b[^.!?]{2,120},\s*it(?:'s| is)\b[^.!?]{2,120}[.!?]/gi,
  },
  {
    id: "draft_instruction_should",
    label: "public writer instruction",
    category: "instruction_leak",
    pattern: /\b(this section|the draft|the article) should\b[^.!?]{0,120}[.!?]?/gi,
  },
  {
    id: "writer_instruction_imperative",
    label: "writer instruction leak",
    category: "instruction_leak",
    pattern: /\b(rewrite|write|include|add) (this|the) (paragraph|section|article|post)\b[^.!?]{0,120}[.!?]?/gi,
  },
  {
    id: "example_worth_studying",
    label: "example worth studying rubric",
    category: "rubric_leak",
    pattern: /\bwhat makes [^.!?]{0,80}example worth studying\b/gi,
  },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForScan(value) {
  return String(value || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function phrasePattern(phrase) {
  const source = escapeRegExp(normalizeForScan(phrase))
    .replace(/\s+/g, "\\s+")
    .replace(/'/g, "['’]");
  return new RegExp(`(^|[^A-Za-z0-9])${source}(?=$|[^A-Za-z0-9])`, "gi");
}

function baseRules() {
  return [
    ...EXACT_BANNED_PHRASES.map(([id, phrase, category]) => ({
      id,
      label: phrase,
      category,
      scope: RULE_SCOPES.get(id),
      pattern: phrasePattern(phrase),
    })),
    ...REGEX_RULES,
  ];
}

function loadRecordedRegressionRules(root) {
  if (!root) return [];
  const registryPath = path.join(root, REGRESSION_REGISTRY);
  if (!fs.existsSync(registryPath)) return [];

  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const patterns = Array.isArray(registry.patterns) ? registry.patterns : [];
    return patterns
      .map((item, index) => {
        const phrase = normalizeForScan(item.pattern || item.quote || item.label || "");
        if (phrase.length < 8) return null;
        return {
          id: `recorded_regression_${index + 1}`,
          label: item.label || phrase.slice(0, 80),
          category: item.category || "recorded_regression",
          scope: item.scope,
          pattern: phrasePattern(phrase),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function rulesForRoot(root, { includeRecordedRegressions = true } = {}) {
  return includeRecordedRegressions ? [...baseRules(), ...loadRecordedRegressionRules(root)] : baseRules();
}

function cleanQuote(value) {
  return normalizeForScan(value).replace(/^[^A-Za-z0-9]+/, "").trim().slice(0, 500);
}

export function stripPublicHtml(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPublicTextBlocks(articleHtml) {
  const blocks = [];
  const pattern = /<(h1|h2|h3|p|li|summary|figcaption|th|td|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(String(articleHtml || "")))) {
    const [, tag, attrs, body] = match;
    if (tag.toLowerCase() === "span" && !/\bblog-block-label\b/.test(attrs)) continue;
    const text = stripPublicHtml(body);
    if (!text) continue;
    blocks.push({
      locator: `block-${String(blocks.length + 1).padStart(3, "0")}`,
      tag: tag.toLowerCase(),
      text,
    });
  }
  return blocks;
}

export function scanAntiAiismsInText(text, options = {}) {
  const normalized = normalizeForScan(text);
  if (!normalized) return [];

  const locator = options.locator || "text";
  const source = options.source || "deterministic_anti_aiism_scan";
  const findings = [];
  const seen = new Set();

  for (const rule of rulesForRoot(options.root, options)) {
    if (rule.scope === "examples_only" && !options.examplesPost) continue;

    rule.pattern.lastIndex = 0;
    for (const match of normalized.matchAll(rule.pattern)) {
      const quote = cleanQuote(match[0]);
      if (!quote) continue;
      const key = `${locator}:${rule.id}:${quote.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        severity: "blocker",
        category: rule.category,
        locator,
        quote,
        why: `Public text matched the blocked anti-AIism rule: ${rule.label}.`,
        rewrite: "",
        source,
        rule_id: rule.id,
      });
    }
  }

  return findings;
}

export function scanAntiAiismsInBlocks(blocks, options = {}) {
  return blocks.flatMap((block) =>
    scanAntiAiismsInText(block.text, {
      ...options,
      locator: block.locator || options.locator || "text",
    })
  );
}
