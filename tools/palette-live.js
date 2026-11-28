// Focused real-module coverage; synthetic controls, not backend lifecycle proof.
export async function runPaletteLiveTests(createPalette) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const root = document.createElement("section");
  root.innerHTML = '<button id="origin">Origin</button><aside class="sidebar"><div class="session-row"><button class="session-btn"><span class="session-title">Live alpha</span><span class="session-meta">one</span></button></div><div class="session-row"><button class="session-btn"><span class="session-title">Live beta</span><span class="session-meta">two</span></button></div></aside>';
  document.body.append(root);
  const palette = createPalette(root, { theme: { scheme: "dark", type: "compact", accent: "indigo" }, thread: {} });
  const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
  const titles = () => [...document.querySelectorAll(".vn-pal-title")].map((node) => node.textContent);
  const selected = () => document.getElementById(document.querySelector(".vn-pal-input").getAttribute("aria-activedescendant"));
  let clicked = 0;
  try {
    root.querySelector("#origin").focus(); palette.open();
    const input = document.querySelector(".vn-pal-input");
    input.value = "Live"; input.dispatchEvent(new Event("input", { bubbles: true }));
    const beta = [...document.querySelectorAll(".vn-pal-item")].find((row) => row.querySelector(".vn-pal-title")?.textContent === "Live beta");
    beta.dispatchEvent(new Event("pointermove"));
    assert(selected() === beta, "Setup selects the intended beta source, independently of fuzzy rank");
    input.setSelectionRange(1, 3);
    const button = root.querySelectorAll(".session-btn")[1];
    button.addEventListener("click", () => clicked++);
    // Character-data-only native updates must refresh without query input.
    button.querySelector(".session-title").firstChild.data = "Live renamed";
    await wait(); palette.sync();
    assert(titles().includes("Live renamed") && !titles().includes("Live beta"), "Open results follow native title changes");
    assert(selected().textContent.includes("Live renamed"), "Rename preserves selected source identity");
    assert(document.activeElement === input && input.value === "Live" && input.selectionStart === 1 && input.selectionEnd === 3, "Refresh preserves input focus, query and caret");
    const selectedNode = selected(); palette.sync(); await wait();
    assert(selected() === selectedNode, "Unchanged sync leaves result nodes intact");
    // Reordering must not transfer selection to another chat.
    const sidebar = root.querySelector(".sidebar"); sidebar.prepend(button.parentElement);
    await wait(); palette.sync();
    assert(selected().textContent.includes("Live renamed"), "Reordering preserves chat identity");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await wait(); assert(clicked === 1, "Activation uses the same connected source");
    palette.open(); // The old leaving input is not reused.
    const current = document.querySelector(".vn-pal-overlay:not([data-leaving]) .vn-pal-input");
    current.value = "Live renamed"; current.dispatchEvent(new Event("input", { bubbles: true }));
    button.parentElement.remove();
    // Enter before the observer delivery must not dispatch a disconnected action.
    current.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await wait(); assert(clicked === 1, "Removed source cannot be activated from stale results");
    assert(!titles().includes("Live renamed"), "Removed source disappears from open results");
    palette.dispose(); root.querySelector(".session-title").textContent = "After disposal";
    await wait(); assert(!document.querySelector(".vn-pal-overlay:not([data-leaving])"), "Disposal disconnects live updates");
    return ["rename", "identity", "input", "no-churn", "reorder", "activation", "removal", "dispose"];
  } finally {
    palette.dispose(); root.remove();
    document.querySelectorAll(".vn-pal-overlay[data-leaving]").forEach((node) => node.remove());
  }
}
