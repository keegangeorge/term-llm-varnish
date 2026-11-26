import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { BASE, allowedRequest } from './policy.mjs';
import { SCENARIOS, loadChecks } from './registry.mjs';

const out = new URL('../out/ci/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const report = { synthetic: true, fixture: 'empty session store; local.json = {}; debug:fast', results: [], blocked: [] };
const checks = await loadChecks();
const browser = await chromium.launch({
  // Explicit offline-VM override only; CI normally uses the pinned Playwright browser.
  // Never discover or silently fall back to another installed browser.
  executablePath: process.env.VARNISH_CI_CHROMIUM || undefined,
  args: ['--disable-background-networking'],
});
let failed = false;
try {
  for (const check of checks.filter((check) => check.scope === 'browser')) {
    report[check.key] = await check.run(browser);
  }
  for (const [name, options] of SCENARIOS) {
    const context = await browser.newContext({ ...options, serviceWorkers: 'block', permissions: [] });
    const errors = [];
    const blocked = [];
    const reads = new Set();
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (allowedRequest(request.url(), request.method())) {
        reads.add(new URL(request.url()).pathname);
        return route.continue();
      }
      // No bodies, headers, tokens, or URL queries are retained in artifacts.
      const url = new URL(request.url());
      blocked.push({ method: request.method(), origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', (socket) => {
      blocked.push({ method: 'WEBSOCKET' });
      socket.close();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(BASE, { waitUntil: 'load', timeout: 20000 });
      await page.locator('html[data-vn-scheme]').waitFor({ state: 'attached' });
      assert.equal(await page.locator('html').getAttribute('data-vn-scheme'), options.colorScheme);
      for (const selector of ['#appShell', '.composer .prompt', '.vn-theme-btn', '.vn-composer-bar']) {
        await page.locator(selector).first().waitFor({ state: 'attached' });
      }
      const checkResults = {};
      for (const check of checks) {
        if (check.scope !== 'page' || (check.scenarios && !check.scenarios.has(name))) continue;
        checkResults[check.key] = await check.run(page, { name, options });
      }
      await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
      // Actual safe UI commands, not injected modal markup or synthetic key handlers.
      await page.keyboard.press('Control+k');
      await page.locator('.vn-pal').waitFor({ state: 'visible' });
      await page.locator('.vn-pal-input').fill('Open settings');
      await page.locator('.vn-pal-item').filter({
        has: page.locator('.vn-pal-title').filter({ hasText: /^Open settings$/ }),
      }).waitFor({ state: 'visible' });
      await page.screenshot({ path: new URL(`${name}-palette.png`, out).pathname });
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.locator('.modal.settings-modal').waitFor({ state: 'visible' });
      await page.screenshot({ path: new URL(`${name}-settings.png`, out).pathname });
      await page.keyboard.press('Escape');
      await page.locator('.modal.settings-modal').waitFor({ state: 'hidden' });
      await page.keyboard.press('Control+k');
      await page.locator('.vn-pal').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('.vn-pal').waitFor({ state: 'hidden' });
      assert.deepEqual(errors, [], 'Uncaught browser errors');
      assert.deepEqual(blocked, [], 'Unexpected requests were blocked by the read-only policy');
      report.results.push({ name, pass: true, ...checkResults, reads: [...reads].sort() });


    } catch (error) {
      failed = true;
      report.results.push({ name, pass: false, error: String(error), pageErrors: errors });
      await page.screenshot({ path: new URL(`${name}-failure.png`, out).pathname }).catch(() => {});
    } finally {
      report.blocked.push(...blocked.map((entry) => ({ scenario: name, ...entry })));
      await context.close();
      fs.writeFileSync(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report.results, null, 2));
if (failed) process.exitCode = 1;
