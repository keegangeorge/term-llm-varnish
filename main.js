// Varnish behaviour.
//
// Ground rules: never restructure nodes the app (Preact) owns. We only add
// attributes, append small self-contained elements, and drive the app's own
// controls (e.g. clicking the real runtime-settings trigger) so app logic and
// state stay the single source of truth.

import {
  KEYS, ACCENTS, NODE_ID, html, reducedMotion, read, write, nodeAccent,
  setApiPrefix, loadLocalConfig,
} from "./util.js";
import { createThread } from "./thread.js";
import { createComposerExtras } from "./composer.js";
import { createPalette } from "./palette.js";
import { createTabNotifier } from "./notify.js";
import { createNodeFavicon } from "./favicon.js";

const SCHEMES = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

const ICONS = {
  system:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  palette:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.2" r="1.1" fill="currentColor"/><circle cx="15" cy="7.4" r="1.1" fill="currentColor"/></svg>',
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
  caret:
    '<svg class="vn-chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};

const EFFORT = {
  auto: { label: "Auto", bars: 0 },
  none: { label: "None", bars: 0 },
  minimal: { label: "Minimal", bars: 1 },
  low: { label: "Low", bars: 1 },
  medium: { label: "Medium", bars: 2 },
  high: { label: "High", bars: 3 },
  xhigh: { label: "X-High", bars: 4 },
  max: { label: "Max", bars: 4 },
};

const TYPE_SCALES = [
  { id: "compact", name: "Compact" },
  { id: "comfortable", name: "Comfortable" },
];

function createTheme() {
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const accentKey = NODE_ID ? `${KEYS.accent}:${NODE_ID}` : KEYS.accent;
  let scheme = read(KEYS.scheme, "system");
  let accent = nodeAccent(NODE_ID);
  if (!SCHEMES.some((s) => s.id === scheme)) scheme = "system";
  let toolbar = read(KEYS.toolbar, "neutral") === "accent" ? "accent" : "neutral";
  let type = read(KEYS.type, "comfortable") === "compact" ? "compact" : "comfortable";
  html.setAttribute("data-vn-type", type);
  let switchTimer = 0;

  const resolved = () =>
    scheme === "system" ? (systemDark.matches ? "dark" : "light") : scheme;

  function apply(animate) {
    if (animate && !reducedMotion.matches) {
      html.setAttribute("data-vn-switching", "");
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => html.removeAttribute("data-vn-switching"), 360);
    }
    html.setAttribute("data-vn-scheme", resolved());
    html.setAttribute("data-vn-accent", accent);
    applyToolbar();
  }

  // Browser chrome colour (installed Chrome/Edge app windows, Android Chrome,
  // Safari's tab bar). The page ships two OS-keyed metas; point both at our
  // colour so an explicit Light/Dark choice wins over the OS setting.
  function toolbarColor() {
    const isLight = resolved() === "light";
    if (toolbar === "accent") {
      const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
      return isLight ? a.light : a.dark;
    }
    return isLight ? "#fbfbfc" : "#0a0a0c";
  }

  function applyToolbar() {
    let metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    if (!metas.length) {
      const m = document.createElement("meta");
      m.name = "theme-color";
      document.head.append(m);
      metas = [m];
    }
    const color = toolbarColor();
    for (const m of metas) {
      if (!m.hasAttribute("data-vn-original")) {
        m.setAttribute("data-vn-original", m.getAttribute("content") || "");
      }
      if (m.getAttribute("content") !== color) m.setAttribute("content", color);
    }
  }

  const onSystem = () => scheme === "system" && apply(true);
  systemDark.addEventListener("change", onSystem);
  apply(false);

  return {
    get scheme() { return scheme; },
    get accent() { return accent; },
    get resolved() { return resolved(); },
    get toolbar() { return toolbar; },
    setToolbar(next) {
      toolbar = next === "accent" ? "accent" : "neutral";
      write(KEYS.toolbar, toolbar);
      applyToolbar();
    },
    setScheme(next) {
      scheme = next;
      write(KEYS.scheme, next);
      apply(true);
    },
    setAccent(next) {
      accent = next;
      write(accentKey, next);
      apply(true);
      document.dispatchEvent(new CustomEvent("vn:accent-change"));
    },
    get type() { return type; },
    setType(next) {
      type = next === "compact" ? "compact" : "comfortable";
      write(KEYS.type, type);
      html.setAttribute("data-vn-type", type);
    },
    dispose() {
      systemDark.removeEventListener("change", onSystem);
      html.removeAttribute("data-vn-scheme");
      html.removeAttribute("data-vn-accent");
      html.removeAttribute("data-vn-type");
      for (const m of document.querySelectorAll('meta[name="theme-color"][data-vn-original]')) {
        m.setAttribute("content", m.getAttribute("data-vn-original"));
        m.removeAttribute("data-vn-original");
      }
    },
  };
}

