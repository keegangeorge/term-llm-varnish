import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { SCENARIOS, loadChecks } from './registry.mjs';

function checksDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varnish-checks-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return pathToFileURL(dir + path.sep);
}

const check = (fields) => `export default { run: () => true, ${fields} };\n`;

test('every committed browser check loads and validates', async () => {
  const checks = await loadChecks();
  assert.ok(checks.length > 0);
  assert.deepEqual(checks.map(({ file }) => file), checks.map(({ file }) => file).sort());
});

test('checks run in file name order with their options', async () => {
  const dir = checksDir({
    '020-later.mjs': check("key: 'later'"),
    '010-earlier.mjs': check("key: 'earlier', scenarios: ['desktop-dark']"),
    '005-whole-browser.mjs': check("key: 'wholeBrowser', scope: 'browser'"),
    'README.md': 'ignored',
  });
  const checks = await loadChecks(dir);
  assert.deepEqual(checks.map(({ key }) => key), ['wholeBrowser', 'earlier', 'later']);
  assert.deepEqual(checks.map(({ scope }) => scope), ['browser', 'page', 'page']);
  assert.deepEqual([...checks[1].scenarios], ['desktop-dark']);
  assert.equal(checks[2].scenarios, null);
});

test('invalid checks fail before the browser starts', async () => {
  const cases = [
    [{ 'palette.mjs': check("key: 'palette'") }, /NNN-kebab-case/],
    [{ '010-no-default.mjs': 'export const key = 1;\n' }, /default-export/],
    [{ '010-bad-key.mjs': check("key: 'Bad-Key'") }, /camelCase/],
    [{ '010-reserved.mjs': check("key: 'reads'") }, /reserved/],
    [{ '010-a.mjs': check("key: 'same'"), '020-b.mjs': check("key: 'same'") }, /already used by 010-a\.mjs/],
    [{ '010-no-run.mjs': "export default { key: 'noRun' };\n" }, /run must be a function/],
    [{ '010-scope.mjs': check("key: 'scope', scope: 'tab'") }, /scope must be/],
    [{ '010-scenario.mjs': check("key: 'scenario', scenarios: ['tablet']") }, /known scenario/],
    [{ '010-browser-scenario.mjs': check("key: 'x', scope: 'browser', scenarios: ['desktop-dark']") }, /only apply to page/],
  ];
  for (const [files, message] of cases) await assert.rejects(loadChecks(checksDir(files)), message);
});

test('scenario names are unique', () => {
  const names = SCENARIOS.map(([name]) => name);
  assert.equal(new Set(names).size, names.length);
});
