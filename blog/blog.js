const parseDurationMs = (value, fallback) => {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed) || fallback;
  if (trimmed.endsWith("s")) return (Number.parseFloat(trimmed) || 0) * 1000 || fallback;
  return Number.parseFloat(trimmed) || fallback;
};

const createToc = () => {
  const article = document.querySelector("[data-blog-article]");
  const tocTargets = document.querySelectorAll("[data-toc-list]");
  if (!article || tocTargets.length === 0) return;

  const headings = Array.from(article.querySelectorAll("h2[id]"));
  if (headings.length === 0) return;

  tocTargets.forEach((toc) => {
    toc.innerHTML = "";

    headings.forEach((heading) => {
      const link = document.createElement("a");
      link.href = `#${heading.id}`;
      const label = document.createElement("span");
      label.className = "blog-toc__label";
      label.textContent = heading.textContent;
      link.append(label);
      link.dataset.level = heading.tagName === "H3" ? "3" : "2";
      link.addEventListener("click", () => {
        document.querySelector(".blog-mobile-toc")?.removeAttribute("open");
      });
      toc.append(link);
    });

    if (toc.closest(".blog-toc")) {
      const indicator = document.createElement("span");
      indicator.className = "blog-toc__indicator";
      indicator.dataset.tocIndicator = "";
      indicator.setAttribute("aria-hidden", "true");
      toc.append(indicator);
    }
  });

  const tocLinks = Array.from(document.querySelectorAll("[data-toc-list] a"));

  const updateTocIndicators = (id) => {
    document.querySelectorAll(".blog-toc [data-toc-list]").forEach((toc) => {
      const indicator = toc.querySelector("[data-toc-indicator]");
      const activeLink = Array.from(toc.querySelectorAll("a")).find((link) => link.hash === `#${id}`);
      if (!indicator || !activeLink) return;

      indicator.style.setProperty("--toc-indicator-y", `${Math.max(0, activeLink.offsetTop + 2)}px`);
      indicator.style.setProperty("--toc-indicator-height", `${Math.max(18, activeLink.offsetHeight - 4)}px`);
      indicator.style.setProperty("--toc-indicator-opacity", "1");
    });
  };

  const setActiveHeading = (id) => {
    tocLinks.forEach((link) => {
      link.classList.toggle("is-active", link.hash === `#${id}`);
    });

    updateTocIndicators(id);
  };

  setActiveHeading(headings[0].id);

  let activeTicking = false;
  const updateActiveFromScroll = () => {
    const offset = Math.min(420, window.innerHeight * 0.55);
    const activeHeading = headings.reduce((current, heading) => {
      return heading.getBoundingClientRect().top <= offset ? heading : current;
    }, headings[0]);

    setActiveHeading(activeHeading.id);
    activeTicking = false;
  };

  const requestActiveUpdate = () => {
    if (activeTicking) return;
    activeTicking = true;
    window.requestAnimationFrame(updateActiveFromScroll);
  };

  window.addEventListener("scroll", requestActiveUpdate, { passive: true });
  window.addEventListener("hashchange", () => window.setTimeout(updateActiveFromScroll, 80));
  window.setTimeout(updateActiveFromScroll, 0);

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

      if (visibleEntry) setActiveHeading(visibleEntry.target.id);
    },
    {
      rootMargin: "-18% 0px -68% 0px",
      threshold: 0.01,
    }
  );

  headings.forEach((heading) => observer.observe(heading));
};

const setupFaqAnimations = () => {
  const detailsItems = Array.from(document.querySelectorAll(".blog-faq details"));
  if (detailsItems.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resizeDuration = parseDurationMs(
    getComputedStyle(document.documentElement).getPropertyValue("--resize-dur"),
    300
  );

  const setPanelHeight = (details, panel) => {
    details.style.setProperty("--faq-panel-height", `${panel.scrollHeight}px`);
  };

  detailsItems.forEach((details) => {
    const summary = details.querySelector("summary");
    const panel = Array.from(details.children).find((child) => child !== summary);
    if (!summary || !panel) return;

    details.dataset.faqAnimated = "true";
    details.classList.add("t-resize");
    if (details.open) setPanelHeight(details, panel);

    summary.addEventListener("click", (event) => {
      event.preventDefault();

      if (reduceMotion.matches) {
        details.open = !details.open;
        if (details.open) setPanelHeight(details, panel);
        return;
      }

      window.clearTimeout(details.faqCloseTimer);

      if (details.classList.contains("is-closing")) {
        details.classList.remove("is-closing");
        setPanelHeight(details, panel);
        return;
      }

      if (details.open) {
        setPanelHeight(details, panel);
        void panel.offsetHeight;
        details.classList.add("is-closing");
        details.style.setProperty("--faq-panel-height", "0px");
        details.faqCloseTimer = window.setTimeout(() => {
          details.open = false;
          details.classList.remove("is-closing");
          details.style.removeProperty("--faq-panel-height");
        }, resizeDuration);
        return;
      }

      details.open = true;
      details.style.setProperty("--faq-panel-height", "0px");
      void panel.offsetHeight;
      setPanelHeight(details, panel);
    });
  });

  window.addEventListener("resize", () => {
    detailsItems.forEach((details) => {
      if (!details.open) return;
      const panel = Array.from(details.children).find((child) => child.tagName !== "SUMMARY");
      if (panel) setPanelHeight(details, panel);
    });
  });
};

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  return copied;
};

const showCopySuccess = (button, label) => {
  const labelTarget = button.querySelector("[data-label]");
  const original = button.dataset.originalLabel || labelTarget?.textContent || "";
  button.dataset.originalLabel = original;
  if (labelTarget && label) labelTarget.textContent = label;
  button.classList.add("is-copied");

  window.clearTimeout(button.copyResetTimer);
  button.copyResetTimer = window.setTimeout(() => {
    if (labelTarget) labelTarget.textContent = original;
    button.classList.remove("is-copied");
  }, 1600);
};

const setupCopyBlocks = () => {
  document.querySelectorAll("[data-copy-block]").forEach((block) => {
    const button = block.querySelector("[data-copy-block-button]");
    const content = block.querySelector("code, pre, .copy-block__content");
    if (!button || !content) return;

    button.addEventListener("click", async () => {
      const copied = await copyText(content.innerText.trim());
      showCopySuccess(button, copied ? null : "Copy failed");
    });
  });
};

const setupFloatingActions = () => {
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const title = document.querySelector("h1")?.textContent.trim() || document.title;
  const askPrompt = `Read this Sell In Public article and summarize the main definition, cited evidence, examples, and practical checklist: ${title} ${canonical}`;

  document.querySelectorAll("[data-copy-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      const copied = await copyText(canonical);
      showCopySuccess(button, copied ? "Copied" : "Copy failed");
    });
  });

  document.querySelectorAll("[data-ask-ai]").forEach((button) => {
    button.addEventListener("click", async () => {
      const copied = await copyText(askPrompt);
      showCopySuccess(button, copied ? "Prompt copied" : "Copy failed");
    });
  });
};

createToc();
setupFaqAnimations();
setupCopyBlocks();
setupFloatingActions();
