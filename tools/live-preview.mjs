#!/usr/bin/env node
// Renders the live-voice panel in each phase without starting a call.
//
//   node tools/live-preview.mjs [outDir]
//
// Opens your local `term-llm serve` and injects the same markup the app's live
// panel renders above the composer, one phase at a time, then screenshots the
// composer area in dark and light. Nothing is sent and no microphone or
// realtime session is used. The page behind the panel is whatever chat the
// server opens first, so outputs (default: ignored tools/out/) can show real
// conversations. Keep them local.

import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || path.join(HERE, "out", `live-${Date.now()}`));
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

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const speaker = (role) => `<span class="live-status-speaker">${role === "user" ? "You: " : "Assistant: "}</span>`;
const TURNS = [
  ["user", "Can you check whether the billing worker retries are capped?"],
  ["assistant", "They are. The worker retries five times with exponential backoff, then moves the job to the dead set."],
  ["user", "Great, and what happens to the invoice?"],
  ["assistant", "It stays in pending until the nightly reconciler picks it up and either retries the charge or flags it for review."],
];

function panel({ phase, copy, spinner, binding, text, role, expanded, error, interrupted }) {
  const orb = `<span class="${spinner ? "live-status-spinner" : "live-status-dot"}" aria-hidden="true"></span>`;
  const bind = binding ? `<span class="live-status-binding">Working in ${esc(binding)}</span>` : "";
  const stop = phase === "failed" ? "" : '<button type="button" class="btn live-status-stop">Stop</button>';
  let body = "";
  if (text || expanded) {
    const inner = expanded
      ? TURNS.map(([r, t]) => `<div class="live-status-turn">${speaker(r)}${esc(t)}</div>`).join("")
      : `${speaker(role)}${esc(text)}${interrupted ? '<span class="live-status-interrupted"> (Interrupted)</span>' : ""}`;
    body = `
      <div id="liveTranscript" class="live-status-transcript${expanded ? " live-status-transcript-expanded" : ""}" role="region" tabindex="0">${inner}</div>
      <div class="live-status-transcript-actions"><button type="button" class="btn">${expanded ? "Collapse transcript" : "Expand transcript"}</button></div>`;
  }
  const err = error ? `<span class="live-status-error" role="alert">${esc(error)}</span>` : "";
  return `<section id="liveStatus" class="live-status live-status-${phase}" aria-label="Live voice">
    <div class="live-status-header">${orb}<span class="live-status-copy" role="status">${copy}${bind}</span>${stop}</div>${body}${err}</section>`;
}

const STATES = [
  ["connecting", { phase: "connecting", copy: "Connecting live voice…", spinner: true }],
  ["listening", { phase: "listening", copy: "Listening…", binding: "#42 · Refactor the billing worker", text: TURNS[0][1], role: "user" }],
  ["speaking", { phase: "speaking", copy: "Speaking…", binding: "#42 · Refactor the billing worker", text: TURNS[1][1], role: "assistant" }],
  ["working", { phase: "working", copy: "Working on your request…", spinner: true, binding: "#42 · Refactor the billing worker", text: TURNS[2][1], role: "user" }],
  ["expanded", { phase: "listening", copy: "Listening…", binding: "#42 · Refactor the billing worker", expanded: true }],
  ["failed", { phase: "failed", copy: "Live voice needs attention.", error: "The realtime session closed unexpectedly. Start live voice again to reconnect." }],
];

const browser = await chromium.launch();
try {
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` },
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(START, { waitUntil: "load" });
    await p.waitForSelector(".composer-inner .composer-box", { timeout: 15000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => document.documentElement.removeAttribute("data-vn-scheme-locked"));
    await p.evaluate((s) => document.documentElement.setAttribute("data-vn-scheme", s), scheme);
    for (const [name, state] of STATES) {
      await p.evaluate((html) => {
        document.getElementById("vnLivePreview")?.remove();
        const host = document.createElement("div");
        host.id = "vnLivePreview";
        host.style.display = "contents";
        host.innerHTML = html;
        const inner = document.querySelector(".composer-inner");
        inner.insertBefore(host, inner.querySelector(".composer-box"));
        const send = document.querySelector(".send-btn");
        if (send) {
          send.classList.add("live");
          send.classList.toggle("live-pulse", ["listening", "speaking"].includes(html.match(/live-status-(\w[\w-]*)"/)?.[1]));
          send.setAttribute("aria-pressed", "true");
        }
      }, panel(state));
      await p.waitForTimeout(1200);
      const box = await p.evaluate(() => {
        const r = document.querySelector(".composer-inner").getBoundingClientRect();
        return { x: r.x - 24, y: r.y - 40, width: r.width + 48, height: r.height + 64 };
      });
      const file = path.join(OUT, `${scheme}-${name}.png`);
      await p.screenshot({ path: file, clip: box });
      console.log(file);
    }
    if (errors.length) console.error("page errors:", errors);
    await ctx.close();
  }
} finally {
  await browser.close();
}
