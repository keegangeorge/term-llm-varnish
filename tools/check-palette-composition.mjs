import assert from 'node:assert/strict';

// Chromium's input-method protocol produces trusted composition/key events.
// This is not a physical desktop IME or mobile keyboard test.
export async function checkPaletteComposition(page) {
  await page.keyboard.press('Control+k');
  const input = page.locator('.vn-pal-input');
  await input.waitFor({ state: 'visible' });
  const client = await page.context().newCDPSession(page);
  await input.evaluate((element) => {
    element.dataset.composingKeys = '';
    element.addEventListener('keydown', (event) => {
      if (event.isComposing && event.isTrusted) element.dataset.composingKeys += `${event.key},`;
    }, { capture: true });
  });
  try {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']) {
      await client.send('Input.imeSetComposition', { text: '日本語', selectionStart: 3, selectionEnd: 3 });
      const selected = await input.getAttribute('aria-activedescendant');
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
      assert.equal(await input.isVisible(), true, `Composing ${key} must not close the palette`);
      assert.equal(await input.getAttribute('aria-activedescendant'), selected, `Composing ${key} must not navigate palette results`);
      assert((await input.getAttribute('data-composing-keys')).includes(`${key},`), `Trusted composing ${key} was observed`);
    }
    await client.send('Input.insertText', { text: '日本語' });
    await input.fill('Open settings');
    const selected = await input.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    assert.notEqual(await input.getAttribute('aria-activedescendant'), selected, 'Non-composing arrows still navigate');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.locator('.modal.settings-modal').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.modal.settings-modal')?.contains(document.activeElement));
    await page.waitForTimeout(250); // Let native modal entrance/focus setup settle.
    await page.keyboard.press('Escape');
    await page.locator('.modal.settings-modal').waitFor({ state: 'hidden' });
    return { trustedComposingKeys: ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'], normalNavigation: true, normalActivation: true };
  } finally {
    await client.detach();
  }
}
