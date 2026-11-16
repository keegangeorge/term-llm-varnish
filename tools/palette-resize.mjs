import assert from 'node:assert/strict';

// A viewport change must not leave a keyboard-selected command offscreen.
// Inspect real row geometry; never execute the command to infer selection.
export async function checkPaletteResize(page) {
  const original = page.viewportSize();
  const prompt = page.locator('.composer .prompt');
  await page.setViewportSize({ width: original.width, height: 844 });
  await prompt.focus();
  await page.mouse.move(1, 1);
  await page.keyboard.press('Control+k');
  const input = page.locator('.vn-pal-input');
  await input.waitFor({ state: 'visible' });
  const settle = async () => {
    await page.evaluate(() => Promise.all(document.querySelector('.vn-pal-overlay').getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await settle();
  await input.fill('/');
  for (let i = 0; i < 8; i++) await input.press('ArrowDown');
  const state = () => page.evaluate(() => {
    const input = document.querySelector('.vn-pal-input');
    const list = document.querySelector('.vn-pal-list');
    const row = document.getElementById(input.getAttribute('aria-activedescendant'));
    const bounds = list.getBoundingClientRect(), selected = row.getBoundingClientRect();
    return {
      query: input.value, id: row.id, title: row.querySelector('.vn-pal-title').textContent,
      selected: row.getAttribute('aria-selected'), focused: input === document.activeElement,
      selectedCount: list.querySelectorAll('[aria-selected="true"]').length,
      visible: selected.top >= Math.max(0, bounds.top) - 1 && selected.bottom <= Math.min(innerHeight, bounds.bottom) + 1,
      pageScroll: scrollY,
    };
  });
  const before = await state();
  assert.equal(before.visible, true);
  const results = [];
  for (const viewport of [
    { width: original.width, height: 320 },
    { width: original.width > 767 ? 390 : 1440, height: 844 },
    { width: original.width > 767 ? 390 : 1440, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await settle();
    const after = await state();
    assert.equal(after.visible, true, 'Viewport resize keeps the selected command visible');
    for (const key of ['query', 'id', 'title', 'selected', 'focused', 'selectedCount', 'pageScroll']) {
      assert.equal(after[key], before[key], `${key} stays unchanged on resize`);
    }
    results.push({ viewport, after });
  }
  await input.press('ArrowDown');
  assert.equal((await state()).visible, true);
  await input.press('ArrowUp');
  assert.equal((await state()).id, before.id);
  await input.press('Escape');
  await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
  assert.equal(await prompt.evaluate(node => node === document.activeElement), true);
  await page.setViewportSize(original);
  return { before, results };
}