/* ------------------------------------------------------- theme popover */

function createThemePicker(theme, mount) {
  let popover = null;
  let backdrop = null;
  let anchor = null;

  function close({ restoreFocus = true } = {}) {
    if (!popover) return;
    const p = popover;
    const b = backdrop;
    popover = null;
    backdrop = null;
    anchor?.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey, true);
    if (restoreFocus) anchor?.focus({ preventScroll: true });
    if (reducedMotion.matches) {
      p.remove();
      b.remove();
      return;
    }
    p.setAttribute("data-leaving", "");
    b.remove();
    setTimeout(() => p.remove(), 220);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      close();
    }
  }

  function render() {
    const schemeIndex = SCHEMES.findIndex((s) => s.id === theme.scheme);
    const accentName = ACCENTS.find((a) => a.id === theme.accent)?.name ?? "";
    const isLight = theme.resolved === "light";
    popover.innerHTML = `
      <span class="vn-popover-label" id="vn-appearance-label">Appearance</span>
      <div class="vn-segment" role="radiogroup" aria-labelledby="vn-appearance-label" style="--vn-seg-index:${schemeIndex}">
        <span class="vn-segment-thumb" aria-hidden="true"></span>
        ${SCHEMES.map(
          (s) => `<button type="button" role="radio" data-scheme="${s.id}" aria-checked="${s.id === theme.scheme}">${ICONS[s.id]}<span>${s.name}</span></button>`,
        ).join("")}
      </div>
      <span class="vn-popover-label" id="vn-type-label">Text size</span>
      <div class="vn-segment vn-segment-type" role="radiogroup" aria-labelledby="vn-type-label" style="--vn-seg-count:2;--vn-seg-index:${TYPE_SCALES.findIndex((t) => t.id === theme.type)}">
        <span class="vn-segment-thumb" aria-hidden="true"></span>
        ${TYPE_SCALES.map(
          (t) => `<button type="button" role="radio" data-type="${t.id}" aria-checked="${t.id === theme.type}"><span class="vn-type-glyph ${t.id === "compact" ? "vn-type-glyph-sm" : "vn-type-glyph-lg"}" aria-hidden="true">Aa</span><span>${t.name}</span></button>`,
        ).join("")}
      </div>
      <span class="vn-popover-label" id="vn-accent-label">Accent color</span>
      <div class="vn-swatches" role="radiogroup" aria-labelledby="vn-accent-label">
        ${ACCENTS.map(
          (a) => `<button type="button" class="vn-swatch" role="radio" data-accent="${a.id}" aria-label="${a.name}" title="${a.name}" aria-checked="${a.id === theme.accent}" style="--sw:${isLight ? a.light : a.dark}"></button>`,
        ).join("")}
      </div>
      <div class="vn-swatch-name" aria-live="polite">${accentName}</div>
      <div class="vn-popover-divider" aria-hidden="true"></div>
      <button type="button" class="vn-switch-row" role="switch" data-toolbar aria-checked="${theme.toolbar === "accent"}">
        <span class="vn-switch-copy"><span class="vn-switch-title">Tint browser toolbar</span><span class="vn-switch-hint">Use the accent for the window bar</span></span>
        <span class="vn-switch" aria-hidden="true"><span></span></span>
      </button>`;
  }

  function position() {
    if (!popover || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = popover.offsetWidth || 268;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
    popover.style.top = `${Math.round(r.bottom + 8)}px`;
    popover.style.left = `${Math.round(left)}px`;
  }

  function open(button) {
    if (popover) return close();
    anchor = button;
    backdrop = document.createElement("div");
    backdrop.className = "vn-popover-backdrop";
    backdrop.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      close();
    });
    popover = document.createElement("div");
    popover.className = "vn-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Appearance");
    render();
    popover.addEventListener("click", (event) => {
      const schemeBtn = event.target.closest("[data-scheme]");
      const accentBtn = event.target.closest("[data-accent]");
      const toolbarBtn = event.target.closest("[data-toolbar]");
      const typeBtn = event.target.closest("[data-type]");
      if (typeBtn) {
        theme.setType(typeBtn.dataset.type);
        popover.querySelectorAll("[data-type]").forEach((b) =>
          b.setAttribute("aria-checked", String(b.dataset.type === theme.type)),
        );
        popover.querySelector(".vn-segment-type").style.setProperty(
          "--vn-seg-index",
          String(TYPE_SCALES.findIndex((t) => t.id === theme.type)),
        );
      } else if (toolbarBtn) {
        theme.setToolbar(theme.toolbar === "accent" ? "neutral" : "accent");
        toolbarBtn.setAttribute("aria-checked", String(theme.toolbar === "accent"));
      } else if (schemeBtn) {
        theme.setScheme(schemeBtn.dataset.scheme);
        const focusId = schemeBtn.dataset.scheme;
        // Re-render after the colours settle so swatches pick up the new scheme.
        popover.querySelectorAll("[data-scheme]").forEach((b) =>
          b.setAttribute("aria-checked", String(b.dataset.scheme === focusId)),
        );
        popover.querySelector(".vn-segment").style.setProperty(
          "--vn-seg-index",
          String(SCHEMES.findIndex((s) => s.id === focusId)),
        );
        const isLight = theme.resolved === "light";
        popover.querySelectorAll("[data-accent]").forEach((b) => {
          const a = ACCENTS.find((x) => x.id === b.dataset.accent);
          b.style.setProperty("--sw", isLight ? a.light : a.dark);
        });
      } else if (accentBtn) {
        theme.setAccent(accentBtn.dataset.accent);
        popover.querySelectorAll("[data-accent]").forEach((b) =>
          b.setAttribute("aria-checked", String(b.dataset.accent === theme.accent)),
        );
        popover.querySelector(".vn-swatch-name").textContent =
          ACCENTS.find((a) => a.id === theme.accent)?.name ?? "";
      }
    });
    // Arrow keys move within each radio group.
    popover.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const group = event.target.closest('[role="radiogroup"]');
      if (!group) return;
      const items = [...group.querySelectorAll('[role="radio"]')];
      const i = items.indexOf(event.target);
      if (i < 0) return;
      event.preventDefault();
      const next = items[(i + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
      next.focus();
      next.click();
    });
    mount.append(backdrop, popover);
    position();
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey, true);
    popover.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  function ensureButton(root) {
    const row = root.querySelector(".main-header .header-controls-row");
    if (!row || row.querySelector(":scope > .vn-theme-btn")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vn-theme-btn";
    button.setAttribute("aria-label", "Appearance and accent color");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.title = "Appearance";
    button.innerHTML = ICONS.palette;
    button.addEventListener("click", () => open(button));
    row.append(button);
  }

  window.addEventListener("resize", position);

  return {
    ensureButton,
    dispose() {
      close({ restoreFocus: false });
      window.removeEventListener("resize", position);
      document.querySelectorAll(".vn-theme-btn").forEach((b) => b.remove());
    },
  };
}

