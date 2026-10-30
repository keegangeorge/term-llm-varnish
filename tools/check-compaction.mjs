// CSS-state regression only: synthetic markup from term-llm 0.9.88
// (c04964eb). This does NOT invoke /compact or prove backend completion.
// Run against an isolated, already-running term-llm with Varnish enabled.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const target = new URL(process.env.TERM_LLM_TEST_URL || "http://127.0.0.1:18080/ui/");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Use an isolated loopback fixture");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  // No session creation, compaction or generation requests are needed.
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== target.origin || !["GET", "HEAD"].includes(request.method())) {
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.locator("html[data-vn-scheme]").waitFor();
  await page.locator(".composer-inner").waitFor();
  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.id = "varnish-compaction-css-fixture";
    banner.className = "interaction-attention-banner compaction-status";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = '<span class="compaction-status-spinner" aria-hidden="true"></span>Compacting conversation context…';
    document.querySelector(".composer-inner").prepend(banner);
  });
  for (const scheme of ["dark", "light"]) {
    await page.locator(".vn-theme-btn").click();
    await page.locator(`.vn-popover [data-scheme="${scheme}"]`).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction((value) => document.documentElement.dataset.vnScheme === value, scheme);
    for (const accent of ["indigo", "green", "graphite"]) {
      // Token-state fixture, not a test of the appearance control itself.
      await page.evaluate((value) => { document.documentElement.dataset.vnAccent = value; }, accent);
      const state = await page.locator("#varnish-compaction-css-fixture").evaluate((element) => {
        const style = getComputedStyle(element);
        const spinner = element.querySelector(".compaction-status-spinner");
        const spinnerStyle = getComputedStyle(spinner);
        const probe = document.createElement("span");
        probe.style.color = "var(--vn-accent)";
        probe.style.borderTop = "1px solid var(--vn-glass-border)";
        element.append(probe);
        const expected = getComputedStyle(probe);
        const result = {
          accent: spinnerStyle.borderTopColor,
          expectedAccent: expected.color,
          border: style.borderTopColor,
          expectedBorder: expected.borderTopColor,
          radius: style.borderTopLeftRadius,
          animation: spinnerStyle.animationName,
          role: element.getAttribute("role"),
          live: element.getAttribute("aria-live"),
          decorativeSpinner: spinner.getAttribute("aria-hidden"),
        };
        probe.remove();
        return result;
      });
      assert.equal(state.accent, state.expectedAccent, `${scheme}/${accent}: accent spinner`);
      assert.equal(state.border, state.expectedBorder, `${scheme}/${accent}: glass border`);
      assert.equal(state.radius, "18px");
      assert.equal(state.animation, "none", "upstream reduced-motion behavior survives");
      assert.equal(state.role, "status");
      assert.equal(state.live, "polite");
      assert.equal(state.decorativeSpinner, "true");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.locator("#varnish-compaction-css-fixture").boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390, "mobile banner fits");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no mobile overflow");
  assert.deepEqual(pageErrors, []);
  console.log("Compaction CSS fixture: dark/light, three accents, reduced motion, status semantics and mobile fit passed. Command/backend lifecycle NOT tested.");
} finally {
  await browser.close();
}
