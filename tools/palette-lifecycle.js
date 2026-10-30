// Deterministic browser regression for the real palette module on a synthetic
// connected root. Complements native-app handoff tests; not overlay integration.
export function runPaletteLifecycleTests(createPalette) {
  const original = {
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
  };
  let nextId = 0;
  const timers = new Map();
  const frames = new Map();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.requestAnimationFrame = (callback) => { const id = ++nextId; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const take = (queue) => {
    const callbacks = [...queue.values()];
    queue.clear();
    return callbacks.map((entry) => entry.callback || entry);
  };
  const results = [];
  let palette, root;
  try {
    for (const interruption of ["dispose", "reopen"]) {
      for (const stage of ["timer", "first-frame", "second-frame"]) {
        timers.clear(); frames.clear();
        root = document.createElement("section");
        root.innerHTML = '<aside class="sidebar"><div class="sidebar-search-wrap"><input class="sidebar-search-input"></div></aside>';
        document.body.append(root);
        const search = root.querySelector("input");
        search.value = "unchanged";
        let writes = 0;
        search.addEventListener("input", () => writes++);
        palette = createPalette(root, { theme: { scheme: "dark", type: "compact", accent: "indigo" }, thread: {} });
        palette.open();
        const input = document.querySelector(".vn-pal-overlay:not([data-leaving]) .vn-pal-input");
        input.value = "lifecycle-old-query-7654321";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const option = [...document.querySelectorAll(".vn-pal-overlay:not([data-leaving]) .vn-pal-item")].find((item) => item.textContent.includes("Search all chats for"));
        assert(option, "Search fallback exists");
        option.click();
        // Capture the callback as though the browser has dequeued it. Running
        // it after cancellation also verifies generation/disposal guards.
        const actions = [...timers.values()].filter((entry) => entry.delay === 30);
        assert(actions.length === 1, "Exactly one pending palette action");
        let stale = actions[0].callback;
        if (stage !== "timer") {
          stale();
          assert(frames.size === 1, "First handoff frame scheduled");
          stale = take(frames)[0];
          if (stage === "second-frame") {
            stale();
            assert(frames.size === 1, "Second handoff frame scheduled");
            stale = take(frames)[0];
          }
        }
        if (interruption === "dispose") { palette.dispose(); search.focus(); }
        else palette.open();
        const focus = document.activeElement;
        stale();
        for (let i = 0; i < 3; i++) for (const callback of take(frames)) callback();
        assert(search.value === "unchanged" && writes === 0, `${interruption}/${stage}: no stale query/input event`);
        assert(document.activeElement === focus, `${interruption}/${stage}: no stale focus steal`);
        if (interruption === "reopen") {
          const current = document.querySelector(".vn-pal-overlay:not([data-leaving]) .vn-pal-input");
          assert(current === focus, "Reopened palette owns focus");
          current.value = "lifecycle-new-query-1234567";
          current.dispatchEvent(new Event("input", { bubbles: true }));
          [...document.querySelectorAll(".vn-pal-overlay:not([data-leaving]) .vn-pal-item")].find((item) => item.textContent.includes("Search all chats for")).click();
          const action = [...timers.values()].filter((entry) => entry.delay === 30).at(-1);
          action.callback();
          for (let i = 0; i < 2; i++) for (const callback of take(frames)) callback();
          assert(search.value === "lifecycle-new-query-1234567" && writes === 1 && document.activeElement === search, "New action still hands off exactly once");
        }
        palette.dispose();
        palette.open();
        assert(!document.querySelector(".vn-pal-overlay:not([data-leaving])"), "Disposed palette cannot reopen");
        root.remove(); root = null;
        document.querySelectorAll(".vn-pal-overlay[data-leaving]").forEach((node) => node.remove());
        results.push(`${interruption}/${stage}`);
      }
    }
    return results;
  } finally {
    palette?.dispose();
    root?.remove();
    document.querySelectorAll(".vn-pal-overlay[data-leaving]").forEach((node) => node.remove());
    Object.assign(window, original);
  }
}
