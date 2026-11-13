// Focused real-module regression on synthetic connected sidebar controls.
// No backend or conversation data is used; native-app coverage is separate.
export async function runPaletteChatTests(createPalette) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const root = document.createElement("section");
  const clicks = [];
  root.innerHTML = '<aside class="sidebar"></aside><button id="origin">Origin</button>';
  const sidebar = root.querySelector("aside");
  for (const [id, title, meta, active] of [
    ["first", "Twin chat", "2 messages · just now", false],
    ["second", "Twin chat", "2 messages · just now", true],
    ["other-meta", "Twin chat", "3 messages · yesterday", false],
    ["other-title", "Different chat", "2 messages · just now", false],
    ["empty", "  ", "2 messages · just now", false],
  ]) {
    const row = document.createElement("div");
    row.className = "session-row";
    const button = document.createElement("button");
    button.className = `session-btn${active ? " active" : ""}`;
    for (const [cls, text] of [["session-title", title], ["session-meta", meta]]) {
      const span = document.createElement("span"); span.className = cls; span.textContent = text; button.append(span);
    }
    button.addEventListener("click", () => clicks.push(id));
    row.append(button); sidebar.append(row);
  }
  document.body.append(root);
  const palette = createPalette(root, { theme: { scheme: "dark", type: "compact", accent: "indigo" }, thread: {} });
  const results = [];
  const chatRows = () => {
    let group = "";
    return [...document.querySelector(".vn-pal-overlay:not([data-leaving]) .vn-pal-list").children].filter((el) => {
      if (el.classList.contains("vn-pal-group")) group = el.textContent;
      return el.classList.contains("vn-pal-item") && group === "Chats";
    });
  };
  try {
    for (const activation of ["pointer", "keyboard"]) {
      for (const target of [0, 1]) {
        root.querySelector("#origin").focus(); palette.open();
        const input = document.querySelector(".vn-pal-overlay:not([data-leaving]) .vn-pal-input");
        assert(chatRows().length === 4, "Default view retains all four titled sidebar chats, including identical labels");
        input.value = "Twin chat"; input.dispatchEvent(new Event("input", { bubbles: true }));
        const rows = chatRows();
        assert(rows.length === 3, "Search retains both identical chats and the different-metadata control");
        assert(rows[0].querySelector(".vn-pal-hint").textContent === rows[1].querySelector(".vn-pal-hint").textContent, "The twin labels really collide");
        assert(!rows[0].hasAttribute("data-current") && rows[1].hasAttribute("data-current"), "Current marker belongs to the second chat only");
        if (activation === "pointer") rows[target].click();
        else {
          for (let i = 0; i < target; i++) input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert(clicks.at(-1) === ["first", "second"][target] && clicks.length === results.length + 1, `${activation}/${target}: only the intended sidebar action fires`);
        results.push(`${activation}/${target}`);
      }
    }
    return results;
  } finally {
    palette.dispose(); root.remove();
    document.querySelectorAll(".vn-pal-overlay[data-leaving]").forEach((node) => node.remove());
  }
}
