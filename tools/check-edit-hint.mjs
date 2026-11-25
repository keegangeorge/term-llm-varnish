import assert from 'node:assert/strict';
import fs from 'node:fs';

// Focused DOM unit test: the production module decorates a detached synthetic
// root. This is not host/backend integration; the paired VM scenario supplies
// real host rendering and native pointer/confirmation evidence separately.
export async function checkEditHint(page) {
  const dataURL = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const util = dataURL(fs.readFileSync(new URL('../util.js', import.meta.url), 'utf8'));
  const arrivals = dataURL(fs.readFileSync(new URL('../arrivals.js', import.meta.url), 'utf8'));
  const thread = dataURL(fs.readFileSync(new URL('../thread.js', import.meta.url), 'utf8')
    .replace('"./util.js"', JSON.stringify(util))
    .replace('"./arrivals.js"', JSON.stringify(arrivals)));
  const result = await page.evaluate(async (url) => {
    const { createThread } = await import(url);
    const root = document.createElement('div');
    root.innerHTML = '<div class="messages"><article class="message user"><div class="message-text">Older message</div></article><article class="message user"><div class="message-text">Last message</div></article></div><div class="composer"><textarea class="prompt"></textarea></div>';
    const thread = createThread(root);
    const originalConfirm = window.confirm;
    const dialogs = [];
    window.confirm = (message) => { dialogs.push(message); return false; };
    try {
      thread.sync();
      const articles = root.querySelectorAll('.message.user');
      const composer = root.querySelector('.prompt');
      const last = articles[1].querySelector('[aria-label="Edit message"]');
      const older = articles[0].querySelector('[aria-label="Edit message"]');
      const sample = (button, text) => {
        composer.value = text;
        button.dispatchEvent(new Event('pointerenter'));
        const count = dialogs.length;
        button.click();
        return { title: button.title, dialogs: dialogs.slice(count), value: composer.value };
      };
      const empty = sample(last, '');
      const draft = sample(last, 'Keep this unsent draft');
      const whitespace = sample(last, ' \n\t ');
      const stop = document.createElement('button');
      stop.className = 'stop-btn visible';
      root.querySelector('.composer').append(stop);
      const running = sample(last, 'Keep running draft');
      stop.remove();
      const oldDraft = sample(older, 'Keep older draft');
      const oldEmpty = sample(older, '');
      return { empty, draft, whitespace, running, oldDraft, oldEmpty };
    } finally {
      window.confirm = originalConfirm;
      thread.dispose();
    }
  }, thread);
  const undo = 'Edit and resend (undoes the latest turn)';
  const fresh = 'Edit as a new message';
  for (const name of ['empty', 'whitespace']) {
    assert.equal(result[name].title, undo, `${name}: undo guidance matches action`);
    assert.equal(result[name].dialogs.length, 1);
    assert.match(result[name].dialogs[0], /^Edit your last message\?/);
  }
  for (const [name, draft] of [['draft', 'Keep this unsent draft'], ['running', 'Keep running draft'], ['oldDraft', 'Keep older draft']]) {
    assert.equal(result[name].title, fresh, `${name}: no false undo promise`);
    assert.deepEqual(result[name].dialogs, ['Replace your current draft with this message?']);
    assert.equal(result[name].value, draft, `${name}: cancellation preserves text`);
  }
  assert.equal(result.oldEmpty.title, fresh);
  assert.deepEqual(result.oldEmpty.dialogs, []);
  assert.equal(result.oldEmpty.value, 'Older message');
  return { cases: 6, guidanceMatchesAction: true, cancellationPreserved: true };
}
