// Composer extras: a context-usage ring and Claude Code-style "ultrathink"
// rainbow highlighting (only when the provider is claude-bin).

import { el, formatTokens, currentProviderSync, loadProviders } from "./util.js";

const ULTRA = /\bultrathink\b/gi;

/* ---------------------------------------------------------- context ring */

const COMPACT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/></svg>';

// Set the composer text the way typing would, so the app's own input
// handler updates its state.
function setPrompt(ta, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(ta, value);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function createContextRing(root, api) {
  let ring = null;
  let compact = null;
  let compacting = false;
  let usage = api.getContextUsage?.() ?? null;
  const R = 7;
  const C = 2 * Math.PI * R;

  function build() {
    ring = el("button", { type: "button", class: "vn-context", "aria-label": "Context usage" });
    ring.innerHTML = `
      <svg class="vn-context-ring" viewBox="0 0 18 18" aria-hidden="true">
        <circle class="vn-context-track" cx="9" cy="9" r="${R}"/>
        <circle class="vn-context-fill" cx="9" cy="9" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg>
      <span class="vn-context-label"></span>
      <span class="vn-context-tip" role="tooltip"></span>`;
    // Keyboard/touch users get the details on focus/tap (CSS shows the tip).
    ring.addEventListener("click", () => ring.toggleAttribute("data-pinned"));
    ring.addEventListener("blur", () => ring.removeAttribute("data-pinned"));

    // Near the limit: one click runs the app's own /compact command.
    compact = el("button", {
      type: "button",
      class: "vn-compact",
      title: "Compact the conversation to free up context",
      "aria-label": "Compact conversation now",
      hidden: true,
    });
    compact.innerHTML = `${COMPACT_ICON}<span class="vn-compact-label">Compact</span>`;
    compact.addEventListener("click", compactNow);
  }

  // Runs /compact through the composer's own command path, then restores
  // whatever the user had typed. Attachments are never touched.
  async function compactNow() {
    const ta = root.querySelector(".composer .prompt");
    if (!ta || compacting) return;
    compacting = true;
    compact.disabled = true;
    const draft = ta.value;
    try {
      setPrompt(ta, "/compact");
      await nextFrame();
      const send = root.querySelector("#sendBtn");
      if (send && !send.disabled && !send.classList.contains("live")) send.click();
      await nextFrame();
      if (ta.value !== draft) setPrompt(ta, draft);
    } finally {
      compacting = false;
      compact.disabled = false;
      render();
    }
  }

  // Compaction cannot start while a reply runs or another compaction is
  // in progress (the app ignores it), so only offer it when it will work.
  function canCompact() {
    return !root.querySelector("#stopBtn") && !root.querySelector(".composer .compaction-status");
  }

  function render() {
    const bar = root.querySelector(".composer .vn-composer-bar");
    if (!bar) return;
    if (!ring) build();
    if (ring.parentElement !== bar) bar.append(ring);
    if (compact.nextElementSibling !== ring) ring.before(compact);

    const used = usage?.usedTokens ?? 0;
    const limit = usage?.inputLimit ?? 0;
    if (!usage || (!used && !limit)) {
      ring.hidden = true;
      compact.hidden = true;
      return;
    }
    ring.hidden = false;
    const pct = limit ? Math.min(100, (used / limit) * 100) : null;
    const level = pct == null ? "unknown" : pct >= 90 ? "critical" : pct >= 70 ? "warn" : "ok";
    ring.dataset.level = level;
    const fill = ring.querySelector(".vn-context-fill");
    fill.setAttribute("stroke-dashoffset", String(pct == null ? C : C * (1 - pct / 100)));
    const label = pct == null ? formatTokens(used) : `${Math.round(pct)}%`;
    ring.querySelector(".vn-context-label").textContent = label;

    const lines = [
      pct == null
        ? `${formatTokens(used)} tokens in context`
        : `${formatTokens(used)} of ${formatTokens(limit)} tokens (${Math.round(pct)}%)`,
    ];
    if (usage.cachedInputTokens) lines.push(`${formatTokens(usage.cachedInputTokens)} cached`);
    if (usage.estimated) lines.push("Estimated");
    const offerCompact = level === "critical" && (compacting || canCompact());
    compact.hidden = !offerCompact;
    if (level === "critical") lines.push(offerCompact ? "Near the limit" : "Near the limit: consider /compact");
    ring.querySelector(".vn-context-tip").textContent = lines.join(" · ");
    ring.setAttribute("aria-label", `Context usage: ${lines.join(", ")}`);
  }

  const off = api.onContextUsageChanged?.((u) => {
    usage = u;
    render();
  });

  return {
    sync: render,
    dispose() {
      if (typeof off === "function") off();
      ring?.remove();
      compact?.remove();
    },
  };
}

/* ------------------------------------------------------------- ultrathink */

const MIRROR_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch",
  "fontFeatureSettings", "fontVariationSettings", "fontKerning", "fontVariantLigatures",
  "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent",
  "textAlign", "direction", "tabSize", "whiteSpace", "wordBreak", "overflowWrap",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "boxSizing", "textRendering", "unicodeBidi",
];

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function createUltrathink(root) {
  let ta = null;
  let mirror = null;
  let inner = null;
  let active = false;
  let ro = null;
  let poll = 0;
  let lastValue = null;

  const supported = () => currentProviderSync()?.type === "claude-bin";

  function ensureMirror() {
    const box = ta.closest(".composer-box");
    if (!mirror) {
      mirror = el("div", { class: "vn-ultra-mirror", "aria-hidden": "true" });
      inner = el("div", { class: "vn-ultra-inner" });
      mirror.append(inner);
    }
    if (mirror.parentElement !== box) box.prepend(mirror);
  }

  function layout() {
    if (!active || !ta || !mirror) return;
    const cs = getComputedStyle(ta);
    for (const p of MIRROR_PROPS) mirror.style[p] = cs[p];
    mirror.style.borderStyle = "solid";
    mirror.style.borderColor = "transparent";
    const borderX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const scrollbar = ta.offsetWidth - ta.clientWidth - borderX;
    mirror.style.paddingRight = `${parseFloat(cs.paddingRight) + Math.max(0, scrollbar)}px`;
    mirror.style.width = `${ta.offsetWidth}px`;
    mirror.style.height = `${ta.offsetHeight}px`;
    mirror.style.left = `${ta.offsetLeft}px`;
    mirror.style.top = `${ta.offsetTop}px`;
    inner.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  function render() {
    if (!ta) return;
    const value = ta.value;
    ULTRA.lastIndex = 0;
    const hit = ULTRA.test(value);
    const want = hit && supported();
    if (want !== active) {
      active = want;
      ta.toggleAttribute("data-vn-ultra", active);
      ta.closest(".composer-box")?.toggleAttribute("data-vn-ultra", active);
      if (active) ensureMirror();
      if (mirror) mirror.hidden = !active;
      clearInterval(poll);
      // The app can change the value without an input event (send, /undo).
      if (active) poll = setInterval(render, 400);
    }
    if (!active) {
      lastValue = null;
      return;
    }
    if (value === lastValue) {
      layout();
      return;
    }
    lastValue = value;
    ULTRA.lastIndex = 0;
    const htmlText = escapeHtml(value).replace(ULTRA, (m) => `<span class="vn-ultra">${m}</span>`);
    // Trailing newline needs a glyph to keep the same height as the textarea.
    inner.innerHTML = `${htmlText}​`;
    layout();
  }

  function attach() {
    const next = root.querySelector(".composer .prompt");
    if (next === ta) return;
    if (ta) {
      ta.removeEventListener("input", render);
      ta.removeEventListener("scroll", layout);
      ro?.disconnect();
      ta.removeAttribute("data-vn-ultra");
    }
    ta = next;
    active = false;
    if (!ta) return;
    ta.addEventListener("input", render);
    ta.addEventListener("scroll", layout, { passive: true });
    ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(layout);
    ro?.observe(ta);
    render();
  }

  // Provider list loads once; re-evaluate when it arrives.
  loadProviders().then(render);
  document.fonts?.ready.then(layout);

  return {
    sync() {
      attach();
      render();
    },
    dispose() {
      clearInterval(poll);
      ro?.disconnect();
      ta?.removeAttribute("data-vn-ultra");
      ta?.closest(".composer-box")?.removeAttribute("data-vn-ultra");
      mirror?.remove();
    },
  };
}

export function createComposerExtras(root, api) {
  const ring = createContextRing(root, api);
  const ultra = createUltrathink(root);
  return {
    sync() {
      ring.sync();
      ultra.sync();
    },
    dispose() {
      ring.dispose();
      ultra.dispose();
    },
  };
}
