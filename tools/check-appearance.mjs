import assert from 'node:assert/strict';

// Run against the real Appearance UI; native Tab must scroll each group's checked radio and the switch into view.
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
  const controls = panel.locator('button:not([tabindex="-1"])');
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
  if (resizeTo) {
    const focused = await controls.last().elementHandle();
    const samePanel = await panel.elementHandle();
    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 320 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Crossing the mobile breakpoint starts the existing sheet-entry animation.
      // Inspect the settled same panel, not its intentional offscreen entry frame.
      await page.waitForFunction(() => {
        const p = document.querySelector('.vn-popover');
        return p && !p.getAnimations().some((animation) => animation.playState === 'running');
      }, null, { timeout: 3000 });
      const preserved = await page.evaluate(({ focused, samePanel }) => {
        const r = focused.getBoundingClientRect();
        const p = samePanel.getBoundingClientRect();
        return { samePanel: samePanel === document.querySelector('.vn-popover'), connected: focused.isConnected,
          focused: focused === document.activeElement, top: p.top, bottom: p.bottom,
          controlTop: r.top, controlBottom: r.bottom, height: innerHeight, scrollTop: samePanel.scrollTop }; 
      }, { focused, samePanel });
      assert(preserved.samePanel && preserved.connected && preserved.focused && preserved.top >= 7 && preserved.bottom <= preserved.height - 7 && preserved.controlTop >= Math.max(0, preserved.top) + 3 && preserved.controlBottom <= Math.min(preserved.height, preserved.bottom) - 3, `Same open Appearance panel retains visible focused control across resize: ${JSON.stringify({ viewport, ...preserved })}`);
    }
  }
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert(await button.evaluate((b) => b === document.activeElement), 'Escape restores Appearance trigger focus');
  return initial;
}
