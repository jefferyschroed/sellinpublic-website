import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "./packet.mjs";
import { collectPublishedPackets } from "./render-index.mjs";

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rfcDate(date) {
  return new Date(`${date}T09:00:00-07:00`).toUTCString();
}

export function renderSitemapXml(packets) {
  const urls = [
    { loc: "https://sellinpublic.co/", lastmod: "2026-06-17", changefreq: "monthly", priority: "1.0" },
    {
      loc: "https://sellinpublic.co/blog/",
      lastmod: packets[0]?.publishMeta.updated_date || "2026-06-17",
      changefreq: "weekly",
      priority: "0.8",
    },
    ...packets.map((packet) => ({
      loc: packet.publishMeta.canonical_url,
      lastmod: packet.publishMeta.updated_date || packet.publishMeta.publish_date,
      changefreq: "monthly",
      priority: "0.9",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(url.lastmod)}</lastmod>
    <changefreq>${escapeXml(url.changefreq)}</changefreq>
    <priority>${escapeXml(url.priority)}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

export function renderFeedXml(packets) {
  const items = packets
    .map(
      (packet) => `    <item>
      <title>${escapeXml(packet.articleBlocks?.title || packet.publishMeta.og_title)}</title>
      <link>${escapeXml(packet.publishMeta.canonical_url)}</link>
      <guid>${escapeXml(packet.publishMeta.canonical_url)}</guid>
      <pubDate>${escapeXml(rfcDate(packet.publishMeta.publish_date))}</pubDate>
      <description>${escapeXml(packet.publishMeta.excerpt)}</description>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sell In Public Blog</title>
    <link>https://sellinpublic.co/blog/</link>
    <description>Research-backed notes on employee-generated content, B2B social strategy, examples, and useful editorial checklists.</description>
    <language>en-us</language>
    <lastBuildDate>${escapeXml(rfcDate(packets[0]?.publishMeta.updated_date || "2026-06-17"))}</lastBuildDate>
    <atom:link href="https://sellinpublic.co/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

export function renderFeeds(root = process.cwd(), { dryRun = false } = {}) {
  const packets = collectPublishedPackets(root);
  const sitemap = renderSitemapXml(packets);
  const feed = renderFeedXml(packets);
  const outputs = [
    { path: path.join(root, "sitemap.xml"), body: sitemap },
    { path: path.join(root, "feed.xml"), body: feed },
  ].map((output) => ({
    ...output,
    changed: fs.existsSync(output.path) ? fs.readFileSync(output.path, "utf8") !== output.body : true,
  }));

  if (!dryRun) {
    for (const output of outputs) writeTextAtomic(output.path, output.body);
  }

  return outputs.map((output) => ({
    path: output.path,
    bytes: Buffer.byteLength(output.body),
    dryRun,
    postCount: packets.length,
    changed: output.changed,
  }));
}
