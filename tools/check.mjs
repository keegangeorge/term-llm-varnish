#!/usr/bin/env node
// Varnish health check. Run it after upgrading term-llm or editing the theme:
//
//   node tools/check.mjs           # against the locally running term-llm serve
//   node tools/check.mjs --open    # ...and open the HTML report (macOS)
//
// It never sends a message. It verifies that:
//   1. the extension is enabled and loaded without errors,
//   2. every app selector Varnish hooks into still exists,
//   3. Varnish's own UI got injected,
//   4. the pre-JS light token copy in style.css matches the light block,
// and screenshots key states into tools/out/<timestamp>/index.html.
//
// Env:
//   VARNISH_URL     base URL of the web UI (default: http://localhost:<port>/,
//                   port read from the running `term-llm serve` process)
//   TERM_LLM_TOKEN  bearer token (default: read from that process)
//   PLAYWRIGHT_DIR  where to resolve playwright from (default: tools/)

import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "..");
const EXT_ID = "varnish";

function serveArgs() {
  try {
    const ps = execSync("ps -axo args", { encoding: "utf8" });
    return ps.split("\n").find((l) => /^(\S*\/)?term-llm serve\b/.test(l.trim())) ?? "";
  } catch {
    return "";
  }
}

function token() {
  return process.env.TERM_LLM_TOKEN || serveArgs().match(/--token (\S+)/)?.[1] || "";
}

async function resolveBase() {
  const port = serveArgs().match(/--port (\d+)/)?.[1] || "8080";
  const start = process.env.VARNISH_URL || `http://localhost:${port}/`;
  // The UI may live under a prefix (e.g. /ui/); follow the redirect to find it.
  const res = await fetch(start, { redirect: "follow" });
  return res.url.endsWith("/") ? res.url : `${res.url}/`;
}

const PW_DIR = process.env.PLAYWRIGHT_DIR || `${HERE}/`;
const URL_BASE = await resolveBase();
const TOKEN = token();
const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass, detail });

// --- 1. extension status -----------------------------------------------
const apiBase = URL_BASE.replace(/\/$/, "");
try {
  const res = await fetch(`${apiBase}/admin/extensions/status`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const st = await res.json();
  ok("extension enabled", st.enabled?.includes(EXT_ID), `enabled: ${st.enabled?.join(", ")}`);
  ok("extension has no load errors", !(st.errors?.length), (st.errors || []).join("; "));
} catch (e) {
  ok("extension status reachable", false, String(e));
}

// --- 4. CSS drift --------------------------------------------------------
{
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  const grab = (re) => css.match(re)?.[1]?.replace(/\s+/g, " ").trim();
  const light = grab(/:root\[data-vn-scheme="light"\] \{([\s\S]*?)\n\}\n/);
  const copy = grab(/:root:not\(\[data-vn-scheme\]\) \{([\s\S]*?)\}\n\}/);
  ok("pre-JS light tokens match light block", Boolean(light) && light === copy,
    light === copy ? "" : "Regenerate the PRE-JS LIGHT copy in style.css from the light block");
}

// --- 2/3. live DOM ------------------------------------------------------
const require = createRequire(PW_DIR);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright not found. Run: cd tools && npm install && npx playwright install chromium");
  process.exit(2);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(HERE, "out", stamp);
fs.mkdirSync(out, { recursive: true });
const shots = [];

const APP_HOOKS = [
  "#root", "#appShell", ".sidebar", ".sidebar-search-input", ".sidebar-search-wrap",
  "#newChatBtn", "#settingsBtn", ".session-group", ".session-row .session-btn",
  ".session-title", ".session-meta", "main.main", ".main-header", ".header-controls-row",
  ".header-stats .model-chip-primary .chip-trigger", ".chat-scroll", "#messages",
  ".composer", ".composer-box", ".composer .prompt", "#attachBtn", ".composer-actions",
  "#sendBtn", "link[rel=icon]", "meta[name=theme-color]",
];
// The Stop button is conditionally mounted while generating. An idle page
// cannot verify that hook without sending a message, which this check avoids.
const OWN_UI = [
  "html[data-vn-scheme]", "html[data-vn-accent]", "html[data-vn-type]",
  ".vn-composer-bar .vn-chip-runtime", ".vn-theme-btn", ".vn-search-kbd", ".vn-jump",
];
// Thread hooks only exist when there is a conversation; checked if present.
const THREAD_HOOKS = [
  [".messages > .message.user", ".messages > .message.user .vn-user-actions"],
  [".markdown-body pre > code", ".markdown-body pre[data-vn-code] .vn-code-head"],
  [".tool-group .tool-group-toggle", ".tool-group-toggle"],
];

