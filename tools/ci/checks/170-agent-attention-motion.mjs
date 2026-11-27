import assert from 'node:assert/strict';

// A focused stylesheet regression on the real loaded theme. The actual Hub
// unread-count/browser lifecycle is covered by the separate VM scenario.
export async function checkAgentAttentionMotion(page) {
  const originalReduce = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'vn-ci-attention-motion';
    fixture.className = 'hub-agent-group';
    fixture.setAttribute('aria-hidden', 'true');
    fixture.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none';
    const marker = document.createElement('div');
    marker.className = 'hub-agent-attention';
    fixture.append(marker);
    document.body.append(fixture);
  });
  const states = [];
  try {
    for (const dock of [false, true]) {
      await page.locator('#vn-ci-attention-motion').evaluate((e, value) => e.toggleAttribute('data-vn-dock', value), dock);
      for (const motion of ['no-preference', 'reduce', 'no-preference']) {
        await page.emulateMedia({ reducedMotion: motion });
        const state = await page.locator('#vn-ci-attention-motion .hub-agent-attention').evaluate(e => {
          const style = getComputedStyle(e);
          return {
            reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
            animation: style.animationName,
            opacity: style.opacity,
            background: style.backgroundColor,
            width: e.getBoundingClientRect().width,
            running: e.getAnimations().some(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity),
          };
        });
        assert.equal(state.reduce, motion === 'reduce');
        assert.equal(state.running, motion !== 'reduce');
        assert.equal(state.animation, motion === 'reduce' ? 'none' : 'vn-breathe');
        if (motion === 'reduce') assert.equal(state.opacity, '1');
        assert(state.width > 0, 'The static unread marker remains present');
        states.push({ dock, motion, ...state });
      }
    }
    assert(states.every(s => s.background === states[0].background), 'Unread color is preserved');
    return { states };
  } finally {
    await page.locator('#vn-ci-attention-motion').evaluate(e => e.remove());
    await page.emulateMedia({ reducedMotion: originalReduce ? 'reduce' : 'no-preference' });
  }
}

export default { key: 'agentAttentionMotion', run: checkAgentAttentionMotion };
