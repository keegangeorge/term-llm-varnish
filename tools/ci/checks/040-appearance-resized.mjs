import { checkAppearance } from './030-appearance.mjs';

// Resize an already-open desktop panel, then restore the scenario viewport.
async function checkAppearanceResized(page, { options }) {
  const result = await checkAppearance(page, { width: 844, height: 320 });
  await page.setViewportSize(options.viewport);
  return result;
}

export default { key: 'appearanceResized', scenarios: ['desktop-dark'], run: checkAppearanceResized };