/* ----------------------------------------------------- composer toolbar */

function createComposerBar(root) {
  let bar = null;
  let chip = null;
  let lastKey = "";
  let flashTimer = 0;

  const headerTrigger = () =>
    root.querySelector(".header-stats .model-chip-primary .chip-trigger");

  function build() {
    bar = document.createElement("div");
    bar.className = "vn-composer-bar";

    // One chip for the one popover: "✦ opus · ▂▄▆ High ⌄".
    chip = document.createElement("button");
    chip.type = "button";
    chip.className = "vn-chip vn-chip-runtime";
    chip.setAttribute("aria-haspopup", "dialog");
    chip.innerHTML =
      `${ICONS.sparkle}<span class="vn-chip-label vn-chip-model-label"></span>` +
      '<span class="vn-chip-sep" aria-hidden="true"></span>' +
      '<span class="vn-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      `<span class="vn-chip-label vn-chip-effort-label"></span>${ICONS.caret}`;
    chip.addEventListener("click", openRuntime);
    bar.append(chip);
  }

  function openRuntime() {
    const trigger = headerTrigger();
    if (!trigger || trigger.disabled) return;
    const box = chip.closest(".composer-box") || chip;
    const chipRect = chip.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - 320, chipRect.left - 4));
    html.style.setProperty("--vn-pop-left", `${Math.round(left)}px`);
    html.style.setProperty("--vn-pop-bottom", `${Math.round(window.innerHeight - boxRect.top + 8)}px`);
    trigger.click();
  }

  function sync() {
    const box = root.querySelector(".composer .composer-box");
    const trigger = headerTrigger();
    if (!box || !trigger) {
      bar?.remove();
      html.removeAttribute("data-vn-composer-bar");
      return;
    }
    if (!bar) build();
    if (bar.parentElement !== box) box.append(bar);
    html.setAttribute("data-vn-composer-bar", "");
    html.setAttribute("data-vn-runtime-anchor", "");

    const model = trigger.querySelector(".chip-label")?.textContent.trim() || "Auto";
    const level = trigger.getAttribute("data-effort-level") || "auto";
    const effort = EFFORT[level] ?? { label: level, bars: 2 };
    const disabled = trigger.disabled || trigger.getAttribute("aria-disabled") === "true";
    const expanded = trigger.getAttribute("aria-expanded") || "false";

    const modelLabel = chip.querySelector(".vn-chip-model-label");
    if (modelLabel.textContent !== model) modelLabel.textContent = model;
    const effortLabel = chip.querySelector(".vn-chip-effort-label");
    const effortText = level === "auto" ? "Auto effort" : effort.label;
    if (effortLabel.textContent !== effortText) effortLabel.textContent = effortText;
    chip.querySelectorAll(".vn-meter i").forEach((b, i) => b.classList.toggle("on", i < effort.bars));

    // Flash when the runtime actually changes (not on first render).
    const key = `${model}|${level}`;
    if (lastKey && key !== lastKey && !reducedMotion.matches) {
      chip.removeAttribute("data-vn-changed");
      void chip.offsetWidth;
      chip.setAttribute("data-vn-changed", "");
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => chip.removeAttribute("data-vn-changed"), 800);
    }
    lastKey = key;

    chip.setAttribute("aria-label", `Model ${model}, effort ${effort.label}. Change model and effort`);
    chip.title = disabled ? "Locked while a reply is running" : "Model and effort";
    chip.disabled = disabled;
    if (chip.getAttribute("aria-expanded") !== expanded) chip.setAttribute("aria-expanded", expanded);
  }

  return {
    sync,
    dispose() {
      bar?.remove();
      html.removeAttribute("data-vn-composer-bar");
      html.removeAttribute("data-vn-runtime-anchor");
    },
  };
}

