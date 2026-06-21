import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listPacketDirs, loadPacket, normalizePath } from "../../blog/packet.mjs";

export const PUBLIC_READER_REPORT_FILE = "public-reader-report.json";

export function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function stripHtml(value) {
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

export function articleHtmlFromRenderedPost(html) {
  const match = String(html || "").match(
    /<article\b[^>]*class=["'][^"']*\bblog-article\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i
  );
  return match ? match[1] : "";
}

export function renderedPostPathForSlug(root, slug) {
  return path.join(root, "blog", slug, "index.html");
}

export function slugFromPostPath(root, postPath) {
  const relativePath = normalizePath(path.relative(root, postPath));
  const match = relativePath.match(/^blog\/([^/]+)\/index\.html$/);
  return match?.[1] || "";
}

export function renderedHashes(root, postPath) {
  const html = fs.readFileSync(postPath, "utf8");
  const articleHtml = articleHtmlFromRenderedPost(html);
  return {
    html,
    articleHtml,
    articleText: stripHtml(articleHtml),
    renderedHtmlSha256: sha256Text(html),
    articleTextSha256: sha256Text(stripHtml(articleHtml)),
  };
}

export function findPacketForSlug(root, slug) {
  const matches = [];
  for (const packetDir of listPacketDirs(root)) {
    try {
      const packet = loadPacket(packetDir, root);
      if (packet.brief?.slug === slug || packet.publishMeta?.slug === slug) matches.push(packet);
    } catch {
      // Ignore unreadable packet directories here. Strict validation reports them elsewhere.
    }
  }
  return matches.sort((a, b) => b.packetName.localeCompare(a.packetName))[0] || null;
}

export function reportPathForPacket(packet) {
  return packet.file(PUBLIC_READER_REPORT_FILE);
}

export function validatePublicReaderReport({
  root,
  slug,
  postPath,
  reportPath,
  requireModel = true,
  requireGateEligible = true,
}) {
  const errors = [];
  const warnings = [];

  if (!reportPath || !fs.existsSync(reportPath)) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} is required before governed publish completion.`);
    return { ok: false, errors, warnings, report: null };
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must be valid JSON: ${error.message}`);
    return { ok: false, errors, warnings, report: null };
  }

  if (report.version !== 1) errors.push(`${PUBLIC_READER_REPORT_FILE} version must be 1.`);
  if (report.slug !== slug) errors.push(`${PUBLIC_READER_REPORT_FILE} slug must match ${slug}.`);
  if (!report.generated_at) errors.push(`${PUBLIC_READER_REPORT_FILE} must include generated_at.`);

  if (requireModel && report.mode !== "model") {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must be model-based for publish. Offline scans are not publish gates.`);
  }

  if (report.pass !== true) errors.push(`${PUBLIC_READER_REPORT_FILE} must record pass: true.`);
  if (requireGateEligible && report.gate_eligible !== true) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must record gate_eligible: true.`);
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (findings.length) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must have zero findings for publish; found ${findings.length}.`);
  }

  const context = report.context_policy || {};
  if (context.packet_visible_to_model !== false) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must confirm packet_visible_to_model: false.`);
  }
  const visibleSources = Array.isArray(context.sources_visible_to_model) ? context.sources_visible_to_model : [];
  if (!visibleSources.includes("rendered_public_html_article_text")) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} must confirm the model saw rendered public HTML article text.`);
  }
  if (visibleSources.some((source) => /packet|draft|outline|qa|claim|citation/i.test(String(source)))) {
    errors.push(`${PUBLIC_READER_REPORT_FILE} clean-context policy must not expose packet, draft, outline, QA, claim, or citation artifacts to the model.`);
  }

  if (!postPath || !fs.existsSync(postPath)) {
    errors.push(`Rendered blog post is required for public reader validation: ${postPath || "missing path"}.`);
  } else {
    const relativePostPath = normalizePath(path.relative(root, postPath));
    if (report.rendered_html_path !== relativePostPath) {
      errors.push(`${PUBLIC_READER_REPORT_FILE} rendered_html_path must be ${relativePostPath}.`);
    }
    const hashes = renderedHashes(root, postPath);
    if (report.rendered_html_sha256 !== hashes.renderedHtmlSha256) {
      errors.push(`${PUBLIC_READER_REPORT_FILE} rendered_html_sha256 does not match the current rendered HTML.`);
    }
    if (report.article_text_sha256 !== hashes.articleTextSha256) {
      errors.push(`${PUBLIC_READER_REPORT_FILE} article_text_sha256 does not match the current rendered article text.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, report };
}
