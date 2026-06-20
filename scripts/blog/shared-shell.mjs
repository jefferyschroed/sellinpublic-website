export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderBlogRail({ recentHref = "/blog/", recentTitle = "Blog home" } = {}) {
  return `<aside class="blog-rail" aria-label="Blog navigation">
          <div class="blog-rail__section">
            <span class="blog-rail__eyebrow">All posts</span>
            <a href="/blog/">Blog home</a>
          </div>
          <div class="blog-rail__section">
            <span class="blog-rail__eyebrow">Recent</span>
            <a href="${escapeHtml(recentHref)}">${escapeHtml(recentTitle)}</a>
          </div>
          <div class="blog-rail__section">
            <span class="blog-rail__eyebrow">Topics</span>
            <a href="/blog/">Employee-generated content</a>
            <a href="/blog/">B2B social strategy</a>
            <a href="/blog/">LinkedIn content</a>
          </div>
        </aside>`;
}
