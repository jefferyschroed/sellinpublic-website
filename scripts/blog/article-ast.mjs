function nonEmptyText(value) {
  return String(value ?? "").trim();
}

export function sanitizeFaqItems(items) {
  if (!Array.isArray(items)) return [];
  const seenQuestions = new Set();
  return items
    .map((item) => ({
      ...item,
      question: nonEmptyText(item?.question),
      answer: nonEmptyText(item?.answer),
    }))
    .filter((item) => {
      if (!item.question || !item.answer) return false;
      const key = item.question.toLowerCase();
      if (seenQuestions.has(key)) return false;
      seenQuestions.add(key);
      return true;
    });
}

function sanitizeBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type !== "faq") return block;
      const items = sanitizeFaqItems(block.items);
      return items.length ? { ...block, items } : null;
    })
    .filter(Boolean);
}

export function buildArticleAst(packet) {
  const blocks = packet.articleBlocks;
  if (!blocks) throw new Error("Missing article.blocks.json.");
  const articleBlocks = sanitizeBlocks(blocks.blocks || []);
  const faqBlock = articleBlocks.find((block) => block.type === "faq");
  const sourcesBlock = articleBlocks.find((block) => block.type === "sources");

  return {
    slug: packet.brief.slug,
    title: blocks.title || packet.brief.working_title,
    kicker: blocks.kicker || packet.publishMeta.category || "",
    dek: blocks.dek || packet.publishMeta.excerpt || "",
    publishDateLabel: blocks.publishDateLabel || packet.publishMeta.publish_date,
    updatedDateLabel: blocks.updatedDateLabel || `Updated ${packet.publishMeta.updated_date}`,
    readTime: blocks.readTime || packet.publishMeta.estimated_read_time || "",
    hero: blocks.hero,
    blocks: articleBlocks,
    faqItems: faqBlock?.items || [],
    sources: sourcesBlock?.items || [],
  };
}

export function collectHeadings(ast) {
  return ast.blocks
    .filter((block) => block.type === "heading" && block.level === 2)
    .map((block) => ({ id: block.id, text: block.text }));
}
