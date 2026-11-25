import assert from 'node:assert/strict';

// Dismissal ends interaction immediately, even while a normal-motion panel exits.
export async function checkAppearanceExit(page) {
  const trigger = page.locator('.vn-theme-btn');
  await trigger.click();
  const panel = page.locator('.vn-popover:not([data-leaving])');
  await panel.waitFor();
  await page.waitForFunction(() => !document.querySelector('.vn-popover').getAnimations().some((a) => a.playState === 'running'));
  const target = panel.locator('[data-scheme="dark"]');
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  const handle = await panel.elementHandle();
  const before = await page.evaluate(() => ({ scheme: document.documentElement.dataset.vnScheme, storage: JSON.stringify(Object.entries(localStorage).sort()) }));
  await page.keyboard.press('Escape');
  assert(await handle.evaluate((p) => !p.isConnected || p.inert), 'Departing Appearance panel must be removed or inert immediately');
  await handle.evaluate((p) => p.querySelector('[data-scheme="dark"]').focus());
  assert(await trigger.evaluate((b) => b === document.activeElement), 'Departing control cannot reclaim focus');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  assert.deepEqual(await page.evaluate(() => ({ scheme: document.documentElement.dataset.vnScheme, storage: JSON.stringify(Object.entries(localStorage).sort()) })), before, 'Dismissed controls cannot change preferences');
  assert(await trigger.evaluate((b) => b === document.activeElement), 'Exit click shield prevents underlying focus changes');
  await page.waitForFunction(() => !document.querySelector('.vn-popover, .vn-popover-backdrop'));
  await trigger.click();
  await page.locator('.vn-popover:not([data-leaving]) [data-scheme="dark"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.vnScheme), 'dark', 'Reopened controls still work');
  await page.keyboard.press('Escape');
  assert(await trigger.evaluate((b) => b === document.activeElement), 'Exit click shield prevents underlying focus changes');
  await page.waitForFunction(() => !document.querySelector('.vn-popover, .vn-popover-backdrop'));
  assert(await trigger.evaluate((b) => b === document.activeElement), 'Reopened picker restores trigger focus');
  return { dismissedInert: true, preferencePreserved: true, reopened: true };
}
