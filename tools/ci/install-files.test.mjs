import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const installed = read('../../install.sh').match(/^FILES=\(([^\n]+)\)/m)?.[1].split(/\s+/) ?? [];
const runner = read('./run.py');

test('every installed file also ships in the isolated CI runtime', () => {
  assert(installed.length > 0, 'install.sh FILES list found');
  for (const file of installed) assert(runner.includes(`'${file}'`), `run.py ships ${file}`);
});

test('every module imported by a shipped script is installed', () => {
  for (const file of installed.filter((name) => name.endsWith('.js'))) {
    for (const [, target] of read(`../../${file}`).matchAll(/from\s+["']\.\/([\w-]+\.js)["']/g)) {
      assert(installed.includes(target), `${file} imports ${target}, so install.sh must ship it`);
    }
  }
});
