#!/usr/bin/env node
// Regenerates docs/screenshots/*.png with neutral demo content.
//
//   node tools/screenshots.mjs
//
// Runs against your local `term-llm serve` (same discovery as check.mjs).
// It opens an unsaved new chat and replaces everything visible (sidebar,
// thread, title, node name, project picker) with injected demo markup in
// the same structure the app renders, styled by the installed extension.
// Nothing is sent and none of your conversations appear in the images.

import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, "../docs/screenshots");
const SERVE = (() => {
  try {
    return execSync("ps -axo args", { encoding: "utf8" }).split("\n")
      .find((l) => /^(\S*\/)?term-llm serve\b/.test(l.trim())) ?? "";
  } catch {
    return "";
  }
})();
const START = process.env.VARNISH_URL || `http://localhost:${SERVE.match(/--port (\d+)/)?.[1] || "8080"}/`;
const TOKEN = process.env.TERM_LLM_TOKEN || SERVE.match(/--token (\S+)/)?.[1] || "";
const require = createRequire(process.env.PLAYWRIGHT_DIR || `${HERE}/`);
const { chromium } = require("playwright");
fs.mkdirSync(OUT, { recursive: true });

const base = (await fetch(START, { redirect: "follow" })).url;
const now = Date.now();
const min = 60_000;

const SESSIONS = [
  ["Today", [
    ["Refactor the billing worker", "18 messages · just now · payments-api", true],
    ["Why is the flaky spec flaky?", "9 messages · 25m ago · web-app"],
    ["Draft release notes for v2.4", "6 messages · 2h ago · Chat"],
  ]],
  ["Older", [
    ["Migrate cron jobs to the queue", "31 messages · 12 Oct · infra"],
    ["Tidy up the onboarding emails", "12 messages · 9 Oct · Chat"],
    ["Profile the search endpoint", "22 messages · 2 Oct · web-app"],
    ["Explain the auth middleware", "7 messages · 28 Sep · payments-api"],
  ]],
];

const AGENTS = [
  ["macbook", "macbook", "graphite", true, false],
  ["cloud", "cloud", "blue", false, true],
  ["docker-dev", "docker-dev", "green", false, false],
  ["assistant", "assistant", "pink", false, false],
];

const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>';

function sidebarHTML() {
  const agents = AGENTS.map(([id, name, , here, attention]) => `
    <div class="hub-agent-row" data-reorder-id="${id}"><a class="hub-agent-link" href="#" ${here ? 'aria-current="true"' : ""}>
      <span class="hub-agent-icon" aria-hidden="true"></span><span class="hub-agent-name">${name}</span>
      ${attention ? '<span class="hub-agent-attention" aria-hidden="true"></span>' : ""}</a>
      <div class="hub-agent-menu"><button class="hub-agent-menu-trigger" type="button">⋯</button></div></div>`).join("");
  const groups = SESSIONS.map(([label, rows]) => `
    <section class="session-group"><h3>${label}</h3>${rows.map(([title, meta, active]) => `
      <div class="session-row ${active ? "is-active" : ""}"><button class="session-btn ${active ? "active" : ""}" type="button" title="${title}">
        <span class="session-title">${title}</span><span class="session-meta">${meta}</span></button>
        <div class="session-row-menu"><button class="session-menu-trigger" type="button">⋯</button></div></div>`).join("")}
    </section>`).join("");
  return `
    <section class="session-group hub-agent-group">
      <h3 class="collapsible-session-group-heading"><button type="button" class="session-group-toggle" aria-expanded="true">
        <span class="session-group-chevron">${ICON_CHEVRON}</span><span>Agents</span></button></h3>
      <nav class="hub-agent-links reorder-list">${agents}</nav>
    </section>
    <div class="flat-session-date-groups sidebar-recent-groups">${groups}</div>`;
}

