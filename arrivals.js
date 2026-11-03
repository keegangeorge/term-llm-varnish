// Track logical progress at the live tail, not transcript layout growth.
// Initial hydration, history prepends and discontinuous replacements rebaseline.
export function createArrivalTracker() {
  let previous = null;
  return {
    reset() { previous = null; },
    observe(session, records) {
      const tail = records.at(-1);
      let arrived = false;
      if (previous && previous.session === session && tail && previous.tail) {
        if (tail.id === previous.tail.id) {
          arrived = tail.content !== previous.tail.content;
        } else {
          const oldTailIndex = records.findIndex((record) => record.id === previous.tail.id);
          arrived = oldTailIndex >= 0 && records.slice(oldTailIndex + 1)
            .some((record) => !previous.ids.has(record.id));
        }
      }
      previous = { session, tail, ids: new Set(records.map((record) => record.id)) };
      return arrived;
    },
  };
}

// Only app-rendered transcript records participate. Tool/compaction disclosure
// bodies and extension-owned controls are deliberately not arrival signals.
export function transcriptRecords(root) {
  const nodes = [...root.querySelectorAll(".messages > [data-message-id]")];
  const records = nodes.map((record) => ({ id: record.dataset.messageId, content: "" }));
  const tail = nodes.at(-1);
  const contents = tail?.querySelectorAll(":scope > .message-body > .markdown-body:not(.compaction-raw), :scope > .message-body > .message-text, :scope > .tool-group-card > .tool-group-toggle > .tool-group-summary") ?? [];
  // Walk existing nodes: cloning rendered images can trigger resource loads even
  // while detached. Only logical text/media/link content belongs in the signature,
  // never disclosure state, syntax decoration or extension-owned controls.
  const signature = (content) => {
    const tokens = [];
    let text = "";
    const visit = (node) => {
      if (node.nodeType === 3) { text += node.textContent; return; }
      if (node.nodeType !== 1 || node.matches("button, .vn-code-head")) return;
      const attributes = {
        A: ["href", "title"],
        IMG: ["src", "srcset", "alt", "title"],
        VIDEO: ["src", "poster"],
        AUDIO: ["src"],
        SOURCE: ["src", "srcset", "type"],
        TRACK: ["src", "kind", "srclang", "label"],
      }[node.tagName];
      if (attributes) {
        tokens.push(text, [node.tagName, ...attributes.map((name) => node.getAttribute(name))]);
        text = "";
      }
      node.childNodes.forEach(visit);
    };
    visit(content);
    tokens.push(text);
    return tokens;
  };
  const text = [...contents].map(signature);
  if (records.length) records.at(-1).content = JSON.stringify(text);
  return records;
}
