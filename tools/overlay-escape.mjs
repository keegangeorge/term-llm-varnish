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
    await palette.waitFor({ state: "detached" });
    const afterPalette = await snapshot();
    assert.equal(afterPalette.picker, true, "only the foreground dialog closes");
    assert.equal(afterPalette.focusInPicker, true, `focus returns to the picker (${dismissal}): ${JSON.stringify(afterPalette)}`);
    assert.equal(await page.evaluate(el => document.activeElement === el, origin), true);
    await origin.dispose();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    const afterPicker = await snapshot();
    assert.equal(afterPicker.focusOnAnchor, true);
    states.push({ dismissal, afterPalette, afterPicker });
  }
  // Standalone dialogs retain their ordinary Escape behavior.
  await anchor.click();
  await picker.waitFor();
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "detached" });
  assert.equal((await snapshot()).focusOnAnchor, true);
  await page.locator(".composer .prompt").focus();
  await page.keyboard.press(shortcut);
  await palette.waitFor();
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.equal(await page.locator(".composer .prompt").evaluate(el => el === document.activeElement), true);
  return states;
}