function threadHTML() {
  const t0 = now - 14 * min;
  const tool = (name, summary) => `
    <div class="tool-group-entry"><span class="tool-entry-icon" aria-hidden="true">•</span><div class="tool-group-entry-body">
      <article class="message tool tool-done"><div class="tool-card"><button class="tool-toggle" type="button" aria-expanded="false">
        <span class="tool-name">${name}</span><span class="tool-summary">${summary}</span><span class="tool-status done">✓</span>
      </button></div></article></div></div>`;
  return `
  <article class="message user" data-created="${t0}"><div class="message-body"><div class="message-text">The billing worker retries failed charges forever. Can you cap retries with exponential backoff and add a spec? ultrathink about edge cases.</div></div>
    <div class="message-meta"><time>14m</time></div></article>
  <article class="message assistant" data-created="${t0 + 40_000}"><div class="message-body"><div class="markdown-body">
    <p>I'll look at how retries are scheduled today, then add a capped backoff.</p></div></div></article>
  <div class="tool-group"><article class="tool-group-card"><button class="tool-group-toggle" type="button" aria-expanded="true">
    <span class="tool-arrow">${ICON_CHEVRON}</span><span class="tool-group-summary">4 tool calls · grep, read_file, edit_file, shell</span>
    <span class="tool-status done">✓</span></button>
    <div class="tool-group-details open">
      ${tool("grep", "pattern: retry_charge  path: app/workers")}
      ${tool("read_file", "app/workers/billing_worker.rb")}
      ${tool("edit_file", "app/workers/billing_worker.rb  +18 −4")}
      ${tool("shell", "command: bundle exec rspec spec/workers/billing_worker_spec.rb")}
    </div></article></div>
  <article class="message assistant" data-created="${t0 + 112_000}"><div class="message-body"><div class="markdown-body">
    <p>Retries are now capped at <strong>5 attempts</strong> with jittered exponential backoff. Charges that keep failing move to <code>failed_permanently</code> instead of looping.</p>
    <pre><code class="language-ruby hljs"><span class="hljs-keyword">def</span> <span class="hljs-title function_">retry_delay</span>(attempt)
  base = <span class="hljs-number">2</span>**attempt * <span class="hljs-number">30</span>
  base + rand(<span class="hljs-number">0</span>..base / <span class="hljs-number">4</span>) <span class="hljs-comment"># jitter so retries don't stampede</span>
<span class="hljs-keyword">end</span></code><button class="code-copy-btn" type="button" aria-label="Copy code">${ICON_COPY}</button></pre>
    <ul><li>Attempt counts live on the charge, so restarts don't reset them.</li><li>New spec covers the cap, the jitter range, and the permanent-failure path.</li></ul>
  </div></div>
  <div class="turn-action-panel"><button class="turn-action-btn" type="button">${ICON_COPY}</button></div>
  <div class="message-meta"><time>12m</time></div></article>`;
}

const browser = await chromium.launch();

async function setup({ width, height, scheme, mobile = false, thread = true }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme,
    isMobile: mobile, hasTouch: mobile,
    extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
  });
  await ctx.addInitScript((agents) => {
    localStorage.setItem("term_llm_selected_provider", "claude-bin");
    localStorage.setItem("term_llm_selected_model", "opus");
    for (const [id, , accent] of agents) localStorage.setItem(`term-llm:varnish:accent:${id}`, accent);
  }, AGENTS);
  const p = await ctx.newPage();
  await p.goto(base, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  // Start from an unsaved draft so the header carries no real session state.
  await p.evaluate(() => document.getElementById("newChatBtn").click());
  await p.waitForTimeout(900);
  await p.evaluate(({ sidebar, threadHtml, thread }) => {
    const project = document.querySelector(".new-chat-project-value");
    if (project) project.textContent = "Chat";
    document.querySelectorAll(".new-chat-project-label, .new-chat-project-kind").forEach((n) => n.remove());
    const groups = document.querySelector("#sessionGroups");
    if (groups) groups.innerHTML = sidebar;
    const brand = document.querySelector("#sidebarBrandText");
    if (brand) brand.textContent = "macbook";
    const emptyTitle = document.querySelector(".empty-chat h2");
    if (emptyTitle) emptyTitle.textContent = "macbook";
    if (thread) {
      const msgs = document.querySelector("#messages");
      msgs.innerHTML = threadHtml;
      const title = document.querySelector("#activeSessionTitle");
      if (title) title.textContent = "Refactor the billing worker";
    }
  }, { sidebar: sidebarHTML(), threadHtml: threadHTML(), thread });
  await p.waitForTimeout(800);
  return { p, ctx };
}

