import assert from 'node:assert/strict';

// Exercise the real palette/composer; never submit a command or prompt.
export async function checkDraftCaret(page) {
  const composer = page.locator('.composer .prompt');
  const original = await composer.inputValue();
  const draft = '  Unsent draft 日本語\nSecond line <literal> ' + 'long-word'.repeat(40) + '\nFinal line  ';
  const states = [];
  try {
    for (const command of ['/rename', '/new']) {
      await composer.fill(draft);
      await composer.focus();
      // Allow the host's input-driven autosize to run before moving the caret.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.press('Control+End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Control+k');
      const input = page.locator('.vn-pal-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(command);
      await page.locator('.vn-pal-item').filter({
        has: page.locator('.vn-pal-title').filter({ hasText: new RegExp('^' + command + '$') }),
      }).click();
      const expected = command + ' ' + draft;
      await page.waitForFunction((text) => {
        const e = document.querySelector('.composer .prompt');
        return e?.value === text && document.activeElement === e;
      }, expected);
      await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await composer.evaluate((e) => ({
        value: e.value, start: e.selectionStart, end: e.selectionEnd,
        top: e.scrollTop, height: e.scrollHeight, client: e.clientHeight,
      }));
      assert.equal(state.value, expected, 'Full draft retained');
      assert.equal(state.start, expected.length, 'Caret at draft end');
      assert.equal(state.end, expected.length, 'No selected text');
      // Six pixels allows textarea padding/rounding, not a hidden final line.
      assert(state.top + state.client >= state.height - 6, 'Draft end stays visible after palette insertion');
      states.push({ command, top: state.top, height: state.height, client: state.client });
    }
    return states;
  } finally {
    await composer.fill(original);
  }
}
