import assert from 'node:assert/strict';

// Inspect real geometry after native keyboard navigation, never activate a
// potentially hidden command merely to test which row would be chosen.
export async function checkPaletteFilterScroll(page) {
  await page.mouse.move(1, 1);
  await page.keyboard.press('Control+k');
  const input = page.locator('.vn-pal-input');
  await input.waitFor({ state: 'visible' });
  await page.evaluate(() => Promise.all(document.querySelector('.vn-pal-overlay').getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await input.fill('a');
  const state = () => page.evaluate(() => {
    const input = document.querySelector('.vn-pal-input');
    const list = document.querySelector('.vn-pal-list');
    const row = document.getElementById(input.getAttribute('aria-activedescendant'));
    const bounds = list.getBoundingClientRect(), selected = row.getBoundingClientRect();
    return {
      query: input.value, id: row.id, title: row.querySelector('.vn-pal-title').textContent,
      selected: row.getAttribute('aria-selected'), focused: input === document.activeElement,
      count: list.querySelectorAll('[role="option"]').length,
      scrollTop: list.scrollTop,
      visible: selected.top >= bounds.top - 1 && selected.bottom <= bounds.bottom + 1,
    };
  });
  const results = [];
  for (const query of ['/', 'a', '']) {
    await page.keyboard.press('ArrowUp');
    const before = await state();
    assert(before.scrollTop > 0 && before.visible, 'Wrapped final row is visibly scrolled into view');
    assert.equal(before.id, `vn-pal-${before.count - 1}`);
    await input.fill(query);
    const after = await state();
    assert.equal(after.id, 'vn-pal-0');
    assert.equal(after.selected, 'true');
    assert.equal(after.focused, true);
    assert.equal(after.visible, true, 'Filtering must reveal the newly active first row');
    assert.equal(after.scrollTop, 0);
    await page.keyboard.press('ArrowDown');
    assert.equal((await state()).id, 'vn-pal-1');
    await page.keyboard.press('ArrowUp');
    assert.equal((await state()).id, 'vn-pal-0');
    results.push({ before, after });
  }
  await page.keyboard.press('Escape');
  await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
  return results;
}
