// ⌘K command palette: chats, agents, slash commands, and UI actions in one
// keyboard-driven list. Every action goes through the app's own controls.

import { ACCENTS, el, reducedMotion } from "./util.js";
import { composerText, setComposerText } from "./thread.js";

// Slash commands from the app. `run` = execute immediately (only when the
// composer is empty); otherwise the command is placed in the composer.
const COMMANDS = [
  ["/new", "Start a new chat", true],
  ["/model", "Choose a model", true],
  ["/effort", "Choose reasoning effort", true],
  ["/shell", "Open an interactive terminal", true],
  ["/skills", "Browse available skills", true],
  ["/stats", "Session and subagent usage statistics", true],
  ["/mcp", "Manage MCP servers", true],
  ["/approvals", "Change tool approval mode", true],
  ["/worktree", "Choose a worktree", true],
  ["/paths", "Open conversation paths", true],
  ["/pin", "Pin or unpin this conversation", true],
  ["/commit", "Review, stage, and create a Git commit", true],
  ["/rename", "Rename this conversation", false],
  ["/side", "Ask a side question without interrupting", false],
  ["/thread", "Start a related conversation", false],
  ["/goal", "Set or manage a session goal", false],
  ["/fork", "Parallel continuation from the last safe point", false],
  ["/compact", "Compact conversation context", false],
  ["/archive", "Archive or restore this conversation", false],
  ["/undo", "Remove the latest turn and restore its prompt", false],
  ["/redo", "Restore the last undone turn", false],
];

const ICON = {
  chat: '<path d="M5 18.5V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9z"/>',
  agent: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M8 20h8M12 16v4"/>',
  command: '<path d="m7 8-4 4 4 4M17 8l4 4-4 4M14 4l-4 16"/>',
  action: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
};

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// Subsequence fuzzy match. Returns { score, marks } or null.
function fuzzy(query, text) {
  if (!query) return { score: 0, marks: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) {
    const marks = [...Array(q.length)].map((_, i) => direct + i);
    return { score: 1000 - direct * 2 - (t.length - q.length) * 0.1 + (direct === 0 ? 200 : 0), marks };
  }
  let ti = 0;
  const marks = [];
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti < 0) return null;
    marks.push(ti++);
  }
  const spread = marks[marks.length - 1] - marks[0];
  return { score: 500 - spread * 3 - marks[0], marks };
}

function highlight(text, marks) {
  if (!marks.length) return el("span", { text });
  const span = el("span");
  const set = new Set(marks);
  let buf = "";
  let inMark = false;
  const flush = () => {
    if (!buf) return;
    span.append(inMark ? el("mark", { text: buf }) : document.createTextNode(buf));
    buf = "";
  };
  [...text].forEach((ch, i) => {
    const m = set.has(i);
    if (m !== inMark) {
      flush();
      inMark = m;
    }
    buf += ch;
  });
  flush();
  return span;
}

