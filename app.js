const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileLayout = window.matchMedia("(max-width: 768px)");

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (from, to, progress) => from + (to - from) * progress;

class SmoothScroller {
  constructor() {
    this.current = window.scrollY;
    this.target = window.scrollY;
    this.lastTime = performance.now();
    this.frame = 0;
    this.running = false;

    this.onWheel = this.onWheel.bind(this);
    this.onNativeScroll = this.onNativeScroll.bind(this);
    this.tick = this.tick.bind(this);

    document.documentElement.classList.add("lenis");
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("scroll", this.onNativeScroll, { passive: true });
  }

  get limit() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  normalizeWheel(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * (100 / 6);
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  onWheel(event) {
    if (reducedMotion.matches || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute("data-lenis-prevent"))) return;
    if (document.body.classList.contains("is-loading")) {
      event.preventDefault();
      return;
    }

    const delta = this.normalizeWheel(event);
    const nextTarget = clamp(this.target + delta, 0, this.limit);
    if (nextTarget === this.target && (nextTarget === 0 || nextTarget === this.limit)) return;

    event.preventDefault();
    this.target = nextTarget;
    this.start();
  }

  onNativeScroll() {
    if (this.running && Math.abs(window.scrollY - this.current) > 1) {
      this.running = false;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.current = window.scrollY;
      this.target = window.scrollY;
    } else if (!this.running && Math.abs(window.scrollY - this.current) > 0.5) {
      this.current = window.scrollY;
      this.target = window.scrollY;
    }
    requestEffectsFrame();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  tick(time) {
    const elapsed = Math.min(0.05, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;

    // Lenis' default time-normalized lerp: damp(value, target, .1 * 60, dt).
    const progress = 1 - Math.exp(-6 * elapsed);
    this.current = mix(this.current, this.target, progress);

    if (Math.abs(this.target - this.current) < 0.5) {
      this.current = this.target;
    }

    window.scrollTo(0, this.current);
    requestEffectsFrame();

    if (this.current === this.target) {
      this.running = false;
      this.frame = 0;
      return;
    }

    this.frame = requestAnimationFrame(this.tick);
  }

  scrollTo(target, { immediate = false } = {}) {
    const destination = clamp(target, 0, this.limit);
    if (immediate || reducedMotion.matches) {
      this.current = destination;
      this.target = destination;
      this.running = false;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      window.scrollTo(0, destination);
      updateScrollEffects();
      return;
    }

    this.current = window.scrollY;
    this.target = destination;
    this.start();
  }
}

let effectsFrame = 0;
let bridgeLayout = [];
let mobileCardsUnstacked = false;

const stackStage = document.querySelector("[data-stack-bridge]");
const stackCards = [...document.querySelectorAll("[data-stack-card]")];
const workTargets = [...document.querySelectorAll(".work-card__media")];
const aboutParallax = document.querySelector(".about-card__portrait");
const contactParallax = document.querySelector(".contact-card__visual");

function requestEffectsFrame() {
  if (effectsFrame) return;
  effectsFrame = requestAnimationFrame(() => {
    effectsFrame = 0;
    updateScrollEffects();
  });
}

function documentRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height
  };
}

function measureStackBridge() {
  if (!stackStage || stackCards.length !== workTargets.length) return;

  const stage = documentRect(stackStage);
  bridgeLayout = stackCards.map((card, index) => {
    const target = documentRect(workTargets[index]);
    const width = target.width;
    const height = target.height;
    const localTop = (stage.height - height) / 2;

    card.style.width = `${width}px`;
    card.style.height = `${height}px`;
    card.style.top = `${localTop}px`;
    card.style.left = "0px";

    const baseLeft = stage.left;
    const baseTop = stage.top + localTop;
    const desktopStartX = width * [-0.055, 0.112, 0.34][index];
    const desktopStartY = height * [-0.02, -0.22, -0.02][index];

    return {
      card,
      target: workTargets[index],
      endX: target.left - baseLeft,
      endY: target.top - baseTop,
      desktopStartX,
      desktopStartY,
      mobileStartX: [40, 8, -16][index],
      mobileStartY: [-10, -30, 10][index],
      rotation: [-5, 0, 5][index],
      desktopScale: [1.35, 1.3, 1.25][index],
      mobileScale: [0.65, 0.7, 0.75][index]
    };
  });

  applyStackBridge(true);
}

