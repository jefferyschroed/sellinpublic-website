const revealTargets = document.querySelectorAll(".texts-reveal");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "pending";
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.dataset.reveal = "visible";
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "visible";
  });
}

const nav = document.querySelector(".sip-nav");

if (nav) {
  let lastScrollY = window.scrollY;
  let ticking = false;

  const getNavTheme = () => {
    const navStyle = window.getComputedStyle(nav);
    const navTop = Number.parseFloat(navStyle.top) || 0;
    const sampleX = Math.min(window.innerWidth - 1, Math.max(0, window.innerWidth / 2));
    const sampleY = Math.min(window.innerHeight - 1, Math.max(0, navTop + nav.offsetHeight / 2));
    const stack = document.elementsFromPoint(sampleX, sampleY);
    const themedElement = stack
      .filter((element) => !nav.contains(element))
      .map((element) => element.closest("[data-nav-theme]"))
      .find(Boolean);

    return themedElement?.dataset.navTheme === "dark" ? "dark" : "light";
  };

  const syncNav = () => {
    const currentScrollY = Math.max(window.scrollY, 0);
    const delta = currentScrollY - lastScrollY;

    if (currentScrollY < 28 || delta < -6) {
      nav.classList.remove("is-hidden");
    } else if (currentScrollY > 120 && delta > 6) {
      nav.classList.add("is-hidden");
    }

    nav.dataset.theme = getNavTheme();
    lastScrollY = currentScrollY;
    ticking = false;
  };

  const requestNavSync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncNav);
  };

  nav.dataset.theme = getNavTheme();

  window.addEventListener("scroll", requestNavSync, { passive: true });
  window.addEventListener("resize", requestNavSync, { passive: true });
}

const faqItems = Array.from(document.querySelectorAll(".faq-booking__item"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const setPanelHeight = (item, height) => {
  const panel = item.querySelector(":scope > div");
  if (!panel) return;
  panel.style.height = height;
};

const closeFaq = (item) => {
  const panel = item.querySelector(":scope > div");
  if (!panel || !item.open) return;

  if (reduceMotion) {
    item.open = false;
    panel.style.height = "";
    panel.style.opacity = "";
    return;
  }

  panel.style.height = `${panel.scrollHeight}px`;
  panel.style.opacity = "1";
  panel.offsetHeight;
  item.classList.add("is-animating");
  panel.style.height = "0px";
  panel.style.opacity = "0";

  const finish = (event) => {
    if (event.propertyName !== "height") return;
    panel.removeEventListener("transitionend", finish);
    item.open = false;
    item.classList.remove("is-animating");
    panel.style.height = "";
    panel.style.opacity = "";
  };

  panel.addEventListener("transitionend", finish);
};

const openFaq = (item) => {
  const panel = item.querySelector(":scope > div");
  if (!panel || item.open) return;

  faqItems.forEach((sibling) => {
    if (sibling !== item) closeFaq(sibling);
  });

  if (reduceMotion) {
    item.open = true;
    panel.style.height = "";
    panel.style.opacity = "";
    return;
  }

  item.open = true;
  item.classList.add("is-animating");
  panel.style.height = "0px";
  panel.style.opacity = "0";
  panel.offsetHeight;
  panel.style.height = `${panel.scrollHeight}px`;
  panel.style.opacity = "1";

  const finish = (event) => {
    if (event.propertyName !== "height") return;
    panel.removeEventListener("transitionend", finish);
    item.classList.remove("is-animating");
    panel.style.height = "auto";
    panel.style.opacity = "";
  };

  panel.addEventListener("transitionend", finish);
};

faqItems.forEach((item) => {
  const summary = item.querySelector("summary");
  const panel = item.querySelector(":scope > div");

  if (item.open) {
    setPanelHeight(item, "auto");
  }

  summary?.addEventListener("click", (event) => {
    event.preventDefault();

    if (!panel) return;

    if (item.open) {
      closeFaq(item);
    } else {
      openFaq(item);
    }
  });
});
