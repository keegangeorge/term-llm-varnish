import assert from 'node:assert/strict';

// Real production helper and real Chromium selectors, with a detached DOM unit
// root. This does not claim an active provider or newest-backend integration.
export async function checkRunningState(page) {
  const results = await page.evaluate(async () => {
    const style = document.querySelector('link[data-extension="varnish"]');
    if (!style) throw new Error('Varnish stylesheet missing');
    const { isRunning } = await import(new URL('util.js', style.href).href);
    const cases = [
      ['idle send', '<div class="composer"><button id="sendBtn" class="send-btn"></button></div>', false],
      ['legacy stop', '<div class="composer"><button class="stop-btn visible"></button></div>', true],
      ['hidden legacy stop', '<div class="composer"><button class="stop-btn"></button></div>', false],
      ['combined stop', '<div class="composer"><button id="sendBtn" class="send-btn loading stop"></button></div>', true],
      ['loading without stop', '<div class="composer"><button id="sendBtn" class="send-btn loading"></button></div>', false],
      ['stop outside composer', '<button id="sendBtn" class="send-btn stop"></button><button class="stop-btn visible"></button><div class="composer"></div>', false],
      ['unrelated stop class', '<div class="composer"><button class="stop"></button></div>', false],
    ];
    return cases.map(([name, html, expected]) => {
      const root = document.createElement('div');
      root.innerHTML = html;
      return { name, expected, actual: isRunning(root) };
    });
  });
  for (const result of results) assert.equal(result.actual, result.expected, result.name);
  return results;
}
