import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../../arrivals.js', import.meta.url), 'utf8');
const { createArrivalTracker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const record = (id, content = '') => ({ id, content });
const baseline = () => {
  const tracker = createArrivalTracker();
  assert.equal(tracker.observe('/chat/a', [record('1', 'Hello')]), false);
  return tracker;
};
test('installer ships the tracker imported by thread', () => {
  const installer = fs.readFileSync(new URL('../../install.sh', import.meta.url), 'utf8');
  const files = installer.match(/^FILES=\(([^\n]+)\)/m)?.[1].split(/\s+/);
  assert(files?.includes('arrivals.js'));
  const runner = fs.readFileSync(new URL('./run.py', import.meta.url), 'utf8');
  assert(runner.includes("'arrivals.js'"), 'isolated CI runtime ships the imported tracker too');
});
test('initial hydration and unchanged rerender are not arrivals', () => {
  const tracker = baseline();
  assert.equal(tracker.observe('/chat/a', [record('1', 'Hello')]), false);
});
test('new logical tail after known record is an arrival', () => {
  assert.equal(baseline().observe('/chat/a', [record('1'), record('2', 'Reply')]), true);
});
test('streamed text on same tail is arrival without any layout dependency', () => {
  assert.equal(baseline().observe('/chat/a', [record('1', 'Hello world')]), true);
});
test('same-length content replacement counts, geometry does not participate', () => {
  assert.equal(baseline().observe('/chat/a', [record('1', 'Other')]), true);
});
test('older history prepend is not an arrival', () => {
  assert.equal(baseline().observe('/chat/a', [record('0', 'Earlier'), record('1', 'Hello')]), false);
});
test('discontinuous replacement rebaselines', () => {
  const tracker = baseline();
  assert.equal(tracker.observe('/chat/a', [record('2', 'Other history')]), false);
  assert.equal(tracker.observe('/chat/a', [record('2'), record('3', 'Reply')]), true);
});
test('session change resets even if host reuses record identities', () => {
  assert.equal(baseline().observe('/chat/b', [record('1', 'Different chat')]), false);
});
test('empty state and reset establish fresh baselines', () => {
  const tracker = baseline();
  assert.equal(tracker.observe('/chat/a', []), false);
  assert.equal(tracker.observe('/chat/a', [record('1', 'Hydrated')]), false);
  tracker.reset();
  assert.equal(tracker.observe('/chat/a', [record('1', 'Fresh')]), false);
});
test('reordering known records and tail removal are not arrivals', () => {
  const tracker = createArrivalTracker();
  tracker.observe('/chat/a', [record('1'), record('2'), record('3')]);
  assert.equal(tracker.observe('/chat/a', [record('1'), record('3'), record('2')]), false);
  assert.equal(tracker.observe('/chat/a', [record('1'), record('3')]), false);
  assert.equal(tracker.observe('/chat/a', [record('1'), record('3'), record('4')]), true);
});
test('tool summary progress is observable without disclosure contents', () => {
  const tracker = createArrivalTracker();
  tracker.observe('/chat/a', [record('tool-1', '2 tool calls · read_file, grep')]);
  assert.equal(tracker.observe('/chat/a', [record('tool-1', '2 tool calls · read_file, grep')]), false);
  assert.equal(tracker.observe('/chat/a', [record('tool-1', '3 tool calls · read_file, grep, shell')]), true);
});
