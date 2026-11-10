import assert from "node:assert/strict";

// Real pointer defaults must not strand the modal palette's combobox on BODY.
export async function checkPalettePointerFocus(page) {
  const prompt = page.locator(".composer .prompt");
  const original = await prompt.inputValue();
  const draft = "Pointer-focus regression — keep this draft unchanged";
  const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";
  const overlay = page.locator(".vn-pal-overlay:not([data-leaving])");
  const input = overlay.locator(".vn-pal-input");
  const states = [];
  const open = async () => {
    await prompt.focus();
    await page.keyboard.press(shortcut);
    await input.waitFor();
  };
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
    assert.equal(await prompt.evaluate(e => e === document.activeElement), true);
    assert.equal(await prompt.inputValue(), draft);
  };
  await prompt.fill(draft);
  for (const target of [".vn-pal-group", ".vn-pal-foot", ".vn-pal-search-icon", ".vn-pal-search .vn-kbd"]) {
    await open();
    const content = overlay.locator(target).first();
    // The compact layout intentionally hides its keyboard-hint footer.
    if (!(await content.isVisible())) {
      assert.equal(target, ".vn-pal-foot");
      states.push({ target, hidden: true });
      await close();
      continue;
    }
    await content.click();
    assert.equal(await input.evaluate(e => e === document.activeElement), true, `${target} keeps combobox focus`);
    const before = await input.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    const after = await input.getAttribute("aria-activedescendant");
    assert.notEqual(after, before);
    await page.keyboard.press("ArrowUp");
    assert.equal(await input.getAttribute("aria-activedescendant"), before);
    await close();
    states.push({ target, before, after, closed: true });
  }
  // Native text clicks and selection are not prevented by the panel handler.
  await open();
  await input.fill("pointer selection sentinel");
  await input.click({ clickCount: 3 });
  assert.deepEqual(await input.evaluate(e => [e.selectionStart, e.selectionEnd]), [0, 26]);
  await page.keyboard.press("Backspace");
  assert.equal(await input.inputValue(), "");
  await close();
  // Pointer option activation still runs exactly the intended safe command.
  await open();
  await input.fill("Text size: Compact");
  await overlay.locator(".vn-pal-item").first().click();
  await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-vn-type") === "compact");
  assert.equal(await prompt.inputValue(), draft);
  await open();
  await input.fill("Text size: Comfortable");
  await page.keyboard.press("Enter");
  await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-vn-type") === "comfortable");
  // Backdrop must close, not refocus a detached input.
  await open();
  await overlay.click({ position: { x: 2, y: 2 } });
  await page.locator(".vn-pal-overlay").waitFor({ state: "detached" });
  assert.equal(await prompt.evaluate(e => e === document.activeElement), true);
  assert.equal(await prompt.inputValue(), draft);
  await prompt.fill(original);
  return states;
}
