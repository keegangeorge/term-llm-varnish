import assert from "node:assert/strict";

// Drive both real preference entry points, retaining the original radio nodes.
export async function checkAppearanceSync(page) {
  const picker = page.locator(".vn-popover:not([data-leaving])");
  await page.locator(".vn-theme-btn").click();
  await picker.waitFor();
  await picker.locator('[data-type="comfortable"]').click();
  await picker.locator('[data-scheme="dark"]').click();
  const accentIds = await picker.locator("[data-accent]").evaluateAll((buttons) => buttons.map((b) => b.dataset.accent));
  await picker.locator(`[data-accent="${accentIds[0]}"]`).click();
  const accentName = await picker.locator(`[data-accent="${accentIds[1]}"]`).getAttribute("aria-label");
  const origin = await picker.locator('[data-type="comfortable"]').elementHandle();
  const states = [];
  try {
    for (const [command, key, expected] of [
      ["Text size: Compact", "type", "compact"],
      ["Text size: Comfortable", "type", "comfortable"],
      ["Appearance: Light", "scheme", "light"],
      ["Appearance: Dark", "scheme", "dark"],
      [`Accent: ${accentName}`, "accent", accentIds[1]],
    ]) {
      await origin.focus();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
      await page.locator(".vn-pal-input").fill(command);
      const option = page.locator(".vn-pal-item").filter({
        has: page.locator(".vn-pal-title").filter({ hasText: command }),
      });
      await option.waitFor({ state: "visible" });
      assert.equal(await option.count(), 1, `Unique palette action: ${command}`);
      await page.keyboard.press("Enter");
      await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
      const state = await picker.evaluate((element, { key }) => {
        const checked = [...element.querySelectorAll(`[data-${key}][aria-checked="true"]`)];
        return {
          actual: document.documentElement.getAttribute(`data-vn-${key}`),
          checked: checked.map((button) => button.dataset[key]),
          index: key === "accent" ? null : element.querySelector(`[data-${key}]`).closest(".vn-segment").style.getPropertyValue("--vn-seg-index"),
          focusInside: element.contains(document.activeElement),
        };
      }, { key });
      assert.equal(state.actual, expected, "Palette updates applied preference");
      assert.deepEqual(state.checked, [expected], "Open Appearance reports the actual preference");
      if (key === "type") assert.equal(state.index, expected === "compact" ? "0" : "1");
      if (key === "scheme") assert.equal(state.index, expected === "light" ? "1" : "2");
      assert.equal(state.focusInside, true);
      assert.equal(await page.evaluate((el) => el === document.activeElement && el.isConnected, origin), true, "Preference updates preserve the focused radio node");
      states.push({ command, ...state });
    }
    // The picker still works after external updates, including its switch and arrows.
    await picker.locator('[data-type="compact"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await picker.locator('[data-type="comfortable"]').getAttribute("aria-checked"), "true");
    const toolbar = picker.locator("[data-toolbar]");
    const checked = await toolbar.getAttribute("aria-checked");
    await toolbar.click();
    assert.equal(await toolbar.getAttribute("aria-checked"), String(checked !== "true"));
    await toolbar.click();
    await page.keyboard.press("Escape");
    await page.locator(".vn-popover").waitFor({ state: "detached" });
    await page.locator(".vn-theme-btn").click();
    await picker.waitFor();
    assert.equal(await picker.locator('[data-type="comfortable"]').getAttribute("aria-checked"), "true");
    assert.equal(await picker.locator(`[data-accent="${accentIds[1]}"]`).getAttribute("aria-checked"), "true");
  } finally {
    await origin.dispose();
    if (await page.locator(".vn-pal-overlay:not([data-leaving])").count()) {
      await page.keyboard.press("Escape");
      await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
    }
    // Leave the host's system scheme for subsequent configured checks.
    if (await picker.count()) {
      await picker.locator('[data-scheme="system"]').click();
      await page.keyboard.press("Escape");
      await page.locator(".vn-popover").waitFor({ state: "detached" });
    }
  }
  return states;
}
