import assert from 'node:assert/strict';

// Trusted keyboard gestures in Chromium/Linux; not an OS or physical keyboard claim.
export async function checkPaletteModifiedArrows(page) {
  await page.keyboard.press('Control+k');
  const input = page.locator('.vn-pal-input');
  await input.waitFor({ state: 'visible' });
  await input.fill('appearance');
  const cases = [];
  try {
    for (const [key, boundary] of [['Shift+ArrowDown', 'Home'], ['Shift+ArrowUp', 'End']]) {
      await input.focus();
      await page.keyboard.press(boundary);
      const selected = await input.getAttribute('aria-activedescendant');
      await page.keyboard.press(key);
      const actual = await input.evaluate((element) => ({ start: element.selectionStart, end: element.selectionEnd }));
      // A connected, unhandled native input establishes the browser's editing behavior.
      await page.evaluate(() => {
        const control = document.createElement('input');
        control.type = 'text';
        control.id = 'vn-test-native-arrow';
        control.value = 'appearance';
        control.setAttribute('aria-label', 'Synthetic native text input control');
        document.body.append(control);
        control.focus();
      });
      await page.keyboard.press(boundary);
      await page.keyboard.press(key);
      const native = await page.locator('#vn-test-native-arrow').evaluate((element) => ({ start: element.selectionStart, end: element.selectionEnd }));
      await page.locator('#vn-test-native-arrow').evaluate((element) => element.remove());
      assert(native.end > native.start, `${key} selects native query text`);
      assert.deepEqual(actual, native, `${key} preserves native text selection`);
      assert.equal(await input.getAttribute('aria-activedescendant'), selected, `${key} must not change results`);
      cases.push({ key, actual, native });
    }
    await input.focus();
    const selected = await input.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    assert.notEqual(await input.getAttribute('aria-activedescendant'), selected, 'Plain Down still navigates');
    await page.keyboard.press('ArrowUp');
    assert.equal(await input.getAttribute('aria-activedescendant'), selected, 'Plain Up still navigates');
    return { cases, plainNavigation: true };
  } finally {
    await page.locator('#vn-test-native-arrow').evaluateAll((elements) => elements.forEach((element) => element.remove()));
    if (await input.isVisible()) {
      await input.focus();
      await page.keyboard.press('Escape');
    }
    await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
  }
}
