// Node favicon: under the Hub, the tab icon becomes this node's own agent
// tile from the sidebar (its accent gradient plus its glyph or initials), so
// tabs for different agents are told apart at a glance.
//
// The tile is read from the sidebar's current agent link once main.js has
// decorated it. notify.js badges whatever base icon this sets (see
// data-vn-base / data-vn-badged on the <link>).

import { ACCENTS, NODE_ID, html, nodeAccent } from "./util.js";

const FALLBACK_AFTER_MS = 4000;

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Same blend as the sidebar tile: 55% of the bright accent into the deep one.
function mix(a, b, weight) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const channel = (x, y) => Math.round(x * weight + y * (1 - weight)).toString(16).padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}

// The glyph lives in style.css as a mask URL; reuse it so the two never drift.
function glyphFrom(icon) {
  const raw = getComputedStyle(icon).getPropertyValue("--vn-glyph").trim();
  const match = raw.match(/^url\(\s*["']?data:image\/svg\+xml,([\s\S]*?)["']?\s*\)$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

export function tileSvg({ accentId, kind, glyph, initials }) {
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const top = mix(accent.dark, accent.light, 0.55);
  let mark;
  if (kind !== "monogram" && glyph.startsWith("<svg")) {
    mark = glyph
      .replace(/black/g, "white")
      .replace(/stroke-width='[\d.]+'/, "stroke-width='2.6'") // a touch bolder at 16px
      .replace("<svg", "<svg x='13' y='13' width='38' height='38'");
  } else {
    const text = escapeXml((initials || "").slice(0, 2).toUpperCase());
    const size = text.length > 1 ? 26 : 32;
    mark = `<text x='32' y='33' text-anchor='middle' dominant-baseline='central' fill='white' font-family='-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' font-size='${size}' font-weight='700' letter-spacing='0.5'>${text}</text>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${top}'/><stop offset='1' stop-color='${accent.light}'/></linearGradient></defs>` +
    `<rect width='64' height='64' rx='15' fill='url(#g)'/>` +
    `<rect x='1' y='1' width='62' height='62' rx='14' fill='none' stroke='white' stroke-opacity='0.22' stroke-width='2'/>` +
    mark + `</svg>`;
}

export function createNodeFavicon(root, nodeId = NODE_ID) {
  if (!nodeId) return { sync() {}, dispose() {} };

  let link = document.querySelector('link[rel="icon"]');
  const original = link?.href ?? null;
  let lastSvg = "";
  const startedAt = performance.now();

  function currentTile() {
    const icon = root.querySelector('.hub-agent-link[aria-current="true"] .hub-agent-icon');
    const kind = icon?.dataset.vnKind;
    if (!icon || !kind) return null;
    return { kind, glyph: kind === "monogram" ? "" : glyphFrom(icon), initials: icon.dataset.vnInitials || "" };
  }

  function apply(svg) {
    if (svg === lastSvg) return;
    lastSvg = svg;
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.append(link);
    }
    link.type = "image/svg+xml";
    link.dataset.vnBase = href;
    if (!link.dataset.vnBadged) link.href = href;
  }

  function sync() {
    const tile = currentTile();
    const accentId = nodeAccent(nodeId);
    if (tile) {
      apply(tileSvg({ accentId, ...tile }));
    } else if (!lastSvg && performance.now() - startedAt > FALLBACK_AFTER_MS) {
      // No agent list (e.g. the sidebar is not rendered): initials of the node id.
      apply(tileSvg({ accentId, kind: "monogram", glyph: "", initials: nodeId.split(/[\s_-]+/).map((p) => p[0]).join("") || nodeId }));
    }
  }

  // Accent changes re-render; the sidebar's own changes arrive via sync().
  const accentObserver = new MutationObserver(sync);
  accentObserver.observe(html, { attributes: true, attributeFilter: ["data-vn-accent"] });
  const fallbackTimer = setTimeout(sync, FALLBACK_AFTER_MS + 50);

  return {
    sync,
    dispose() {
      accentObserver.disconnect();
      clearTimeout(fallbackTimer);
      if (link && original) {
        link.href = original;
        delete link.dataset.vnBase;
      }
    },
  };
}
