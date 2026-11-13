import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Load the real module body, replacing imports only. Other thread decorations
// remain uncalled; this fake textarea proves lifecycle guards, not DOM layout.
const source = fs.readFileSync(new URL('../../thread.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function fixture() {
  const frames = [];
  const document = { activeElement: null };
  const textarea = {
    value: '', scrollTop: 0, scrollHeight: 400, isConnected: true,
    focus() { document.activeElement = this; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    dispatchEvent(event) { assert.equal(event.type, 'input'); },
  };
  const context = vm.createContext({ document, Event, requestAnimationFrame: (callback) => frames.push(callback) });
  vm.runInContext(source, context);
  const root = { querySelector: () => textarea };
  return { textarea, document, frames, set: (text, options) => context.setComposerText(root, text, options) };
}
test('focused replacement reveals caret after host layout, not before', () => {
  const f = fixture();
  assert.equal(f.set('draft'), true);
  assert.equal(f.textarea.scrollTop, 0);
  f.textarea.scrollHeight = 500;
  f.frames.shift()();
  assert.equal(f.textarea.scrollTop, 500);
  assert.equal(f.textarea.selectionStart, 5);
  assert.equal(f.textarea.selectionEnd, 5);
});
for (const [name, change] of [
  ['focus moved', f => { f.document.activeElement = {}; }],
  ['textarea removed', f => { f.textarea.isConnected = false; }],
  ['draft changed', f => { f.textarea.value = 'other'; }],
  ['caret moved', f => { f.textarea.selectionStart = f.textarea.selectionEnd = 0; }],
  ['selection changed', f => { f.textarea.selectionStart = 0; }],
]) {
  test(`deferred scroll respects ${name}`, () => {
    const f = fixture();
    f.set('draft'); change(f); f.frames.shift()();
    assert.equal(f.textarea.scrollTop, 0);
  });
}
test('unfocused replacement does not focus, select or schedule scrolling', () => {
  const f = fixture();
  f.set('draft', { focus: false });
  assert.equal(f.document.activeElement, null);
  assert.equal(f.textarea.selectionStart, undefined);
  assert.equal(f.frames.length, 0);
});
