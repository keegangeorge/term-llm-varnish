// Shared helpers for Varnish modules.

export const KEYS = {
  collapsed: "term-llm:varnish:collapsed-groups",
  scheme: "term-llm:varnish:scheme",
  accent: "term-llm:varnish:accent",
  toolbar: "term-llm:varnish:toolbar",
  agentLayout: "term-llm:varnish:agent-layout",
  type: "term-llm:varnish:type-scale",
  codeWrap: "term-llm:varnish:code-wrap",
};

export const ACCENTS = [
  { id: "indigo", name: "Indigo", dark: "#8b93ff", light: "#5b5bd6" },
  { id: "blue", name: "Blue", dark: "#5eb1ff", light: "#0a72e8" },
  { id: "green", name: "Green", dark: "#4ade80", light: "#15803d" },
  { id: "orange", name: "Orange", dark: "#ff9f5a", light: "#dd5f05" },
  { id: "pink", name: "Pink", dark: "#ff7ab8", light: "#d61f73" },
  { id: "purple", name: "Purple", dark: "#c08bff", light: "#8b3fe0" },
  { id: "graphite", name: "Graphite", dark: "#d4d4d8", light: "#3f3f46" },
];

// Optional per-node default accents, keyed by Hub node id, from an untracked
// `local.json` next to this file (see local.example.json). Picking an accent
// in the popover still overrides the default for that node.
export const NODE_ACCENTS = {};

export async function loadLocalConfig() {
  try {
    const res = await fetch(new URL("./local.json", import.meta.url), { credentials: "same-origin" });
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg && typeof cfg.nodeAccents === "object") Object.assign(NODE_ACCENTS, cfg.nodeAccents);
  } catch {
    // No local.json (the normal case): built-in defaults apply.
  }
}

// One-time move of settings saved under the extension's previous name.
(function migrateStorage() {
  try {
    const OLD = "term-llm:hub-studio:";
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(OLD)) continue;
      const next = `term-llm:varnish:${key.slice(OLD.length)}`;
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key));
    }
  } catch {
    // Storage unavailable.
  }
})();

// Every node shares the Hub's origin, and so its localStorage; the node id in
// /node/<id>/ is what tells them apart. Direct (non-Hub) visits get null.
export const NODE_ID = location.pathname.match(/^\/node\/([^/]+)\//)?.[1] ?? null;

export const html = document.documentElement;
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function read(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: settings last for this page only.
  }
}

// The accent a node actually shows. Shared with the sidebar's agent tiles:
// all Hub nodes share one origin, so any node can read every node's choice.
export function nodeAccent(nodeId) {
  const own = nodeId ? read(`${KEYS.accent}:${nodeId}`, null) : null;
  const id = own ?? NODE_ACCENTS[nodeId] ?? read(KEYS.accent, "indigo");
  return ACCENTS.some((a) => a.id === id) ? id : "indigo";
}

// The app suffixes its own storage keys with ":<nodeId>" under the Hub.
export function appKey(base) {
  return NODE_ID ? `${base}:${NODE_ID}` : base;
}

/* ----------------------------------------------------- app API access */

let apiPrefix = "";

export function setApiPrefix(prefix) {
  apiPrefix = (prefix || "").replace(/\/+$/, "");
}

// Same-origin GET against this node's API, authenticated the way the app is
// (its stored bearer token if any; Hub sessions ride on cookies).
export async function apiGet(path) {
  const headers = { Accept: "application/json" };
  const token = read(appKey("term_llm_token"), null) ?? read("term_llm_token", null);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiPrefix}${path}`, { headers, credentials: "same-origin" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ---------------------------------------------------- provider lookup */

let providersPromise = null;
let providersCache = null;

export function loadProviders() {
  providersPromise ??= apiGet("/v1/providers")
    .then((d) => {
      providersCache = Array.isArray(d?.data) ? d.data : [];
      return providersCache;
    })
    .catch(() => {
      providersPromise = null; // allow a retry later
      return [];
    });
  return providersPromise;
}

// Provider the next reply will use: the user's runtime pick (read live from
// the app's own storage key), else the server default. Synchronous, using
// the cached provider list; returns { name, type } or null when unknown.
export function currentProviderSync() {
  const selected = read(appKey("term_llm_selected_provider"), null);
  const list = providersCache ?? [];
  const match = selected
    ? list.find((p) => p.name === selected)
    : list.find((p) => p.is_default);
  if (match) return { name: match.name, type: match.type || match.name };
  return selected ? { name: selected, type: selected } : null;
}

/* ------------------------------------------------------------- misc */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

// The app is "running" while its Stop button is visible.
export function isRunning(root) {
  return Boolean(root.querySelector(".composer .stop-btn.visible"));
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatTokens(n) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}
