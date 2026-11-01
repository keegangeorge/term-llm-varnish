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
          arrived = records.some((record) => record.id === previous.tail.id);
        }
      }
      previous = { session, tail };
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
  const content = tail?.querySelector(":scope > .message-body > .markdown-body, :scope > .message-body > .message-text, .tool-group-summary");
  const copy = content?.cloneNode(true);
  copy?.querySelectorAll("button, .vn-code-head").forEach((node) => node.remove());
  if (records.length) records.at(-1).content = copy?.textContent ?? "";
  return records;
}