/* --------------------------------------------------- floating composer */

function createFloatingComposer(root) {
  let main = null;
  let composer = null;
  const ro = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => measure());

  function measure() {
    if (!main || !composer) return;
    main.style.setProperty("--vn-composer-h", `${Math.ceil(composer.offsetHeight)}px`);
  }

  function sync() {
    if (!ro) return;
    const nextMain = root.querySelector("main.main");
    const nextComposer = nextMain?.querySelector(":scope > .composer");
    if (nextMain === main && nextComposer === composer) return;
    if (composer) ro.unobserve(composer);
    main?.removeAttribute("data-vn-float");
    main = nextMain;
    composer = nextComposer;
    if (!main || !composer) return;
    // Stay pinned to the bottom if we were there before the layout change.
    const scroller = main.querySelector(":scope > .chat-scroll");
    const atBottom = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8
      : false;
    measure();
    main.setAttribute("data-vn-float", "");
    ro.observe(composer);
    if (scroller && atBottom) scroller.scrollTop = scroller.scrollHeight;
  }

  return {
    sync,
    dispose() {
      ro?.disconnect();
      main?.removeAttribute("data-vn-float");
      main?.style.removeProperty("--vn-composer-h");
    },
  };
}

/* ------------------------------------------------------ exit animations */

