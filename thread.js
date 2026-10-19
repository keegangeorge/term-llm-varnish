// Thread enhancements: code block headers, tool timeline, user message
// actions, jump-to-latest, and a richer empty state.
//
// Everything here decorates app-rendered nodes with attributes or appends
// small self-owned elements; nothing app-owned is moved or rewritten.

import { KEYS, read, write, el, isRunning, formatDuration, reducedMotion } from "./util.js";

const SVG = {
  wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4"/><path d="m15 16-2 2 2 2"/><path d="M4 18h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};

const LANG_ALIASES = {
  js: "javascript", ts: "typescript", rb: "ruby", py: "python", sh: "shell",
  bash: "bash", zsh: "zsh", yml: "yaml", md: "markdown", text: "text",
  plaintext: "text", gjs: "glimmer", hbs: "handlebars",
};

// Tool name -> icon kind used by the timeline (CSS draws the glyph).
const TOOL_KINDS = [
  [/^(shell|bash|exec|run|terminal)/, "terminal"],
  [/(read_file|read|view_file|cat)/, "file"],
  [/(write_file|edit_file|create_file|apply_patch|patch|edit)/, "edit"],
  [/(grep|glob|search_files|find)/, "search"],
  [/(web_search|read_url|fetch|browse|http)/, "globe"],
  [/(image|media|screenshot|view_image)/, "image"],
  [/(delegate|spawn|agent|hub_)/, "agent"],
  [/(ask_user|question)/, "ask"],
  [/(workspace|folder|dir)/, "folder"],
  [/(memory|remember)/, "memory"],
  [/(skill)/, "skill"],
];

/* ------------------------------------------------------- composer text */

// Replace the composer's text through the app's own input handler, so its
// state (signals, drafts, autosize) stays in sync.
export function setComposerText(root, text, { focus = true } = {}) {
  const ta = root.querySelector(".composer .prompt");
  if (!ta) return false;
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  if (focus) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(text.length, text.length);
  }
  return true;
}

export function composerText(root) {
  return root.querySelector(".composer .prompt")?.value ?? "";
}

/* ---------------------------------------------------------- thread */

