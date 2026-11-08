import assert from 'node:assert/strict';
import fs from 'node:fs';

// Serve only these tracked modules in a fresh browser context, with no runtime
// backend. This complements the real frontend suite rather than impersonating it.
export async function checkPaletteChats(browser) {
  const sources = new Map(['palette.js', 'util.js', 'thread.js', 'arrivals.js', 'tools/palette-chats.js'].map((name) => [
    '/' + name, fs.readFileSync(new URL('../../' + name, import.meta.url), 'utf8'),
  ]));
  const results = [];
  for (const motion of ['reduce', 'no-preference']) {
    const context = await browser.newContext({ reducedMotion: motion, serviceWorkers: 'block' });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://fixture.invalid' || route.request().method() !== 'GET') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
      const source = sources.get(url.pathname);
      return source === undefined ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: source });
    });
    try {
      await page.goto('http://fixture.invalid/');
      const cases = await page.evaluate(async () => {
        const { createPalette } = await import('/palette.js');
        const { runPaletteChatTests } = await import('/tools/palette-chats.js');
        return runPaletteChatTests(createPalette);
      });
      assert.equal(cases.length, 4);
      assert.deepEqual(errors, []);
      results.push({ motion, cases });
    } finally {
      await context.close();
    }
  }
  return results;
}