// Preact removes overlays instantly. We let them leave gracefully by
// animating an inert clone for ~220ms after the real node is gone.
function createExitAnimations() {
  const rects = new WeakMap();

  function remember(node) {
    if (!(node instanceof Element)) return;
    const dialogs = node.matches?.("dialog.chip-popover")
      ? [node]
      : [...node.querySelectorAll?.("dialog.chip-popover") ?? []];
    for (const d of dialogs) {
      requestAnimationFrame(() => {
        if (d.isConnected && d.open) rects.set(d, d.getBoundingClientRect());
      });
    }
  }

  function ghost(el, kind) {
    if (reducedMotion.matches) return;
    const clone = el.cloneNode(true);
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    clone.removeAttribute("id");
    clone.setAttribute("data-vn-leaving", "");
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    clone.style.pointerEvents = "none";
    if (kind === "dialog") {
      const r = rects.get(el);
      if (!r) return;
      Object.assign(clone.style, {
        position: "fixed",
        inset: "auto",
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        margin: "0",
      });
    }
    document.body.append(clone);
    setTimeout(() => clone.remove(), kind === "dialog" ? 160 : 260);
  }

  function onRemoved(node) {
    if (!(node instanceof Element) || node.hasAttribute("data-vn-leaving")) return;
    const overlays = node.matches(".modal-overlay")
      ? [node]
      : [...node.querySelectorAll(".modal-overlay")];
    for (const o of overlays) if (!o.classList.contains("hidden")) ghost(o, "overlay");
    const dialogs = node.matches("dialog.chip-popover")
      ? [node]
      : [...node.querySelectorAll("dialog.chip-popover")];
    for (const d of dialogs) if (d.open) ghost(d, "dialog");
  }

  return { remember, onRemoved };
}

/* ------------------------------------------------ collapsible sidebar */

function createCollapsibleGroups(root) {
  const TOGGLE_ATTR = "data-vn-toggle";
  const COLLAPSED_ATTR = "data-vn-collapsed";
  let collapsed;
  try {
    const list = JSON.parse(read(KEYS.collapsed, "[]"));
    collapsed = new Set(Array.isArray(list) ? list : []);
  } catch {
    collapsed = new Set();
  }

  const rowsOf = (section) => section.querySelectorAll(":scope > .session-row");

  function labelOf(h3) {
    const clone = h3.cloneNode(true);
    clone.querySelectorAll(".vn-count").forEach((n) => n.remove());
    return clone.textContent.trim();
  }

  function sync(section, h3) {
    const search = root.querySelector(".sidebar-search-input");
    const searching = Boolean(search && search.value.trim());
    const isCollapsed = !searching && collapsed.has(labelOf(h3));
    section.toggleAttribute(COLLAPSED_ATTR, isCollapsed);
    if (h3.getAttribute("aria-expanded") !== String(!isCollapsed)) {
      h3.setAttribute("aria-expanded", String(!isCollapsed));
    }
    for (const row of rowsOf(section)) {
      if (isCollapsed) row.setAttribute("inert", "");
      else row.removeAttribute("inert");
    }
    let count = h3.querySelector(":scope > .vn-count");
    const n = String(rowsOf(section).length);
    if (!count) {
      count = document.createElement("span");
      count.className = "vn-count";
      count.setAttribute("aria-hidden", "true");
      h3.append(count);
    }
    if (count.textContent !== n) count.textContent = n;
  }

  function enhance() {
    for (const h3 of root.querySelectorAll(
      ".session-group > h3:not(.collapsible-session-group-heading)",
    )) {
      const section = h3.parentElement;
      if (!section || !rowsOf(section).length) continue;
      if (!h3.hasAttribute(TOGGLE_ATTR)) {
        h3.setAttribute(TOGGLE_ATTR, "");
        h3.setAttribute("role", "button");
        h3.setAttribute("tabindex", "0");
        h3.title = "Collapse or expand";
      }
      sync(section, h3);
    }
  }

  function toggle(h3) {
    const label = labelOf(h3);
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    write(KEYS.collapsed, JSON.stringify([...collapsed]));
    sync(h3.parentElement, h3);
  }

  function onClick(event) {
    const h3 = event.target.closest?.(`h3[${TOGGLE_ATTR}]`);
    if (!h3 || !root.contains(h3)) return;
    event.preventDefault();
    toggle(h3);
  }

  function onKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const h3 = event.target.closest?.(`h3[${TOGGLE_ATTR}]`);
    if (!h3 || !root.contains(h3)) return;
    event.preventDefault();
    toggle(h3);
  }

  function onInput(event) {
    if (event.target.matches?.(".sidebar-search-input")) enhance();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  root.addEventListener("input", onInput);

  return {
    enhance,
    dispose() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("input", onInput);
    },
  };
}