export function createThread(root) {
  let defaultWrap = read(KEYS.codeWrap, "0") === "1";

  /* --- code blocks --------------------------------------------------- */

  function langOf(code) {
    const cls = [...code.classList].find((c) => c.startsWith("language-"));
    const raw = cls ? cls.slice(9) : "";
    return LANG_ALIASES[raw] ?? (raw || "text");
  }

  function decorateCode(pre) {
    if (pre.hasAttribute("data-vn-code")) return;
    const code = pre.querySelector(":scope > code");
    if (!code || pre.closest(".tool-group, .shell-overlay, .diff-sidebar")) return;
    pre.setAttribute("data-vn-code", "");
    pre.toggleAttribute("data-vn-wrap", defaultWrap);
    const wrapBtn = el("button", {
      type: "button",
      class: "vn-code-btn vn-code-wrap",
      "aria-pressed": String(defaultWrap),
      "aria-label": "Wrap long lines",
      title: "Wrap long lines",
      html: SVG.wrap,
    });
    wrapBtn.addEventListener("click", () => {
      const on = !pre.hasAttribute("data-vn-wrap");
      pre.toggleAttribute("data-vn-wrap", on);
      wrapBtn.setAttribute("aria-pressed", String(on));
      defaultWrap = on;
      write(KEYS.codeWrap, on ? "1" : "0");
    });
    const head = el("div", { class: "vn-code-head" }, [
      el("span", { class: "vn-code-lang", text: langOf(code) }),
      wrapBtn,
    ]);
    pre.prepend(head);
  }

  /* --- tool timeline --------------------------------------------------- */

  function toolKind(name) {
    const n = name.toLowerCase();
    return TOOL_KINDS.find(([re]) => re.test(n))?.[1] ?? "dot";
  }

  function decorateToolEntry(entry) {
    const name = entry.querySelector(".tool-name")?.textContent.trim() ?? "";
    const kind = toolKind(name);
    if (entry.dataset.vnTool !== kind) entry.dataset.vnTool = kind;
  }

  function createdOf(node) {
    const v = Number(node?.dataset?.created);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function neighbourTime(node, dir) {
    let n = dir < 0 ? node.previousElementSibling : node.nextElementSibling;
    while (n) {
      const t = createdOf(n);
      if (t) return t;
      n = dir < 0 ? n.previousElementSibling : n.nextElementSibling;
    }
    return null;
  }

  // "Worked 1m 12s": time between the output before this tool group and the
  // output after it. Only shown for finished groups with both neighbours.
  function decorateToolGroup(group) {
    const toggle = group.querySelector(".tool-group-toggle");
    if (!toggle) return;
    const done = !group.querySelector(".tool-status:not(.done):not(.error)");
    const before = neighbourTime(group, -1);
    const after = neighbourTime(group, 1);
    let label = "";
    if (done && before && after && after > before) label = `Worked ${formatDuration(after - before)}`;
    if (toggle.dataset.vnWorked !== label) {
      if (label) toggle.dataset.vnWorked = label;
      else delete toggle.dataset.vnWorked;
    }
    group.querySelectorAll(".tool-group-entry").forEach(decorateToolEntry);
  }

  /* --- user message actions --------------------------------------------- */

  function lastUserMessage() {
    const all = root.querySelectorAll(".messages > .message.user");
    return all[all.length - 1] ?? null;
  }

  function flash(btn, ok) {
    btn.innerHTML = ok ? SVG.check : SVG.copy;
    btn.classList.toggle("is-done", ok);
    setTimeout(() => {
      btn.innerHTML = SVG.copy;
      btn.classList.remove("is-done");
    }, 1400);
  }

  function runSlash(command) {
    const ta = root.querySelector(".composer .prompt");
    if (!ta) return false;
    setComposerText(root, command);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    return true;
  }

  function editMessage(article) {
    const text = article.querySelector(".message-text")?.textContent ?? "";
    const isLast = article === lastUserMessage();
    if (isLast && !isRunning(root) && !composerText(root).trim()) {
      const ok = confirm(
        "Edit your last message?\n\nThis undoes the latest turn (your message and the reply) and puts your message back in the box so you can change it and resend.",
      );
      if (ok) runSlash("/undo");
      return;
    }
    // Older messages (or a busy composer): start a fresh message from it.
    const draft = composerText(root);
    if (draft.trim() && !confirm("Replace your current draft with this message?")) return;
    setComposerText(root, text);
  }

  function decorateUser(article) {
    if (article.querySelector(":scope > .vn-user-actions")) return;
    const copyBtn = el("button", {
      type: "button", class: "vn-msg-btn", "aria-label": "Copy message", title: "Copy", html: SVG.copy,
    });
    copyBtn.addEventListener("click", async () => {
      const text = article.querySelector(".message-text")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        flash(copyBtn, true);
      } catch {
        flash(copyBtn, false);
      }
    });
    const editBtn = el("button", {
      type: "button", class: "vn-msg-btn", "aria-label": "Edit message", html: SVG.edit,
    });
    editBtn.addEventListener("pointerenter", () => {
      editBtn.title = article === lastUserMessage() && !isRunning(root)
        ? "Edit and resend (undoes the latest turn)"
        : "Edit as a new message";
    });
    editBtn.addEventListener("click", () => editMessage(article));
    article.append(el("div", { class: "vn-user-actions" }, [copyBtn, editBtn]));
  }

  /* --- jump to latest ------------------------------------------------------ */

  let jump = null;
  let scroller = null;
  let main = null;
  let lastHeight = 0;

  function distanceFromBottom() {
    return scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : 0;
  }

  function updateJump() {
    if (!jump || !scroller) return;
    const away = distanceFromBottom() > 480;
    if (!away) jump.removeAttribute("data-new");
    jump.toggleAttribute("data-show", away);
    jump.tabIndex = away ? 0 : -1;
  }

  function onScroll() {
    updateJump();
  }

  function ensureJump() {
    const nextMain = root.querySelector("main.main");
    const nextScroller = nextMain?.querySelector(":scope > .chat-scroll");
    if (nextScroller !== scroller) {
      scroller?.removeEventListener("scroll", onScroll);
      scroller = nextScroller;
      scroller?.addEventListener("scroll", onScroll, { passive: true });
      lastHeight = scroller?.scrollHeight ?? 0;
    }
    if (!nextMain) return;
    if (!jump) {
      jump = el("button", { type: "button", class: "vn-jump", "aria-label": "Jump to latest", tabindex: "-1" }, [
        el("span", { class: "vn-jump-icon", html: SVG.down }),
        el("span", { class: "vn-jump-label", text: "Latest" }),
      ]);
      jump.addEventListener("click", () => {
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion.matches ? "auto" : "smooth" });
      });
    }
    if (nextMain !== main || jump.parentElement !== nextMain) {
      main = nextMain;
      main.append(jump);
    }
    // New content while scrolled away: say so.
    if (scroller) {
      const h = scroller.scrollHeight;
      if (h > lastHeight + 4 && distanceFromBottom() > 480) {
        jump.setAttribute("data-new", "");
        jump.querySelector(".vn-jump-label").textContent = "New messages";
      } else if (!jump.hasAttribute("data-new")) {
        jump.querySelector(".vn-jump-label").textContent = "Latest";
      }
      lastHeight = h;
    }
    updateJump();
  }

  /* --- empty state ----------------------------------------------------------- */

  const STARTERS = [
    { label: "Review a pull request", text: "Review this pull request: " },
    { label: "Run the specs", text: "Run the specs for " },
    { label: "Explain this codebase", text: "Give me a tour of this codebase: the main pieces and how they fit together." },
    { label: "Open a shell", command: "/shell" },
  ];

  function decorateEmpty(empty) {
    let extras = empty.querySelector(":scope > .vn-empty");
    if (!extras) {
      const starters = el("div", { class: "vn-starters", role: "list" },
        STARTERS.map((s) => {
          const b = el("button", { type: "button", class: "vn-starter", role: "listitem", text: s.label });
          b.addEventListener("click", () => {
            if (s.command) runSlash(s.command);
            else setComposerText(root, s.text);
          });
          return b;
        }),
      );
      extras = el("div", { class: "vn-empty" }, [
        starters,
        el("div", { class: "vn-recents-wrap" }, [
          el("span", { class: "vn-empty-label", text: "Jump back in" }),
          el("div", { class: "vn-recents" }),
        ]),
      ]);
      empty.append(extras);
    }
    // Recent chats mirror the sidebar (click goes through the real row).
    const rows = [...root.querySelectorAll(".sidebar .session-row .session-btn")]
      .filter((b) => b.querySelector(".session-title")?.textContent.trim())
      // Skip empty drafts ("0 messages"); they're not worth jumping back to.
      .filter((b) => !/^0 messages\b/.test(b.querySelector(".session-meta")?.textContent.trim() ?? ""))
      .slice(0, 4);
    const list = extras.querySelector(".vn-recents");
    const key = rows.map((b) => b.getAttribute("title") || "").join("|");
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(
      ...rows.map((btn) => {
        const title = btn.querySelector(".session-title")?.textContent.trim() ?? "";
        const meta = btn.querySelector(".session-meta")?.textContent.trim() ?? "";
        const card = el("button", { type: "button", class: "vn-recent" }, [
          el("span", { class: "vn-recent-title", text: title }),
          el("span", { class: "vn-recent-meta", text: meta }),
        ]);
        card.addEventListener("click", () => btn.click());
        return card;
      }),
    );
    extras.querySelector(".vn-recents-wrap").hidden = rows.length === 0;
  }

  /* --- entry points ------------------------------------------------------------ */

  // Decorate within a subtree (called for added nodes) .
  function process(node) {
    if (!(node instanceof Element)) return;
    const q = (sel) => (node.matches(sel) ? [node] : []).concat([...node.querySelectorAll(sel)]);
    q(".markdown-body pre").forEach(decorateCode);
    q(".tool-group").forEach(decorateToolGroup);
    q(".tool-group-entry").forEach(decorateToolEntry);
    q(".messages > .message.user").forEach(decorateUser);
  }

  // Cheap whole-view pass for things that depend on neighbours or layout.
  function sync() {
    root.querySelectorAll(".tool-group").forEach(decorateToolGroup);
    root.querySelectorAll(".messages > .message.user").forEach(decorateUser);
    const empty = root.querySelector(".messages > .empty-chat");
    if (empty) decorateEmpty(empty);
    ensureJump();
  }

  return {
    process,
    sync,
    runSlash,
    dispose() {
      scroller?.removeEventListener("scroll", onScroll);
      jump?.remove();
      root.querySelectorAll(".vn-code-head, .vn-user-actions, .vn-empty").forEach((n) => n.remove());
      root.querySelectorAll("[data-vn-code]").forEach((n) => n.removeAttribute("data-vn-code"));
    },
  };
}
