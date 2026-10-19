// Background-tab signal: when a reply finishes (or the agent needs you)
// while this tab is hidden, badge the favicon and prefix the title.
// Cleared as soon as the tab is visible again.

import { isRunning } from "./util.js";

const PREFIX = { done: "● ", input: "◐ " };
const COLOR = { done: "#22c55e", input: "#f59e0b" };

export function createTabNotifier(root) {
  let wasRunning = isRunning(root);
  let state = null; // null | "done" | "input"
  let iconLink = null;
  let originalHref = null;
  let badgeCache = {};
  let timer = 0;

  function needsInput() {
    return Boolean(
      root.querySelector(".interaction-attention-banner, .approval-modal, .ask-user-question") ||
      root.querySelector(".session-row.is-input-required .session-btn.active"),
    );
  }

  async function badgeHref(kind) {
    if (badgeCache[kind]) return badgeCache[kind];
    iconLink ??= document.querySelector('link[rel="icon"]');
    if (!iconLink) return null;
    originalHref ??= iconLink.href;
    const img = new Image();
    img.src = originalHref;
    await img.decode().catch(() => {});
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (img.naturalWidth) ctx.drawImage(img, 0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size - 15, size - 15, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size - 15, size - 15, 10, 0, Math.PI * 2);
    ctx.fillStyle = COLOR[kind];
    ctx.fill();
    badgeCache[kind] = canvas.toDataURL("image/png");
    return badgeCache[kind];
  }

  async function setState(next) {
    if (next === state) return;
    state = next;
    if (!next) {
      if (iconLink && originalHref) iconLink.href = originalHref;
      for (const p of Object.values(PREFIX)) {
        if (document.title.startsWith(p)) document.title = document.title.slice(p.length);
      }
      return;
    }
    const href = await badgeHref(next);
    if (state === next && href && iconLink) iconLink.href = href;
    applyTitle();
  }

  function applyTitle() {
    if (!state) return;
    let t = document.title;
    for (const p of Object.values(PREFIX)) if (t.startsWith(p)) t = t.slice(p.length);
    const want = PREFIX[state] + t;
    if (document.title !== want) document.title = want;
  }

  function check() {
    const running = isRunning(root);
    if (document.hidden) {
      if (needsInput()) setState("input");
      else if (wasRunning && !running) setState("done");
      else if (state) applyTitle(); // the app may have rewritten the title
    }
    wasRunning = running;
  }

  const onVisible = () => {
    if (!document.hidden) setState(null);
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  timer = setInterval(check, 700);

  return {
    sync: check,
    dispose() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      setState(null);
    },
  };
}