/* --------------------------------------------------- hub agents section */

// Gives each Hub agent an avatar (icon guessed from its name, colour from a
// stable hash) and adds a List / Dock layout toggle to the section.
function createAgentSection(root) {
  const KINDS = [
    [/local|mac|laptop|book/i, "laptop"],
    [/cloud|droplet|vps|aws|gcp|\bdo\b/i, "cloud"],
    [/\bdv\b|^dv-|docker|container|box/i, "box"],
    [/assist|bot|\bai\b|llm|claude|gpt|copilot|agent/i, "sparkle"],
    [/home|lab|nas|\bpi\b|raspberry/i, "home"],
    [/server|prod|srv|node|host/i, "server"],
  ];
  let dock = read(KEYS.agentLayout, "list") === "dock";

  function initials(name) {
    const parts = name.split(/[\s_-]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
    return letters.toUpperCase();
  }

  function decorate(link) {
    const nameEl = link.querySelector(".hub-agent-name");
    const icon = link.querySelector(".hub-agent-icon");
    if (!nameEl || !icon) return;
    const name = nameEl.textContent.trim();
    if (icon.dataset.vnName === name) return;
    const kind = KINDS.find(([re]) => re.test(name))?.[1] ?? "monogram";
    icon.dataset.vnName = name;
    icon.dataset.vnKind = kind;
    icon.dataset.vnInitials = initials(name);
    if (!link.title) link.title = name;
  }

  function ensureToggle(section) {
    let btn = section.querySelector(":scope > .vn-agent-layout-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vn-agent-layout-btn";
      btn.addEventListener("click", () => {
        hideTip();
        dock = !dock;
        write(KEYS.agentLayout, dock ? "dock" : "list");
        sync();
      });
      section.append(btn);
    }
    const label = dock ? "Show agents as a list" : "Show agents as a dock";
    if (btn.getAttribute("aria-label") !== label) {
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.setAttribute("aria-pressed", String(dock));
      btn.innerHTML = dock
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6" fill="currentColor"/><circle cx="4" cy="12" r=".6" fill="currentColor"/><circle cx="4" cy="18" r=".6" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>';
    }
  }

  // Tile colour = the accent that agent's own chat uses (same lookup the
  // node runs for itself). Deep "light" value + bright "dark" value make a
  // gradient that keeps the white glyph legible in either scheme.
  function paintTile(link) {
    const icon = link.querySelector(".hub-agent-icon");
    const id = link.closest(".hub-agent-row")?.dataset.reorderId;
    if (!icon || !id) return;
    const accentId = nodeAccent(id);
    if (icon.dataset.vnAccent === accentId) return;
    const a = ACCENTS.find((x) => x.id === accentId) ?? ACCENTS[0];
    icon.dataset.vnAccent = accentId;
    icon.style.setProperty("--vn-tile-a", a.dark);
    icon.style.setProperty("--vn-tile-b", a.light);
  }

  function sync() {
    for (const section of root.querySelectorAll(".hub-agent-group")) {
      section.toggleAttribute("data-vn-dock", dock);
      ensureToggle(section);
      for (const link of section.querySelectorAll(".hub-agent-link")) {
        decorate(link);
        paintTile(link);
      }
    }
  }

  // Dock tooltips. Fixed-position and appended to <body> so the sidebar's
  // scroll container can't clip them. Shown on hover and keyboard focus.
  let tip = null;
  let tipFor = null;
  let tipTimer = 0;

  function dockLinkFrom(target) {
    const link = target?.closest?.(".hub-agent-group[data-vn-dock] .hub-agent-link");
    return link && root.contains(link) ? link : null;
  }

  function showTip(link, immediate) {
    clearTimeout(tipTimer);
    const name = link.querySelector(".hub-agent-name")?.textContent.trim();
    if (!name) return;
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "vn-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.id = "vn-agent-tooltip";
      document.body.append(tip);
    }
    const notes = [];
    if (link.getAttribute("aria-current") === "true") notes.push("You're here");
    if (link.querySelector(".hub-agent-attention")) notes.push("Needs attention");
    tip.innerHTML = "";
    const title = document.createElement("span");
    title.className = "vn-tooltip-title";
    title.textContent = name;
    tip.append(title);
    if (notes.length) {
      const sub = document.createElement("span");
      sub.className = "vn-tooltip-sub";
      sub.textContent = notes.join(" · ");
      tip.append(sub);
    }
    // The native title would double up with ours.
    if (link.title) {
      link.dataset.vnTitle = link.title;
      link.removeAttribute("title");
    }
    link.setAttribute("aria-describedby", tip.id);
    tipFor = link;

    const r = link.getBoundingClientRect();
    tip.removeAttribute("data-open");
    tip.style.visibility = "hidden";
    tip.style.display = "flex";
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const below = r.top - h - 10 < 8;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(below ? r.bottom + 10 : r.top - h - 10)}px`;
    tip.style.setProperty("--vn-tip-arrow", `${Math.round(r.left + r.width / 2 - left)}px`);
    tip.dataset.side = below ? "bottom" : "top";
    tip.style.visibility = "";
    // Small intent delay on first hover; instant when gliding between tiles.
    const open = () => tip.setAttribute("data-open", "");
    if (immediate) requestAnimationFrame(open);
    else tipTimer = setTimeout(open, 120);
  }

  let lastHidden = 0;

  function hideTip() {
    clearTimeout(tipTimer);
    if (!tip) return;
    if (tip.hasAttribute("data-open")) lastHidden = performance.now();
    tip.removeAttribute("data-open");
    if (tipFor) {
      tipFor.removeAttribute("aria-describedby");
      if (tipFor.dataset.vnTitle && !dock) tipFor.title = tipFor.dataset.vnTitle;
    }
    tipFor = null;
  }

  const onOver = (event) => {
    const link = dockLinkFrom(event.target);
    // Gliding tile to tile (tip open, or closed <300ms ago) skips the delay.
    const gliding = Boolean(tip?.hasAttribute("data-open")) || performance.now() - lastHidden < 300;
    if (link && link !== tipFor) showTip(link, gliding);
  };
  const onOut = (event) => {
    const link = dockLinkFrom(event.target);
    if (link && !link.contains(event.relatedTarget)) hideTip();
  };
  const onFocusIn = (event) => {
    const link = dockLinkFrom(event.target);
    if (link) showTip(link, true);
  };
  const onFocusOut = (event) => {
    if (dockLinkFrom(event.target)) hideTip();
  };
  const onKeyTip = (event) => event.key === "Escape" && hideTip();
  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerout", onOut);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("pointerdown", hideTip);
  document.addEventListener("keydown", onKeyTip);
  window.addEventListener("scroll", hideTip, true);

  // Repaint when this node's accent changes, or another tab/node changes its.
  const onAccent = () => sync();
  const onStorage = (event) => {
    if (!event.key || event.key.startsWith(KEYS.accent)) sync();
  };
  document.addEventListener("vn:accent-change", onAccent);
  window.addEventListener("storage", onStorage);

  return {
    sync,
    toggleDock() {
      hideTip();
      dock = !dock;
      write(KEYS.agentLayout, dock ? "dock" : "list");
      sync();
    },
    dispose() {
      document.removeEventListener("vn:accent-change", onAccent);
      window.removeEventListener("storage", onStorage);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("pointerdown", hideTip);
      document.removeEventListener("keydown", onKeyTip);
      window.removeEventListener("scroll", hideTip, true);
      hideTip();
      tip?.remove();
      root.querySelectorAll(".vn-agent-layout-btn").forEach((b) => b.remove());
      root.querySelectorAll(".hub-agent-group").forEach((s) => s.removeAttribute("data-vn-dock"));
    },
  };
}

/* ----------------------------------------------------------- activate */

export async function activate(api) {
  const root = api.root || document.getElementById("root");
  const mount = api.mount || document.body;
  setApiPrefix(api.getContext?.().prefix ?? "");
  await loadLocalConfig();

  const theme = createTheme();
  const picker = createThemePicker(theme, mount);
  const groups = createCollapsibleGroups(root);
  const bar = createComposerBar(root);
  const floating = createFloatingComposer(root);
  const exits = createExitAnimations();
  const agents = createAgentSection(root);
  const thread = createThread(root);
  const extras = createComposerExtras(root, api);
  const palette = createPalette(root, { theme, thread, toggleAgentDock: agents.toggleDock });
  const notifier = createTabNotifier(root);
  const favicon = createNodeFavicon(root);

  // Whole-UI pass: idempotent and cheap per call, but it walks the thread,
  // so it is throttled while a reply streams (see the observer below).
  function tick() {
    groups.enhance();
    agents.sync();
    favicon.sync();
    picker.ensureButton(root);
    bar.sync();
    floating.sync();
    extras.sync();
    thread.sync();
    palette.sync();
    watchTrigger();
  }

  // Mutations inside the transcript are frequent while streaming. New nodes
  // there are decorated directly; the full pass runs at most every 250ms.
  // Anything outside the transcript gets the full pass on the next frame.
  const pending = new Set();
  let frame = 0;
  let fullSoon = false;
  let lastFull = 0;
  let throttle = 0;

  function flush() {
    frame = 0;
    for (const n of pending) if (n.isConnected) thread.process(n);
    pending.clear();
    const now = performance.now();
    if (fullSoon || now - lastFull > 250) {
      fullSoon = false;
      lastFull = now;
      tick();
    } else if (!throttle) {
      throttle = setTimeout(() => {
        throttle = 0;
        lastFull = performance.now();
        tick();
      }, 250);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.removedNodes.forEach((n) => exits.onRemoved(n));
      for (const n of r.addedNodes) {
        exits.remember(n);
        if (n.nodeType === 1) pending.add(n);
      }
      const t = r.target;
      if (!(t instanceof Element) || !t.closest(".messages")) fullSoon = true;
    }
    frame ||= requestAnimationFrame(flush);
  });

  // Attribute changes on the runtime trigger (label, effort, lock state).
  const attrObserver = new MutationObserver(() => bar.sync());
  let watchedTrigger = null;
  const watchTrigger = () => {
    const t = root.querySelector(".header-stats .model-chip-primary .chip-trigger");
    if (t === watchedTrigger) return;
    attrObserver.disconnect();
    watchedTrigger = t;
    if (t) {
      attrObserver.observe(t, {
        attributes: true,
        attributeFilter: ["aria-expanded", "data-effort-level", "disabled", "aria-label"],
        characterData: true,
        subtree: true,
      });
    }
  };

  thread.process(root);
  tick();
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    attrObserver.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(throttle);
    groups.dispose();
    agents.dispose();
    picker.dispose();
    bar.dispose();
    floating.dispose();
    thread.dispose();
    extras.dispose();
    palette.dispose();
    notifier.dispose();
    favicon.dispose();
    theme.dispose();
  };
}
