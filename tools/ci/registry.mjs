import fs from 'node:fs';

// Browser scenarios every page check runs in, in this order.
export const SCENARIOS = [
  ['desktop-dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }],
  ['desktop-light', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }],
  ['mobile-dark', { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true }],
  ['short-mobile-light', { viewport: { width: 568, height: 320 }, colorScheme: 'light', isMobile: true, hasTouch: true }],
  ['short-desktop-dark', { viewport: { width: 844, height: 320 }, colorScheme: 'dark' }],
];

export const CHECKS_DIR = new URL('./checks/', import.meta.url);

const FILE_NAME = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/;
const KEY = /^[a-z][A-Za-z0-9]*$/;
// Keys the harness writes itself into each scenario result or the report.
const RESERVED_KEYS = new Set(['name', 'pass', 'error', 'pageErrors', 'reads', 'synthetic', 'fixture', 'results', 'blocked']);
const SCOPES = new Set(['page', 'browser']);

// Each file in checks/ default-exports { key, run, scope?, scenarios? }.
// Files run in name order, so the numeric prefix fixes the order checks share
// a page in. Adding a check means adding a file; nothing else needs editing.
export async function loadChecks(dir = CHECKS_DIR) {
  const scenarioNames = new Set(SCENARIOS.map(([name]) => name));
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.mjs')).sort();
  const keys = new Map();
  const checks = [];
  for (const file of files) {
    if (!FILE_NAME.test(file)) throw new Error(`${file}: name browser checks NNN-kebab-case.mjs`);
    const check = (await import(new URL(file, dir))).default;
    if (!check || typeof check !== 'object') throw new Error(`${file}: default-export { key, run }`);
    const { key, run, scope = 'page', scenarios } = check;
    if (typeof key !== 'string' || !KEY.test(key)) throw new Error(`${file}: key must be a camelCase identifier`);
    if (RESERVED_KEYS.has(key)) throw new Error(`${file}: key "${key}" is reserved by the harness`);
    if (keys.has(key)) throw new Error(`${file}: key "${key}" is already used by ${keys.get(key)}`);
    if (typeof run !== 'function') throw new Error(`${file}: run must be a function`);
    if (!SCOPES.has(scope)) throw new Error(`${file}: scope must be "page" or "browser"`);
    if (scenarios !== undefined) {
      if (scope !== 'page') throw new Error(`${file}: scenarios only apply to page checks`);
      if (!Array.isArray(scenarios) || !scenarios.length || scenarios.some((name) => !scenarioNames.has(name))) {
        throw new Error(`${file}: scenarios must list known scenario names`);
      }
    }
    keys.set(key, file);
    checks.push({ file, key, run, scope, scenarios: scenarios ? new Set(scenarios) : null });
  }
  return checks;
}
