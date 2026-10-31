import assert from 'node:assert/strict';

// Run against the real Appearance UI; native Tab must scroll every control into view.
export async function checkAppearance(page, resizeTo) {
  const button = page.locator('.vn-theme-btn');
  await button.click();
  const panel = page.locator('.vn-popover');
  await panel.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const p = document.querySelector('.vn-popover');
    return p && !p.getAnimations().some((animation) => animation.playState === 'running');
  }, null, { timeout: 3000 });
  if (resizeTo) {
    await page.setViewportSize(resizeTo);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const initial = await panel.evaluate((p) => {
    const rect = p.getBoundingClientRect();
    const heading = p.querySelector('.vn-popover-label').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      headingTop: heading.top, headingBottom: heading.bottom,
      width: innerWidth, height: innerHeight, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight };
  });
  assert(initial.top >= 7 && initial.bottom <= initial.height - 7, 'Appearance panel must fit vertically');
  assert(initial.left >= 7 && initial.right <= initial.width - 7, 'Appearance panel must fit horizontally');
  assert(initial.headingTop >= initial.top && initial.headingBottom <= initial.bottom, 'Appearance heading must be visible when opened');
  const controls = panel.locator('button');
  const count = await controls.count();
  assert(count > 0, 'Appearance has real controls');
  await controls.first().focus();
  for (let index = 0; index < count; index++) {
    const reachable = await controls.nth(index).evaluate((control) => {
      const r = control.getBoundingClientRect();
      const p = control.closest('.vn-popover').getBoundingClientRect();
      return control === document.activeElement && r.top >= Math.max(0, p.top) + 3 &&
        r.bottom <= Math.min(innerHeight, p.bottom) - 3 && r.left >= 0 && r.right <= innerWidth;
    });
    assert(reachable, `Appearance control ${index} must be focused and visible via Tab`);
    if (index + 1 < count) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert(await button.evaluate((b) => b === document.activeElement), 'Escape restores Appearance trigger focus');
  return initial;
}
