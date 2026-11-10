import assert from 'node:assert/strict';

export async function checkAppearanceRadioKeys(page) {
  const button = page.locator('.vn-theme-btn');
  await button.click();
  const picker = page.locator('.vn-popover:not([data-leaving])');
  const groups = picker.locator('[role="radiogroup"]');
  const rows = [];
  for (let g = 0; g < 3; g++) {
    const group = groups.nth(g), radios = group.locator('[role="radio"]');
    const count = await radios.count();
    await radios.first().click();
    for (const [key, index] of [['ArrowUp', count - 1], ['ArrowDown', 0], ['ArrowRight', 1], ['ArrowLeft', 0]]) {
      await page.keyboard.press(key);
      assert(await radios.nth(index).evaluate(e => e === document.activeElement));
      assert.equal(await radios.nth(index).getAttribute('aria-checked'), 'true');
      assert.equal(await group.locator('[aria-checked="true"]').count(), 1);
      assert.deepEqual(await radios.evaluateAll(items => items.filter(e => e.tabIndex === 0).map(e => e.getAttribute('aria-checked'))), ['true']);
    }
    // Native Space still activates a button that was reached programmatically.
    await radios.last().focus();
    await page.keyboard.press('Space');
    assert.equal(await radios.last().getAttribute('aria-checked'), 'true');
    assert.equal(await radios.last().getAttribute('tabindex'), '0');
    rows.push({ count, arrows: true, space: true, oneTabStop: true });
  }
  await groups.first().locator('[aria-checked="true"]').focus();
  for (let g = 1; g < 3; g++) {
    await page.keyboard.press('Tab');
    assert(await groups.nth(g).locator('[aria-checked="true"]').evaluate(e => e === document.activeElement));
  }
  await page.keyboard.press('Tab');
  assert(await picker.locator('[data-toolbar]').evaluate(e => e === document.activeElement));
  for (let g = 2; g >= 0; g--) {
    await page.keyboard.press('Shift+Tab');
    assert(await groups.nth(g).locator('[aria-checked="true"]').evaluate(e => e === document.activeElement));
  }
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  assert(await button.evaluate(e => e === document.activeElement));
  await page.keyboard.press('Enter');
  await page.locator('.vn-popover:not([data-leaving])').waitFor();
  assert(await page.locator('.vn-popover [data-scheme][aria-checked="true"]').evaluate(e => e === document.activeElement));
  await page.keyboard.press('Escape');
  await page.locator('.vn-popover').waitFor({ state: 'detached' });
  return { groups: rows, tabOrder: true, reverseTabOrder: true, reopened: true };
}
