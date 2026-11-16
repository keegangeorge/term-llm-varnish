import assert from 'node:assert/strict';

// Use the actual frontend and native palette activation, not a mock focus API.
export async function checkPalettePreferenceFocus(page) {
  const composer = page.locator('.composer .prompt');
  const draft = 'Keep this draft';
  await composer.fill(draft);
  await composer.focus();
  await composer.evaluate((element) => element.setSelectionRange(5, 9));
  const steps = [];
  const choose = async (command, target, key, expected) => {
    await page.keyboard.press('Control+k');
    await page.locator('.vn-pal-input').fill(command);
    const row = page.locator('.vn-pal-item').filter({
      has: page.getByText(command, { exact: true }),
    });
    assert.equal(await row.count(), 1);
    assert.equal(await row.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Enter');
    await page.locator('.vn-pal-overlay').waitFor({ state: 'detached' });
    await page.waitForFunction(({ key, expected }) => document.documentElement.getAttribute(`data-vn-${key}`) === expected, { key, expected });
    assert(await target.evaluate((element) => element === document.activeElement), `${command} restores its origin`);
    assert.equal(await composer.inputValue(), draft);
    assert.deepEqual(await composer.evaluate((element) => [element.selectionStart, element.selectionEnd]), [5, 9]);
    steps.push(command);
  };
  await choose('Appearance: Dark', composer, 'scheme', 'dark');
  await choose('Text size: Compact', composer, 'type', 'compact');
  await choose('Accent: Blue', composer, 'accent', 'blue');
  // A palette preference must also return focus into a still-open picker.
  await page.locator('.vn-theme-btn').click();
  const radio = page.locator('.vn-popover:not([data-leaving]) [data-scheme="dark"]');
  await radio.focus();
  await choose('Appearance: Light', radio, 'scheme', 'light');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.vn-popover:not([data-leaving]) [data-scheme="system"]').getAttribute('aria-checked'), 'true', 'Returned picker focus accepts native arrow navigation');
  assert(await page.locator('.vn-popover:not([data-leaving]) [data-scheme="system"]').evaluate((element) => element === document.activeElement));
  await page.keyboard.press('Escape');
  await page.locator('.vn-popover').waitFor({ state: 'detached' });
  await composer.fill('');
  return { steps, draftSelectionPreserved: true, pickerKeyboardRecovery: true };
}
