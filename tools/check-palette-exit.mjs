import assert from 'node:assert/strict';

// Real frontend regression. Native pointer input must land on the retained
// overlay, not a departing option or the page underneath it.
export async function checkPaletteExit(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const composer = page.locator('.composer .prompt');
  const draft = await composer.inputValue();
  await composer.focus();
  const scheme = await page.locator('html').getAttribute('data-vn-scheme');
  await page.keyboard.press('Control+k');
  const old = await page.locator('.vn-pal-overlay:not([data-leaving])').elementHandle();
  const input = page.locator('.vn-pal-overlay:not([data-leaving]) .vn-pal-input');
  await input.fill(`Appearance: ${scheme === 'dark' ? 'Light' : 'Dark'}`);
  await page.waitForTimeout(200);
  const rect = await page.locator('.vn-pal-item').first().boundingBox();
  await old.evaluate((node) => {
    node.dataset.nativeShield = 'false';
    node.addEventListener('pointerdown', (event) => {
      node.dataset.nativeShield = String(event.isTrusted && event.target === node && node.hasAttribute('data-leaving'));
    });
  });
  await page.keyboard.press('Escape');
  assert(await old.evaluate((node) => node.querySelector('.vn-pal').inert), 'Departing panel is immediately inert');
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(await old.getAttribute('data-native-shield'), 'true', 'Native pointer hits the leaving shield');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('html').getAttribute('data-vn-scheme'), scheme, 'Dismissed option does not run');
  assert(await composer.evaluate((node) => node === document.activeElement), 'Shield preserves restored focus');
  assert.equal(await composer.inputValue(), draft, 'Draft is unchanged');
  await page.keyboard.press('Control+k');
  const rapidOld = await page.locator('.vn-pal-overlay:not([data-leaving])').elementHandle();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const fresh = await page.locator('.vn-pal-overlay:not([data-leaving])').elementHandle();
  assert(await fresh.evaluate((node) => !node.querySelector('.vn-pal').inert), 'Fresh panel is active');
  await page.waitForTimeout(200);
  assert.equal(await rapidOld.evaluate((node) => node.isConnected), false, 'Old panel is removed');
  assert(await fresh.evaluate((node) => node.isConnected && node.contains(document.activeElement)), 'Fresh panel survives with focus');
  await page.locator('.vn-pal-overlay:not([data-leaving]) .vn-pal-input').fill('Focus message box');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert(await composer.evaluate((node) => node === document.activeElement), 'Normal chosen action still runs');
  return { inertExit: true, nativeShield: true, restoredFocus: true, rapidReopen: true, normalActivation: true };
}
