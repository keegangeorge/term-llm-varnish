import assert from 'node:assert/strict';

// Exercise the real palette in Chromium's forced-colors emulation. This is not
// physical Windows high-contrast coverage or a replacement for image review.
export async function checkPaletteContrast(page) {
  const composer = page.locator('.composer .prompt');
  const original = await composer.inputValue();
  await composer.focus();
  const results = [];
  try {
    for (const forcedColors of ['none', 'active']) {
      await page.emulateMedia({ forcedColors });
      await page.keyboard.press('Control+k');
      const input = page.locator('.vn-pal-overlay:not([data-leaving]) .vn-pal-input');
      await input.waitFor();
      await input.fill('Appearance:');
      const first = await input.getAttribute('aria-activedescendant');
      await input.press('ArrowDown');
      assert.notEqual(await input.getAttribute('aria-activedescendant'), first);
      const measure = await page.locator('.vn-pal-item[aria-selected="true"]').evaluate((e) => {
        const s = getComputedStyle(e);
        return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, adjust: s.forcedColorAdjust };
      });
      assert.equal(measure.adjust, 'auto', 'Respect the user-selected system palette');
      if (forcedColors === 'active') {
        assert.equal(measure.style, 'solid', 'Forced-colors selection needs a visible indicator');
        assert.equal(measure.width, '2px');
        assert.equal(measure.offset, '-2px');
        assert.equal(await page.locator('.vn-pal-item[aria-selected="false"]').first().evaluate((e) => getComputedStyle(e).outlineStyle), 'none');
      } else {
        assert.equal(measure.style, 'none', 'Ordinary themes keep their existing fill-only selection');
      }
      await input.press('Escape');
      await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
      assert(await composer.evaluate((e) => e === document.activeElement));
      assert.equal(await composer.inputValue(), original);
      results.push({ forcedColors, ...measure });
    }
    return { results, navigation: true, focusRestored: true, draftPreserved: true };
  } finally {
    await page.emulateMedia({ forcedColors: 'none' });
  }
}
