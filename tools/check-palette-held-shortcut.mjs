import assert from 'node:assert/strict';

// Native held-key events, not synthetic key handlers. Run against the real UI.
export async function checkPaletteHeldShortcut(page) {
  const prompt = page.locator('.composer .prompt');
  const draft = await prompt.inputValue();
  const overlay = page.locator('.vn-pal-overlay:not([data-leaving])');
  const input = overlay.locator('.vn-pal-input');
  await prompt.focus();
  try {
    await page.keyboard.down('Control');
    await page.keyboard.down('k');
    await input.waitFor({ state: 'visible' });
    await input.fill('Text size');
    const selected = await input.getAttribute('aria-activedescendant');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('k'); // K has not been released: repeat=true.
      assert.equal(await input.count(), 1, 'Held shortcut keeps one palette open');
      assert.equal(await input.inputValue(), 'Text size', 'Repeats retain query');
      assert.equal(await input.getAttribute('aria-activedescendant'), selected);
      assert(await input.evaluate(e => e === document.activeElement));
      assert.equal(await page.locator('.modal:visible').count(), 0, 'Host Widgets shortcut stays consumed');
    }
    await page.keyboard.up('k');
    await page.keyboard.down('k'); // A distinct press still toggles closed.
    await overlay.waitFor({ state: 'detached' });
    await page.keyboard.down('k');
    assert.equal(await overlay.count(), 0, 'Repeat of closing press does not reopen');
    assert(await prompt.evaluate(e => e === document.activeElement));
    await page.keyboard.up('k');
    await page.keyboard.up('Control');
    await page.keyboard.press('Control+k');
    await input.waitFor({ state: 'visible' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
    assert(await prompt.evaluate(e => e === document.activeElement));
    assert.equal(await prompt.inputValue(), draft, 'Composer draft is preserved');
    return { heldOpen: true, queryRetained: true, separatePressToggles: true, heldClosed: true, reopened: true, focusRestored: true, composerPreserved: true };
  } finally {
    await page.keyboard.up('k');
    await page.keyboard.up('Control');
  }
}