const browser = await chromium.launch();
async function page(opts) {
  const ctx = await browser.newContext({
    deviceScaleFactor: 2,
    extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
    ...opts,
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(URL_BASE, { waitUntil: "load" });
  await p.waitForTimeout(3500);
  return { p, errors, ctx };
}
async function shot(p, name, label) {
  const file = `${name}.png`;
  await p.screenshot({ path: path.join(out, file) });
  shots.push({ file, label });
}

try {
  const { p, errors } = await page({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  for (const sel of APP_HOOKS) ok(`app hook ${sel}`, (await p.locator(sel).count()) > 0);
  for (const sel of OWN_UI) ok(`varnish ui ${sel}`, (await p.locator(sel).count()) > 0);
  for (const [need, expect] of THREAD_HOOKS) {
    if ((await p.locator(need).count()) === 0) continue;
    ok(`decorated ${expect}`, (await p.locator(expect).count()) > 0);
  }
  await shot(p, "desktop-dark-thread", "Thread (dark)");

  await p.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await p.waitForTimeout(450);
  ok("⌘K palette opens", (await p.locator(".vn-pal").count()) > 0);
  await shot(p, "palette", "Command palette");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  await p.click("#newChatBtn");
  await p.waitForTimeout(900);
  ok("empty state decorated", (await p.locator(".empty-chat .vn-empty").count()) > 0);
  await shot(p, "empty-chat", "New chat");

  await p.click(".vn-chip-runtime");
  await p.waitForTimeout(500);
  ok("runtime popover opens from composer chip", (await p.locator("dialog.chip-popover-runtime[open]").count()) > 0);
  await shot(p, "runtime", "Runtime popover");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  await p.click(".vn-theme-btn");
  await p.waitForTimeout(400);
  await shot(p, "appearance", "Appearance popover");
  await p.keyboard.press("Escape");

  await p.click("#settingsBtn");
  await p.waitForTimeout(600);
  ok("settings modal opens", (await p.locator(".modal.settings-modal").count()) > 0);
  await shot(p, "settings", "Settings");
  ok("no page errors (desktop)", errors.length === 0, errors.join("; "));
} catch (e) {
  ok("desktop run", false, String(e));
}

try {
  const { p, errors } = await page({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  await shot(p, "desktop-light-thread", "Thread (light, System)");
  ok("System scheme follows OS (light)", (await p.evaluate(() => document.documentElement.dataset.vnScheme)) === "light");
  ok("no page errors (light)", errors.length === 0, errors.join("; "));
} catch (e) {
  ok("light run", false, String(e));
}

try {
  const { p, errors } = await page({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true });
  await shot(p, "mobile-thread", "Mobile thread");
  ok("no page errors (mobile)", errors.length === 0, errors.join("; "));
} catch (e) {
  ok("mobile run", false, String(e));
}
await browser.close();

// --- report -------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
const rows = results
  .map((r) => `<tr class="${r.pass ? "ok" : "bad"}"><td>${r.pass ? "✓" : "✗"}</td><td>${r.name}</td><td>${r.detail || ""}</td></tr>`)
  .join("");
const cards = shots.map((s) => `<figure><img src="${s.file}" loading="lazy"><figcaption>${s.label}</figcaption></figure>`).join("");
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Varnish check ${stamp}</title>
<style>body{font:14px system-ui;margin:24px;background:#0b0b0d;color:#ededef}h1{font-size:18px}
table{border-collapse:collapse;margin:12px 0 24px}td{padding:4px 10px;border-bottom:1px solid #222}
.bad td{color:#ff8a8a}.ok td:first-child{color:#4ade80}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
figure{margin:0;background:#151518;border:1px solid #222;border-radius:12px;overflow:hidden}
img{width:100%;display:block}figcaption{padding:8px 12px;color:#aaa}</style>
<h1>Varnish check · ${stamp} · ${failed.length ? `${failed.length} failing` : "all passing"}</h1>
<table>${rows}</table><div class="grid">${cards}</div>`);

for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed · report: ${path.join(out, "index.html")}`);
if (process.argv.includes("--open")) execSync(`open "${path.join(out, "index.html")}"`);
process.exit(failed.length ? 1 : 0);