export function createPalette(root, { theme, thread, toggleAgentDock }) {
  let overlay = null;
  let input = null;
  let list = null;
  let items = [];
  let index = 0;
  let restoreFocus = null;
  let disposed = false;
  let actionGeneration = 0;
  let actionTimer = null;
  let handoffFrame = null;

  function cancelPendingAction() {
    actionGeneration++;
    clearTimeout(actionTimer);
    cancelAnimationFrame(handoffFrame);
    actionTimer = null;
    handoffFrame = null;
  }

  const click = (sel) => () => root.querySelector(sel)?.click();

  function runCommand(cmd, immediate) {
    const draft = composerText(root);
    if (immediate && !draft.trim()) {
      thread.runSlash(cmd);
    } else {
      setComposerText(root, draft.trim() ? `${cmd} ${draft}` : `${cmd} `);
    }
  }

  function collect() {
    const out = [];

    // Actions
    const actions = [
      ["New chat", "", click("#newChatBtn")],
      ["Open settings", "", () => {
        // The native modal remembers the focused element as its return target.
        // Restore the palette's origin before opening it, not the departing input
        // (or body under reduced motion). The native trigger can be hidden on mobile.
        if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
        root.querySelector("#settingsBtn")?.click();
      }],
      ["Open widgets", "", click("#widgetsOpenBtn")],
      ["Toggle sidebar", "", () => (root.querySelector("#sidebarPanelToggleBtn") || root.querySelector("#sidebarToggleBtn") || root.querySelector("#mobileMenuBtn"))?.click()],
      ["Toggle file changes panel", "", click("#diffToggleBtn")],
      ["Focus message box", "", () => root.querySelector(".composer .prompt")?.focus()],
      ["Change model and effort", "", click(".vn-chip-runtime")],
      ["Toggle agents dock", "", () => toggleAgentDock?.()],
    ];
    for (const [title, hint, run] of actions) {
      if (title === "Open widgets" && !root.querySelector("#widgetsOpenBtn:not(.hidden)")) continue;
      if (title === "Toggle file changes panel" && !root.querySelector("#diffToggleBtn")) continue;
      if (title === "Toggle agents dock" && !root.querySelector(".hub-agent-group")) continue;
      out.push({ group: "Actions", icon: "action", title, hint, run });
    }

    // Appearance
    for (const [id, name] of [["system", "System"], ["light", "Light"], ["dark", "Dark"]]) {
      out.push({ group: "Appearance", icon: "theme", title: `Appearance: ${name}`, hint: theme.scheme === id ? "current" : "", run: () => theme.setScheme(id) });
    }
    out.push({
      group: "Appearance", icon: "theme",
      title: theme.type === "compact" ? "Text size: Comfortable" : "Text size: Compact",
      run: () => theme.setType(theme.type === "compact" ? "comfortable" : "compact"),
    });
    for (const a of ACCENTS) {
      out.push({ group: "Appearance", icon: "theme", swatch: a.dark, title: `Accent: ${a.name}`, hint: theme.accent === a.id ? "current" : "", run: () => theme.setAccent(a.id) });
    }

    // Chats (as loaded in the sidebar)
    const seen = new Set();
    for (const btn of root.querySelectorAll(".sidebar .session-row .session-btn")) {
      const title = btn.querySelector(".session-title")?.textContent.trim();
      if (!title) continue;
      const meta = btn.querySelector(".session-meta")?.textContent.trim() ?? "";
      const key = `${title}|${meta}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ group: "Chats", icon: "chat", title, hint: meta, current: btn.classList.contains("active"), run: () => btn.click() });
    }

    // Agents (Hub)
    for (const link of root.querySelectorAll(".hub-agent-link")) {
      const title = link.querySelector(".hub-agent-name")?.textContent.trim();
      if (!title) continue;
      const here = link.getAttribute("aria-current") === "true";
      out.push({ group: "Agents", icon: "agent", title, hint: here ? "here" : "Switch agent", current: here, run: () => link.click() });
    }

    // Slash commands
    for (const [cmd, desc, immediate] of COMMANDS) {
      out.push({ group: "Commands", icon: "command", title: cmd, hint: desc, mono: true, run: () => runCommand(cmd, immediate) });
    }
    return out;
  }

  function render() {
    const q = input.value.trim();
    const all = collect();
    let ranked;
    if (!q) {
      // A short, useful default view.
      const take = (g, n) => all.filter((i) => i.group === g).slice(0, n);
      ranked = [...take("Chats", 6), ...take("Agents", 8), ...take("Actions", 6), ...take("Commands", 5)]
        .map((i) => ({ ...i, marks: [] }));
    } else {
      ranked = all
        .map((i) => {
          const m = fuzzy(q, i.title) ?? (i.hint ? fuzzy(q, i.hint) : null);
          if (!m) return null;
          const onTitle = Boolean(fuzzy(q, i.title));
          return { ...i, score: m.score - (onTitle ? 0 : 300), marks: onTitle ? m.marks : [] };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);
      ranked.push({
        group: "Search", icon: "search", title: `Search all chats for “${q}”`, marks: [],
        run: () => {
          const sidebar = root.querySelector(".sidebar");
          const menu = root.querySelector("#mobileMenuBtn");
          // Use the app's controls so its overlay/focus state stays in sync.
          if (sidebar?.classList.contains("collapsed")) root.querySelector("#sidebarToggleBtn")?.click();
          if (menu?.getClientRects().length && !sidebar?.classList.contains("open")) menu.click();
          // The native mobile overlay schedules its own focus on the next
          // frame. Hand off after that, and re-query in case the app rendered.
          const generation = actionGeneration;
          handoffFrame = requestAnimationFrame(() => {
            handoffFrame = null;
            if (disposed || generation !== actionGeneration) return;
            handoffFrame = requestAnimationFrame(() => {
              handoffFrame = null;
              if (disposed || generation !== actionGeneration) return;
              const s = root.querySelector(".sidebar-search-input");
              if (!s) return;
              s.value = q;
              s.dispatchEvent(new Event("input", { bubbles: true }));
              s.focus();
            });
          });
        },
      });
    }
    // Group, preserving rank order within groups.
    const order = [];
    const groups = new Map();
    for (const item of ranked) {
      if (!groups.has(item.group)) {
        groups.set(item.group, []);
        order.push(item.group);
      }
      groups.get(item.group).push(item);
    }
    items = order.flatMap((g) => groups.get(g));
    index = Math.min(index, Math.max(0, items.length - 1));

    list.replaceChildren();
    let n = 0;
    for (const g of order) {
      list.append(el("div", { class: "vn-pal-group", role: "presentation", text: g }));
      for (const item of groups.get(g)) {
        const i = n++;
        const row = el("div", {
          class: "vn-pal-item",
          role: "option",
          id: `vn-pal-${i}`,
          "aria-selected": String(i === index),
          "data-current": item.current ? "" : null,
        }, [
          el("span", { class: "vn-pal-icon", html: item.swatch ? "" : svg(ICON[item.icon] ?? ICON.action) }),
          el("span", { class: `vn-pal-title${item.mono ? " is-mono" : ""}` }, [highlight(item.title, item.marks ?? [])]),
          item.hint ? el("span", { class: "vn-pal-hint", text: item.hint }) : null,
        ]);
        if (item.swatch) row.querySelector(".vn-pal-icon").style.setProperty("--sw", item.swatch);
        if (item.swatch) row.querySelector(".vn-pal-icon").classList.add("is-swatch");
        row.addEventListener("pointermove", () => select(i, false));
        row.addEventListener("click", () => choose(i));
        list.append(row);
      }
    }
    if (!items.length) list.append(el("div", { class: "vn-pal-empty", text: "No matches" }));
    input.setAttribute("aria-activedescendant", items.length ? `vn-pal-${index}` : "");
  }

  function select(i, scroll = true) {
    if (i === index) return;
    list.querySelector(`#vn-pal-${index}`)?.setAttribute("aria-selected", "false");
    index = i;
    const row = list.querySelector(`#vn-pal-${index}`);
    row?.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", `vn-pal-${index}`);
    if (scroll) row?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const item = items[i];
    if (!item || disposed) return;
    close(false);
    const generation = actionGeneration;
    // Let the palette leave before the action opens its own UI. Reopening or
    // disposing the palette supersedes the action, including its focus handoff.
    actionTimer = setTimeout(() => {
      actionTimer = null;
      if (!disposed && generation === actionGeneration) item.run();
    }, 30);
  }

  function onKey(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % Math.max(1, items.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + items.length) % Math.max(1, items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  function open() {
    if (disposed) return;
    cancelPendingAction();
    if (overlay) return close();
    restoreFocus = document.activeElement;
    index = 0;
    input = el("input", {
      class: "vn-pal-input",
      type: "text",
      placeholder: "Search chats, agents, commands…",
      "aria-label": "Command palette",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": "vn-pal-list",
      autocomplete: "off",
      spellcheck: "false",
    });
    list = el("div", { class: "vn-pal-list", id: "vn-pal-list", role: "listbox" });
    const panel = el("div", { class: "vn-pal", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" }, [
      el("div", { class: "vn-pal-search" }, [el("span", { class: "vn-pal-search-icon", html: svg(ICON.search) }), input, el("kbd", { class: "vn-kbd", text: "esc" })]),
      list,
      el("div", { class: "vn-pal-foot" }, [
        el("span", {}, [el("kbd", { class: "vn-kbd", text: "↑↓" }), " navigate"]),
        el("span", {}, [el("kbd", { class: "vn-kbd", text: "↵" }), " open"]),
        el("span", {}, [el("kbd", { class: "vn-kbd", text: "⌘K" }), " toggle"]),
      ]),
    ]);
    overlay = el("div", { class: "vn-pal-overlay" }, [panel]);
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close();
    });
    input.addEventListener("input", () => {
      index = 0;
      render();
    });
    input.addEventListener("keydown", onKey);
    document.body.append(overlay);
    render();
    input.focus();
  }

  function close(restore = true) {
    cancelPendingAction();
    if (!overlay) return;
    const o = overlay;
    overlay = null;
    if (reducedMotion.matches) o.remove();
    else {
      o.setAttribute("data-leaving", "");
      setTimeout(() => o.remove(), 160);
    }
    if (restore && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  }

  // ⌘K / Ctrl+K. Capture phase so it wins over the app's ⌘K (Widgets),
  // which stays reachable as "Open widgets" in the palette.
  const onGlobalKey = (event) => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (mod && !event.altKey && !event.shiftKey && (event.key === "k" || event.key === "K")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }
  };
  window.addEventListener("keydown", onGlobalKey, true);

  // Discoverability: a ⌘K hint inside the sidebar search field.
  function ensureHint() {
    const wrap = root.querySelector(".sidebar-search-wrap");
    if (!wrap || wrap.querySelector(":scope > .vn-search-kbd")) return;
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const hint = el("button", { type: "button", class: "vn-search-kbd", title: "Command palette", "aria-label": "Open command palette", text: mac ? "⌘K" : "Ctrl K" });
    hint.addEventListener("click", open);
    wrap.append(hint);
  }

  return {
    open,
    sync: ensureHint,
    dispose() {
      disposed = true;
      window.removeEventListener("keydown", onGlobalKey, true);
      close(false);
      root.querySelectorAll(".vn-search-kbd").forEach((n) => n.remove());
    },
  };
}
