import assert from "node:assert/strict";

// Compare the visible preview paint, not just its inline custom properties.
export async function checkPaletteSwatches(page) {
  const prompt = page.locator(".composer .prompt");
  const original = await prompt.inputValue();
  const originalScheme = await page.locator("html").getAttribute("data-vn-scheme");
  const overlay = page.locator(".vn-pal-overlay:not([data-leaving])");
  const input = overlay.locator(".vn-pal-input");
  const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";
  const draft = "Accent preview regression — preserve this draft";
  const states = [];
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
    assert.equal(await prompt.inputValue(), draft);
  };
  const colors = async () => overlay.locator(".vn-pal-item").evaluateAll(rows => Object.fromEntries(rows
    .filter(row => row.querySelector(".is-swatch"))
    .map(row => [row.querySelector(".vn-pal-title").textContent.replace("Accent: ", ""), getComputedStyle(row.querySelector(".is-swatch"), "::before").backgroundColor])));
  await prompt.fill(draft);
  for (const scheme of ["light", "dark", "system"]) {
    await page.locator(".vn-theme-btn").click();
    await page.locator(`[data-scheme="${scheme}"]`).click();
    const resolved = await page.locator("html").getAttribute("data-vn-scheme");
    await page.waitForFunction(value => getComputedStyle(document.querySelector('[data-accent="graphite"]')).backgroundColor === value, resolved === "light" ? "rgb(63, 63, 70)" : "rgb(212, 212, 216)");
    const picker = await page.locator(".vn-swatch").evaluateAll(buttons => Object.fromEntries(buttons.map(button => [button.getAttribute("aria-label"), getComputedStyle(button).backgroundColor])));
    assert.equal(Object.keys(picker).length, 7);
    assert.equal(picker.Graphite, resolved === "light" ? "rgb(63, 63, 70)" : "rgb(212, 212, 216)");
    await page.keyboard.press("Escape");
    await prompt.focus();
    await page.keyboard.press(shortcut);
    await input.fill("Accent:");
    const before = await colors();
    assert.deepEqual(before, picker, `${scheme}: every palette swatch previews its applied color`);
    if (scheme === "system") {
      await page.keyboard.press("ArrowDown");
      await input.evaluate(e => e.setSelectionRange(1, 4));
      const selected = await input.getAttribute("aria-activedescendant");
      const next = resolved === "light" ? "dark" : "light";
      await page.emulateMedia({ colorScheme: next });
      await page.waitForFunction(value => document.documentElement.getAttribute("data-vn-scheme") === value, next);
      await page.waitForFunction(value => {
        const row = [...document.querySelectorAll(".vn-pal-overlay:not([data-leaving]) .vn-pal-item")].find(e => e.querySelector(".vn-pal-title")?.textContent === "Accent: Graphite");
        return row && getComputedStyle(row.querySelector(".is-swatch"), "::before").backgroundColor === value;
      }, next === "light" ? "rgb(63, 63, 70)" : "rgb(212, 212, 216)");
      assert.equal(await input.inputValue(), "Accent:");
      assert.deepEqual(await input.evaluate(e => [e.selectionStart, e.selectionEnd]), [1, 4]);
      assert.equal(await input.getAttribute("aria-activedescendant"), selected);
      assert.equal(await input.evaluate(e => e === document.activeElement), true);
      const after = await colors();
      await close();
      await page.locator(".vn-theme-btn").click();
      await page.waitForFunction(value => getComputedStyle(document.querySelector('[data-accent="graphite"]')).backgroundColor === value, next === "light" ? "rgb(63, 63, 70)" : "rgb(212, 212, 216)");
      const changedPicker = await page.locator(".vn-swatch").evaluateAll(buttons => Object.fromEntries(buttons.map(button => [button.getAttribute("aria-label"), getComputedStyle(button).backgroundColor])));
      assert.deepEqual(after, changedPicker, "System changes repaint all swatches without rebuilding the palette");
      await page.keyboard.press("Escape");
      await page.emulateMedia({ colorScheme: null });
      states.push({ scheme, resolved, next, before, after, selectionPreserved: true });
    } else {
      await close();
      states.push({ scheme, resolved, colors: before });
    }
  }
  await page.locator(".vn-theme-btn").click();
  await page.locator(`[data-scheme="${originalScheme}"]`).click();
  await page.keyboard.press("Escape");
  await prompt.fill(original);
  return states;
}

export default { key: "paletteSwatches", run: checkPaletteSwatches };
