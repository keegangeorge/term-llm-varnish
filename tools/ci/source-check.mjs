#!/usr/bin/env node
// Dependency-free source checks. No application imports or browser startup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function lightTokensMatch(css) {
  const grab = (re) => css.match(re)?.[1]?.replace(/\s+/g, ' ').trim();
  const light = grab(/:root\[data-vn-scheme="light"\] \{([\s\S]*?)\n\}\n/);
  const copy = grab(/:root:not\(\[data-vn-scheme\]\) \{([\s\S]*?)\}\n\}/);
  return Boolean(light) && light === copy;
}

export function checkAssets(root) {
  const manifest = fs.readFileSync(path.join(root, 'extension.yaml'), 'utf8');
  if (!/^format_version: 1\s*$/m.test(manifest)) throw new Error('Unsupported extension format');
  for (const key of ['css', 'js']) {
    const values = [...manifest.matchAll(new RegExp(`^${key}: (.+)$`, 'gm'))];
    if (values.length !== 1) throw new Error(`Expected one ${key} asset`);
    const name = values[0][1].trim();
    const file = path.resolve(root, name);
    if (path.isAbsolute(name) || !file.startsWith(`${path.resolve(root)}${path.sep}`) ||
        !fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`)) {
      throw new Error(`Unsafe ${key} asset: ${name}`);
    }
  }
  const example = JSON.parse(fs.readFileSync(path.join(root, 'local.example.json'), 'utf8'));
  if (!example || Array.isArray(example) || typeof example !== 'object') throw new Error('Expected example object');
  for (const key of ['nodeAccents', 'nodeIcons']) {
    const map = example[key];
    if (!map || Array.isArray(map) || typeof map !== 'object' || Object.values(map).some((v) => typeof v !== 'string')) {
      throw new Error(`Expected ${key} string map`);
    }
  }
  if (!fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').includes('MIT License')) throw new Error('Missing MIT license');
  if (!fs.readFileSync(path.join(root, 'fonts/OFL.txt'), 'utf8').includes('SIL OPEN FONT LICENSE')) throw new Error('Missing font license');
  if (!lightTokensMatch(fs.readFileSync(path.join(root, 'style.css'), 'utf8'))) throw new Error('Pre-JS light tokens drifted');
}

export function jsFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', 'out', '.ci-runtime'].includes(entry.name)) return [];
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return jsFiles(file);
    return entry.isFile() && /\.(m?js)$/.test(entry.name) ? [file] : [];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  checkAssets(root);
  const files = jsFiles(root);
  for (const file of files) {
    // stdin with module mode supports the browser ESM files without a root package.json.
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(file), encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`${path.relative(root, file)}: ${result.stderr || result.error}`);
  }
  console.log(`Source checks passed (${files.length} JavaScript files; assets, examples, licenses, light tokens)`);
}