function setCardTransform(item, x, y, rotation, scale, opacity = 1) {
  item.card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`;
  item.card.style.opacity = String(opacity);
}

function applyDesktopStackBridge() {
  const workSection = document.querySelector(".work-section");
  if (!workSection) return;

  const endpoint = Math.max(1, workSection.offsetTop + workSection.offsetHeight - window.innerHeight);
  const progress = clamp(window.scrollY / endpoint, 0, 1);
  const crossfade = clamp((progress - 0.975) / 0.025, 0, 1);

  bridgeLayout.forEach((item) => {
    item.card.style.transition = "none";
    const x = mix(item.desktopStartX, item.endX, progress);
    const y = mix(item.desktopStartY, item.endY, progress);
    const rotation = mix(item.rotation, 0, progress);
    const scale = mix(item.desktopScale, 1, progress);
    setCardTransform(item, x, y, rotation, scale, 1 - crossfade);
    item.target.style.opacity = String(crossfade);
    item.card.style.pointerEvents = progress < 0.4 ? "auto" : "none";
  });
}

function applyMobileStackBridge(immediate = false) {
  const triggerPoint = stackStage
    ? documentRect(stackStage).top - window.innerHeight * 0.35
    : 130;
  mobileCardsUnstacked = window.scrollY >= triggerPoint;

  bridgeLayout.forEach((item) => {
    item.card.style.pointerEvents = mobileCardsUnstacked ? "none" : "auto";

    if (mobileCardsUnstacked) {
      item.target.style.transition = immediate || reducedMotion.matches
        ? "none"
        : "opacity 220ms ease-out 980ms";
      item.target.style.opacity = "1";
      item.card.style.transition = immediate || reducedMotion.matches
        ? "none"
        : "transform 1200ms cubic-bezier(0.645, 0.045, 0.355, 1), opacity 220ms ease-out 980ms";
      setCardTransform(item, item.endX, item.endY, 0, 1, 0);
    } else {
      item.target.style.transition = immediate || reducedMotion.matches ? "none" : "opacity 80ms linear";
      item.target.style.opacity = "0";
      item.card.style.transition = immediate || reducedMotion.matches
        ? "none"
        : "transform 1200ms cubic-bezier(0.645, 0.045, 0.355, 1), opacity 80ms linear";
      setCardTransform(
        item,
        item.mobileStartX,
        item.mobileStartY,
        item.rotation,
        item.mobileScale,
        1
      );
    }
  });
}

function applyStackBridge(immediate = false) {
  if (!bridgeLayout.length) return;
  if (reducedMotion.matches) {
    bridgeLayout.forEach((item) => {
      item.target.style.opacity = "1";
      item.card.style.transition = "none";
      const x = mobileLayout.matches ? item.mobileStartX : item.desktopStartX;
      const y = mobileLayout.matches ? item.mobileStartY : item.desktopStartY;
      const scale = mobileLayout.matches ? item.mobileScale : item.desktopScale;
      setCardTransform(item, x, y, item.rotation, scale, 1);
    });
    return;
  }
  if (mobileLayout.matches) applyMobileStackBridge(immediate);
  else applyDesktopStackBridge();
}

function updateImageParallax(container) {
  if (!container) return;
  if (reducedMotion.matches) {
    container.style.setProperty("--parallax-scale", "1");
    return;
  }
  const section = container.closest("section");
  if (!section) return;

  const start = section.offsetTop - window.innerHeight;
  const distance = (section.offsetHeight + window.innerHeight) * 0.6;
  const progress = clamp((window.scrollY - start) / Math.max(1, distance), 0, 1);
  container.style.setProperty("--parallax-scale", String(mix(1.3, 1, progress)));
}

function updateScrollEffects() {
  applyStackBridge();
  updateImageParallax(aboutParallax);
  updateImageParallax(contactParallax);
}

const scroller = new SmoothScroller();

function getNavClearance() {
  const nav = document.querySelector("[data-floating-nav]");
  const navBar = nav?.querySelector(".floating-nav__bar");
  if (!nav || !navBar) return 0;
  const navStyle = getComputedStyle(nav);
  return parseFloat(navStyle.top) + navBar.getBoundingClientRect().height + (2 * parseFloat(navStyle.paddingTop)) + 16;
}

function scrollToInitialHash() {
  if (!window.location.hash) return;
  let target;
  try {
    target = document.querySelector(window.location.hash);
  } catch {
    return;
  }
  if (!target) return;
  requestAnimationFrame(() => scroller.scrollTo(target.offsetTop - getNavClearance(), { immediate: true }));
}

function setupLoader() {
  const loader = document.querySelector("[data-loader]");
  window.scrollTo(0, 0);
  scroller.current = 0;
  scroller.target = 0;

  if (!loader || reducedMotion.matches) {
    if (loader) loader.hidden = true;
    document.body.classList.remove("is-loading");
    document.body.classList.add("is-hero-ready");
    document.body.classList.add("is-ready");
    scrollToInitialHash();
    return;
  }

  requestAnimationFrame(() => loader.classList.add("is-running"));

  window.setTimeout(() => {
    loader.classList.add("is-reversing");
  }, 3000);

  window.setTimeout(() => {
    loader.classList.add("is-exiting");
  }, 3500);

  window.setTimeout(() => {
    document.body.classList.add("is-hero-ready");
  }, 4000);

  window.setTimeout(() => {
    document.body.classList.remove("is-loading");
    document.body.classList.add("is-ready");
    loader.hidden = true;
    scrollToInitialHash();
  }, 4500);
}

function setupNavigation() {
  const nav = document.querySelector("[data-floating-nav]");
  const toggle = document.querySelector("[data-menu-toggle]");
  const panel = document.querySelector("[data-menu-panel]");
  const scrim = document.querySelector("[data-nav-scrim]");
  if (!nav || !toggle || !panel || !scrim) return;

  let closeTimer = 0;
  let menuOpen = false;
  let transitionGeneration = 0;

  const setMenu = (open, { restoreFocus = false } = {}) => {
    window.clearTimeout(closeTimer);
    const generation = ++transitionGeneration;
    menuOpen = open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    panel.setAttribute("aria-hidden", String(!open));

    if (open) {
      panel.hidden = false;
      scrim.hidden = false;
      panel.style.height = "0px";
      panel.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (!menuOpen || generation !== transitionGeneration) return;
        nav.classList.add("is-open");
        scrim.classList.add("is-open");
        panel.style.height = `${panel.scrollHeight}px`;
      });
      return;
    }

    panel.style.height = `${panel.scrollHeight}px`;
    panel.getBoundingClientRect();
    nav.classList.remove("is-open");
    scrim.classList.remove("is-open");
    requestAnimationFrame(() => {
      if (menuOpen || generation !== transitionGeneration) return;
      panel.style.height = "0px";
    });

    closeTimer = window.setTimeout(() => {
      if (menuOpen || generation !== transitionGeneration) return;
      panel.hidden = true;
      scrim.hidden = true;
      panel.style.height = "";
      if (restoreFocus) toggle.focus();
    }, 510);
  };

  toggle.addEventListener("click", () => setMenu(!menuOpen));
  scrim.addEventListener("click", () => setMenu(false));
  panel.querySelectorAll("[data-menu-link]").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) setMenu(false, { restoreFocus: true });
  });
}

function setupAnchorNavigation() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      const target = hash === "#" ? null : document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      if (link.classList.contains("skip-link")) {
        scroller.scrollTo(target.offsetTop, { immediate: true });
        target.focus({ preventScroll: true });
        return;
      }
      scroller.scrollTo(target.offsetTop - getNavClearance());
    });
  });
}

function splitWords(element) {
  if (!element || element.children.length) return;
  const text = element.textContent.trim();
  if (!text) return;

  element.dataset.originalText = text;
  element.setAttribute("aria-label", text);
  element.textContent = "";

  text.split(/\s+/).forEach((word, index, words) => {
    const span = document.createElement("span");
    span.className = "word-reveal";
    span.style.setProperty("--word-index", String(index));
    span.setAttribute("aria-hidden", "true");
    span.textContent = word;
    element.append(span);
    if (index < words.length - 1) element.append(document.createTextNode(" "));
  });
}

function flattenSplitText(root) {
  root.querySelectorAll("[data-original-text]").forEach((element) => {
    element.textContent = element.dataset.originalText;
    element.removeAttribute("data-original-text");
    element.removeAttribute("aria-label");
  });
}

function setupReveals() {
  document.querySelectorAll(
    ".section-heading h2, .section-heading__lede, .ethos h2, .ethos__inner > p:not(.section-kicker):not(.ethos__attribution), .about-card__copy h2, .contact-card h2"
  ).forEach(splitWords);

  const revealElements = [...document.querySelectorAll("[data-reveal]")];
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      element.classList.add("is-visible");
      observer.unobserve(element);

      const wordCount = element.querySelectorAll(".word-reveal").length;
      if (wordCount) {
        window.setTimeout(() => flattenSplitText(element), 700 + wordCount * 40);
      }
    });
  }, { rootMargin: "0px 0px -15%", threshold: 0 });

  revealElements.forEach((element) => observer.observe(element));
}

function setAccordionOpen(trigger, open, immediate = false) {
  const content = document.getElementById(trigger.getAttribute("aria-controls"));
  if (!content) return;
  const item = trigger.closest(".accordion__item");
  trigger.setAttribute("aria-expanded", String(open));
  item?.classList.toggle("is-open", open);

  if (immediate) {
    content.hidden = !open;
    content.style.height = open ? "auto" : "0px";
    content.style.opacity = open ? "1" : "0";
    return;
  }

  if (open) {
    content.hidden = false;
    content.style.height = "0px";
    content.style.opacity = "0";
    content.getBoundingClientRect();
    requestAnimationFrame(() => {
      content.style.height = `${content.scrollHeight}px`;
      content.style.opacity = "1";
    });
    window.setTimeout(() => {
      if (trigger.getAttribute("aria-expanded") === "true") content.style.height = "auto";
    }, 310);
    return;
  }

  if (content.hidden) return;
  content.style.height = `${content.scrollHeight}px`;
  content.getBoundingClientRect();
  requestAnimationFrame(() => {
    content.style.height = "0px";
    content.style.opacity = "0";
  });
  window.setTimeout(() => {
    if (trigger.getAttribute("aria-expanded") === "false") content.hidden = true;
  }, 310);
}

function closePanelAccordions(panel, immediate = false) {
  panel.querySelectorAll("[data-accordion-trigger]").forEach((trigger) => {
    setAccordionOpen(trigger, false, immediate);
  });
}

function setupFaq() {
  const tabs = [...document.querySelectorAll("[data-faq-tab]")];
  const panels = [...document.querySelectorAll("[data-faq-panel]")];
  if (!tabs.length || !panels.length) return;
  const tablist = tabs[0].parentElement;
  const indicator = tablist?.querySelector(".faq__active-indicator");

  const updateIndicator = (tab, immediate = false) => {
    if (!indicator) return;
    const tabRect = tab.getBoundingClientRect();
    const tablistRect = tablist.getBoundingClientRect();
    const tablistBorder = Number.parseFloat(getComputedStyle(tablist).borderLeftWidth) || 0;
    indicator.classList.toggle("is-ready", !immediate);
    indicator.style.width = `${tabRect.width}px`;
    indicator.style.transform = `translateX(${tabRect.left - tablistRect.left - tablistBorder}px)`;
    if (immediate) requestAnimationFrame(() => indicator.classList.add("is-ready"));
  };

  panels.forEach((panel) => closePanelAccordions(panel, true));
  updateIndicator(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0], true);

  const activateTab = (tab) => {
    if (tab.getAttribute("aria-selected") === "true") {
      updateIndicator(tab);
      return;
    }
    const category = tab.dataset.faqTab;
    tabs.forEach((candidate) => {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    updateIndicator(tab);

    panels.forEach((panel) => {
      closePanelAccordions(panel, true);
      const selected = panel.dataset.faqPanel === category;
      panel.hidden = !selected;
      panel.classList.toggle("is-entering", selected);
      if (selected) {
        window.setTimeout(() => panel.classList.remove("is-entering"), 610);
      }
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      tabs[nextIndex].focus();
      activateTab(tabs[nextIndex]);
    });
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      updateIndicator(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0], true);
    });
  }, { passive: true });

  if ("ResizeObserver" in window && tablist) {
    new ResizeObserver(() => {
      updateIndicator(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0], true);
    }).observe(tablist);
  }

  document.querySelectorAll("[data-accordion-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const panel = trigger.closest("[data-faq-panel]");
      const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
      panel?.querySelectorAll("[data-accordion-trigger]").forEach((candidate) => {
        if (candidate !== trigger) setAccordionOpen(candidate, false);
      });
      setAccordionOpen(trigger, shouldOpen);
    });
  });
}

function setupStaggerButtons() {
  document.querySelectorAll(
    ".floating-nav__contact-pill > span:first-child, .contact-form__submit > span:first-child"
  ).forEach((label) => {
    const text = label.textContent.trim();
    const parent = label.parentElement;
    if (!text || !parent) return;

    parent.classList.add("stagger-hover");
    parent.setAttribute("aria-label", text);
    label.classList.add("stagger-label-inner");
    label.setAttribute("aria-hidden", "true");
    label.textContent = "";

    [...text].forEach((character, index) => {
      const span = document.createElement("span");
      span.className = "stagger-char";
      span.style.setProperty("--char-index", String(index));
      span.textContent = character === " " ? "\u00a0" : character;
      label.append(span);
    });
  });
}

function setupContactForm() {
  const form = document.querySelector("[data-contact-form]");
  const status = document.querySelector("[data-form-status]");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const message = String(values.get("message") ?? "").trim();
    const subject = `Portfolio enquiry from ${name}`;
    const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;

    if (status) status.hidden = false;
    window.location.href = `mailto:aakarsh545@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

function updateYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

function handleLayoutChange() {
  scroller.current = window.scrollY;
  scroller.target = window.scrollY;
  window.clearTimeout(handleLayoutChange.timer);
  handleLayoutChange.timer = window.setTimeout(() => {
    measureStackBridge();
    updateScrollEffects();
  }, 80);
}

setupLoader();
setupNavigation();
setupAnchorNavigation();
setupReveals();
setupFaq();
setupStaggerButtons();
setupContactForm();
updateYear();

Promise.resolve(document.fonts?.ready).then(() => {
  measureStackBridge();
  updateScrollEffects();
});

window.addEventListener("resize", handleLayoutChange, { passive: true });
mobileLayout.addEventListener("change", handleLayoutChange);
reducedMotion.addEventListener("change", () => window.location.reload());
