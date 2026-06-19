export function buildArticleAst(packet) {
  const blocks = packet.articleBlocks;
  if (!blocks) throw new Error("Missing article.blocks.json.");

  return {
    slug: packet.brief.slug,
    title: blocks.title || packet.brief.working_title,
    kicker: blocks.kicker || packet.publishMeta.category || "",
    dek: blocks.dek || packet.publishMeta.excerpt || "",
    publishDateLabel: blocks.publishDateLabel || packet.publishMeta.publish_date,
    updatedDateLabel: blocks.updatedDateLabel || `Updated ${packet.publishMeta.updated_date}`,
    readTime: blocks.readTime || packet.publishMeta.estimated_read_time || "",
    hero: blocks.hero,
    blocks: blocks.blocks,
    faqItems: blocks.blocks.find((block) => block.type === "faq")?.items || [],
    sources: blocks.blocks.find((block) => block.type === "sources")?.items || [],
  };
}

export function collectHeadings(ast) {
  return ast.blocks
    .filter((block) => block.type === "heading" && block.level === 2)
    .map((block) => ({ id: block.id, text: block.text }));
}