async function save(p, name, clip) {
  await p.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
  console.log("wrote", name);
}

// Hero shots
for (const scheme of ["dark", "light"]) {
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme });
  await p.evaluate(() => { const s = document.querySelector(".chat-scroll"); s.scrollTop = 0; });
  await save(p, `hero-${scheme}`);
  await ctx.close();
}

// Composer with ultrathink + context ring
{
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme: "dark" });
  await p.click(".composer .prompt");
  await p.keyboard.type("Now ultrathink about how to roll this out safely", { delay: 4 });
  const url = await p.evaluate(() => document.querySelector("link[data-extension]").href.replace(/style\.css$/, "composer.js"));
  await p.evaluate(async (u) => {
    const m = await import(u);
    m.createComposerExtras(document.getElementById("root"), {
      getContextUsage: () => ({ usedTokens: 68400, inputLimit: 200000, cachedInputTokens: 51000, estimated: false }),
      onContextUsageChanged: () => () => {},
    }).sync();
  }, url);
  await p.waitForTimeout(900);
  const b = await p.locator(".composer-box").boundingBox();
  await save(p, "composer", { x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 });
  await ctx.close();
}

// Command palette
{
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme: "dark" });
  await p.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await p.waitForTimeout(350);
  await p.keyboard.type("re");
  await p.waitForTimeout(400);
  await save(p, "palette");
  await ctx.close();
}

// Appearance popover
{
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme: "dark" });
  await p.click(".vn-theme-btn");
  await p.waitForTimeout(500);
  const b = await p.locator(".vn-popover").boundingBox();
  await save(p, "appearance", { x: b.x - 20, y: b.y - 64, width: b.width + 40, height: b.height + 84 });
  await ctx.close();
}

// Agents: list and dock
{
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme: "dark" });
  const b = await p.locator(".hub-agent-group").boundingBox();
  await p.hover(".hub-agent-row:nth-child(2) .hub-agent-link");
  await p.waitForTimeout(300);
  await save(p, "agents-list", { x: 0, y: b.y - 12, width: 300, height: b.height + 24 });
  await p.evaluate(() => document.querySelector(".vn-agent-layout-btn").click());
  await p.waitForTimeout(300);
  await p.hover(".hub-agent-row:nth-child(2) .hub-agent-link");
  await p.waitForTimeout(500);
  const d = await p.locator(".hub-agent-group").boundingBox();
  await save(p, "agents-dock", { x: 0, y: d.y - 60, width: 300, height: d.height + 72 });
  await p.evaluate(() => document.querySelector(".vn-agent-layout-btn").click());
  await ctx.close();
}

// Empty state
{
  const { p, ctx } = await setup({ width: 1440, height: 900, scheme: "light", thread: false });
  await p.waitForTimeout(600);
  await save(p, "empty");
  await ctx.close();
}

// Mobile
{
  const { p, ctx } = await setup({ width: 390, height: 844, scheme: "dark", mobile: true });
  await p.evaluate(() => { const s = document.querySelector(".chat-scroll"); s.scrollTop = s.scrollHeight; });
  await p.waitForTimeout(400);
  await save(p, "mobile");
  await ctx.close();
}

await browser.close();
