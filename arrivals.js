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
  const text = [...contents].map((content) => {
    const copy = content.cloneNode(true);
    copy.querySelectorAll("button, .vn-code-head").forEach((node) => node.remove());
    return copy.textContent;
  });
  if (records.length) records.at(-1).content = JSON.stringify(text);
  return records;
}
