const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = document.querySelectorAll(".texts-reveal, .card-reveal, .faq-reveal");

(() => {
  const STORAGE_KEY = "sip_cookie_consent_v1";
  const ACCEPTED = "accepted";
  const DECLINED = "declined";
  const DETAILS = "details";
  const TRANSITION_MS = 180;
  const settings = window.SIP_TRACKING || {};
  let banner;
  let settingsButton;

  const readPreference = () => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  };

  const writePreference = (status) => {
    const payload = {
      status,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      window.__sipCookieConsent = payload;
    }
  };

  const appendScript = (src, marker) => {
    if (!src || document.querySelector(`script[data-sip-tracking="${marker}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.dataset.sipTracking = marker;
    document.head.appendChild(script);
  };

  const loadGoogleAnalytics = () => {
    const id = String(settings.ga4MeasurementId || "").trim();
    if (!/^G-[A-Z0-9]+$/i.test(id) || window.__sipGa4Loaded) return;

    window.__sipGa4Loaded = true;
    window[`ga-disable-${id}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, "ga4");
    window.gtag("js", new Date());
    window.gtag("config", id);
  };

  const loadReb2b = () => {
    const key = String(settings.reb2bKey || "").trim();
    if (!/^[A-Z0-9]+$/i.test(key) || window.reb2b?.loaded || window.__sipReb2bLoaded) return;

    window.__sipReb2bLoaded = true;
    window.reb2b = { loaded: true };
    appendScript(`https://ddwl4m2hdecbv.cloudfront.net/b/${key}/${key}.js.gz`, "reb2b");
  };

  const disableGoogleAnalytics = () => {
    const id = String(settings.ga4MeasurementId || "").trim();
    if (/^G-[A-Z0-9]+$/i.test(id)) window[`ga-disable-${id}`] = true;
  };

  const enableTracking = () => {
    loadGoogleAnalytics();
    loadReb2b();
  };

  const isPrivacyPage = () => window.location.pathname.replace(/\/+$/, "") === "/privacy";

  const removeBanner = () => {
    banner?.remove();
    banner = null;
  };

  const showSettingsButton = () => {
    if (!isPrivacyPage()) return;
    if (settingsButton) return;
    settingsButton = document.createElement("button");
    settingsButton.className = "sip-cookie-settings";
    settingsButton.type = "button";
    settingsButton.textContent = "Cookie settings";
    settingsButton.addEventListener("click", () => showBanner({ force: true }));
    document.body.appendChild(settingsButton);
  };

  const renderBannerContent = (mode) => {
    if (mode === DETAILS) {
      return `
        <div class="sip-cookie-consent__copy">
          <h2>Cookie choices</h2>
          <p>Some cookies keep the site working. Others help us understand which pages are useful, what brought people here, and how to make future visits more relevant.</p>
        </div>
        <div class="sip-cookie-consent__actions">
          <a class="sip-cookie-consent__button" href="/privacy/">Privacy policy</a>
          <button class="sip-cookie-consent__button" type="button" data-cookie-choice="${DECLINED}">Essentials only</button>
        </div>
      `;
    }

    return `
      <div class="sip-cookie-consent__copy">
        <h2>Cookie choices</h2>
        <p>We use cookies to improve your website experience and understand what's working.</p>
      </div>
      <div class="sip-cookie-consent__actions">
        <button class="sip-cookie-consent__button" type="button" data-cookie-manage>Manage choices</button>
        <button class="sip-cookie-consent__button sip-cookie-consent__button--primary" type="button" data-cookie-choice="${ACCEPTED}">Accept</button>
      </div>
    `;
  };

  const focusFirstBannerAction = () => {
    banner?.querySelector(".sip-cookie-consent__actions a, .sip-cookie-consent__actions button")?.focus({ preventScroll: true });
  };

  const bindBannerActions = () => {
    banner?.querySelector("[data-cookie-manage]")?.addEventListener("click", () => {
      setBannerMode(DETAILS);
    });

    banner?.querySelectorAll("[data-cookie-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.dataset.cookieChoice === ACCEPTED ? ACCEPTED : DECLINED;
        writePreference(status);
        if (status === ACCEPTED) enableTracking();
        else disableGoogleAnalytics();
        removeBanner();
        showSettingsButton();
      });
    });
  };

  function setBannerMode(mode) {
    if (!banner || banner.dataset.mode === mode) return;
    const content = banner.querySelector("[data-cookie-content]");
    if (!content) return;

    if (reduceMotion) {
      banner.dataset.mode = mode;
      content.innerHTML = renderBannerContent(mode);
      bindBannerActions();
      focusFirstBannerAction();
      return;
    }

    window.clearTimeout(banner._sipCookieTransitionTimer);
    banner.style.height = `${banner.offsetHeight}px`;
    content.classList.add("is-exit");

    banner._sipCookieTransitionTimer = window.setTimeout(() => {
      banner.dataset.mode = mode;
      content.innerHTML = renderBannerContent(mode);
      bindBannerActions();
      content.classList.remove("is-exit");
      content.classList.add("is-enter-start");

      const nextHeight = banner.scrollHeight;
      banner.style.height = `${nextHeight}px`;
      void content.offsetHeight;
      content.classList.remove("is-enter-start");

      const finish = (event) => {
        if (event.propertyName !== "height") return;
        banner.removeEventListener("transitionend", finish);
        banner.style.height = "";
      };

      banner.addEventListener("transitionend", finish);
      window.setTimeout(() => {
        banner.removeEventListener("transitionend", finish);
        banner.style.height = "";
      }, TRANSITION_MS + 180);
      focusFirstBannerAction();
    }, TRANSITION_MS);
  }

  function showBanner({ force = false } = {}) {
    if (banner || (!force && readPreference()?.status)) return;

    banner = document.createElement("section");
    banner.className = "sip-cookie-consent";
    banner.dataset.mode = "summary";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML = `
      <div class="sip-cookie-consent__content" data-cookie-content>
        ${renderBannerContent("summary")}
      </div>
    `;

    bindBannerActions();

    document.body.appendChild(banner);
    focusFirstBannerAction();
  }

  const syncConsent = () => {
    const preference = readPreference();
    if (preference?.status === ACCEPTED) {
      enableTracking();
      showSettingsButton();
      return;
    }

    if (preference?.status === DECLINED) {
      disableGoogleAnalytics();
      showSettingsButton();
      return;
    }

    disableGoogleAnalytics();
    showBanner();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncConsent, { once: true });
  } else {
    syncConsent();
  }
})();

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
