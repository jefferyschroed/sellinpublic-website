const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = document.querySelectorAll(".texts-reveal, .card-reveal, .faq-reveal");

const cssTimeToMs = (value) => {
  const time = value.trim();
  if (!time) return 0;
  if (time.endsWith("ms")) return Number.parseFloat(time) || 0;
  if (time.endsWith("s")) return (Number.parseFloat(time) || 0) * 1000;
  return Number.parseFloat(time) || 0;
};

if ("IntersectionObserver" in window && !reduceMotion) {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "pending";
  });

  const showRevealTarget = (target) => {
    let cleanupTimer;
    const finish = () => {
      window.clearTimeout(cleanupTimer);
      target.dataset.reveal = "done";
      target.removeEventListener("transitionend", finishReveal);
    };
    const finishReveal = (event) => {
      if (event.target !== target || event.propertyName !== "opacity") return;
      finish();
    };

    target.addEventListener("transitionend", finishReveal);
    target.dataset.reveal = "visible";

    const targetStyle = getComputedStyle(target);
    const revealDuration = cssTimeToMs(targetStyle.getPropertyValue("--reveal-duration"));
    const revealDelay = cssTimeToMs(targetStyle.getPropertyValue("--reveal-delay"));
    cleanupTimer = window.setTimeout(finish, revealDuration + revealDelay + 120);
  };

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          showRevealTarget(entry.target);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.16,
    }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "done";
  });
}

const nav = document.querySelector(".sip-nav");

if (nav) {
  const navMenu = nav.querySelector(".sip-nav__menu");
  const navToggle = nav.querySelector(".sip-nav__toggle");
  const mobileMenuQuery = window.matchMedia("(max-width: 980px)");
  const dropdownCloseMs = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur")
  ) || 150;
  let menuCloseTimer;
  let lastScrollY = window.scrollY;
  let ticking = false;

  const isMenuOpen = () => navMenu?.classList.contains("is-open");

  const setMenuButtonState = (open) => {
    if (!navToggle) return;

    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    navToggle.title = open ? "Close navigation menu" : "Open navigation menu";
  };

  const openMenu = () => {
    if (!navMenu || !navToggle) return;

    window.clearTimeout(menuCloseTimer);
    navMenu.classList.remove("is-closing");
    navMenu.classList.add("is-open");
    navMenu.setAttribute("aria-hidden", "false");
    nav.classList.add("is-menu-open");
    nav.classList.remove("is-hidden");
    setMenuButtonState(true);
  };

  const closeMenu = ({ immediate = false } = {}) => {
    if (!navMenu || !navToggle) return;

    window.clearTimeout(menuCloseTimer);
    nav.classList.remove("is-menu-open");
    setMenuButtonState(false);

    if (immediate) {
      navMenu.classList.remove("is-open", "is-closing");
      navMenu.setAttribute("aria-hidden", mobileMenuQuery.matches ? "true" : "false");
      return;
    }

    if (!navMenu.classList.contains("is-open") && !navMenu.classList.contains("is-closing")) {
      navMenu.setAttribute("aria-hidden", "true");
      return;
    }

    navMenu.classList.remove("is-open");
    navMenu.classList.add("is-closing");
    navMenu.setAttribute("aria-hidden", "true");
    menuCloseTimer = window.setTimeout(() => {
      navMenu.classList.remove("is-closing");
    }, dropdownCloseMs);
  };

  const syncMenuMode = () => {
    if (!navMenu) return;

    if (mobileMenuQuery.matches) {
      if (!isMenuOpen()) navMenu.setAttribute("aria-hidden", "true");
      return;
    }

    closeMenu({ immediate: true });
    navMenu.setAttribute("aria-hidden", "false");
  };

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

    if (isMenuOpen()) {
      nav.classList.remove("is-hidden");
    } else if (currentScrollY < 28 || delta < -6) {
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
  syncMenuMode();

  navToggle?.addEventListener("click", () => {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  navMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (mobileMenuQuery.matches) closeMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!mobileMenuQuery.matches || !isMenuOpen() || nav.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isMenuOpen()) return;
    closeMenu();
    navToggle?.focus();
  });

  window.addEventListener("scroll", requestNavSync, { passive: true });
  window.addEventListener("resize", () => {
    syncMenuMode();
    requestNavSync();
  }, { passive: true });
}

const faqItems = Array.from(document.querySelectorAll(".faq-booking__item"));

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
