import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkAssets, lightTokensMatch, jsFiles } from './source-check.mjs';

const css = ':root[data-vn-scheme="light"] {\n --a: white;\n}\n@media (prefers-color-scheme: light) {\n:root:not([data-vn-scheme]) {\n --a: white;\n}\n}\n';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'varnish-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'fonts'));
  for (const [file, text] of Object.entries({
    'extension.yaml': 'format_version: 1\ncss: style.css\njs: main.js\n',
    'style.css': css, 'main.js': 'export {};',
    'local.example.json': '{"nodeAccents":{},"nodeIcons":{}}',
    LICENSE: 'MIT License', 'fonts/OFL.txt': 'SIL OPEN FONT LICENSE',
  })) fs.writeFileSync(path.join(root, file), text);
  return root;
}
test('valid assets and token copy', (t) => assert.doesNotThrow(() => checkAssets(fixture(t))));
test('token drift or absent blocks fail', () => {
  assert.equal(lightTokensMatch(css.replace('--a: white;', '--a: black;')), false);
  assert.equal(lightTokensMatch(''), false);
});
for (const [name, file, text] of [
  ['malformed JSON', 'local.example.json', '{'],
  ['bad map', 'local.example.json', '{"nodeAccents":[],"nodeIcons":{}}'],
  ['missing asset', 'extension.yaml', 'format_version: 1\ncss: missing.css\njs: main.js\n'],
  ['path traversal', 'extension.yaml', 'format_version: 1\ncss: ../outside.css\njs: main.js\n'],
  ['missing license', 'LICENSE', ''],
]) test(name, (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, file), text);
  assert.throws(() => checkAssets(root));
});
test('syntax scan skips dependencies and artifacts', (t) => {
  const root = fixture(t);
  for (const dir of ['node_modules', 'out', '.ci-runtime']) {
    fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, dir, 'ignored.js'), 'bad');
  }
  assert.deepEqual(jsFiles(root), [path.join(root, 'main.js')]);
});
