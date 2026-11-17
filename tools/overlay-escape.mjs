import assert from "node:assert/strict";

// A foreground palette must own Escape; the picker beneath it must not steal
// focus. Run against the actual UI, not a synthetic event-listener substitute.
export async function checkOverlayEscape(page) {
  const picker = page.locator(".vn-popover:not([data-leaving])");
  const palette = page.locator(".vn-pal-overlay:not([data-leaving])");
  const anchor = page.locator(".vn-theme-btn");
  const snapshot = () => page.evaluate(() => ({
    picker: !!document.querySelector(".vn-popover:not([data-leaving])"),
    palette: !!document.querySelector(".vn-pal-overlay:not([data-leaving])"),
    focusInPicker: !!document.activeElement.closest(".vn-popover"),
    focusInPalette: !!document.activeElement.closest(".vn-pal-overlay"),
    focusOnAnchor: document.activeElement.matches(".vn-theme-btn"),
  }));
  const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";
  const states = [];
  for (const dismissal of ["Escape", "pointer"]) {
    await anchor.click();
    await picker.waitFor();
    const origin = await page.evaluateHandle(() => document.activeElement);
    await page.keyboard.press(shortcut);
    await palette.waitFor();
    assert.equal((await snapshot()).focusInPalette, true);
    if (dismissal === "Escape") {
      await page.keyboard.press("Escape");
    } else {
      await palette.click({ position: { x: 2, y: 2 } });
    }
    await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
    const afterPalette = await snapshot();
    assert.equal(afterPalette.picker, true, "only the foreground dialog closes");
    assert.equal(afterPalette.focusInPicker, true, `focus returns to the picker (${dismissal}): ${JSON.stringify(afterPalette)}`);
    assert.equal(await page.evaluate(el => document.activeElement === el, origin), true);
    await origin.dispose();
    await page.keyboard.press("Escape");
    await page.locator(".vn-popover").waitFor({ state: "detached" });
    const afterPicker = await snapshot();
    assert.equal(afterPicker.focusOnAnchor, true);
    states.push({ dismissal, afterPalette, afterPicker });
  }
  // Trusted Chromium composition events exercise the handler boundary, not a
  // physical desktop IME. Cancelling composition must leave both dialogs open.
  await page.locator(".composer .prompt").fill("Unsent composition draft");
  await anchor.click();
  await picker.waitFor();
  const pickerOrigin = await page.evaluateHandle(() => document.activeElement);
  await page.keyboard.press(shortcut);
  const input = page.locator(".vn-pal-input");
  await input.waitFor();
  const client = await page.context().newCDPSession(page);
  try {
    await input.evaluate((element) => {
      element.dataset.trustedComposingEscape = "false";
      element.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && event.isComposing && event.isTrusted) {
          element.dataset.trustedComposingEscape = "true";
        }
      }, { capture: true });
    });
    await client.send("Input.imeSetComposition", { text: "日本語", selectionStart: 3, selectionEnd: 3 });
    const selected = await input.getAttribute("aria-activedescendant");
    await page.keyboard.press("Escape");
    assert.equal(await input.getAttribute("data-trusted-composing-escape"), "true");
    const duringComposition = await snapshot();
    assert.equal(duringComposition.picker, true);
    assert.equal(duringComposition.palette, true);
    assert.equal(duringComposition.focusInPalette, true);
    assert.equal(await input.getAttribute("aria-activedescendant"), selected);
    assert.equal(await anchor.getAttribute("aria-expanded"), "true");
    await client.send("Input.insertText", { text: "日本語" });
    await input.fill("Open settings");
    const afterComposition = await input.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    assert.notEqual(await input.getAttribute("aria-activedescendant"), afterComposition);
    await page.keyboard.press("Escape");
    await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
    assert.equal((await snapshot()).picker, true);
    assert.equal(await page.evaluate(el => document.activeElement === el, pickerOrigin), true);
    await page.keyboard.press("Escape");
    await page.locator(".vn-popover").waitFor({ state: "detached" });
    assert.equal((await snapshot()).focusOnAnchor, true);
    assert.equal(await page.locator(".composer .prompt").inputValue(), "Unsent composition draft");
    states.push({ dismissal: "composition-then-ordinary-escape", duringComposition });
  } finally {
    await client.detach();
    await pickerOrigin.dispose();
  }
  // Standalone dialogs retain their ordinary Escape behavior.
  await anchor.click();
  await picker.waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".vn-popover").waitFor({ state: "detached" });
  assert.equal((await snapshot()).focusOnAnchor, true);
  await page.locator(".composer .prompt").focus();
  await page.keyboard.press(shortcut);
  await palette.waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
  assert.equal(await page.locator(".composer .prompt").evaluate(el => el === document.activeElement), true);
  return states;
}
