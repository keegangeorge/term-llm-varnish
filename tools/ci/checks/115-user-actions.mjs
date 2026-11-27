import assert from 'node:assert/strict';

// Production thread helper in Chromium, with connected synthetic articles.
// This tests capability/handler safety, not newest-host or provider integration.
export async function checkUserActions(page) {
  const results = await page.evaluate(async () => {
    const style = document.querySelector('link[data-extension="varnish"]');
    const { createThread } = await import(new URL('thread.js', style.href).href);
    const root = document.createElement('div');
    root.innerHTML = '<div class="messages"></div><div class="composer"><textarea class="prompt"></textarea></div>';
    document.body.append(root);
    const messages = root.querySelector('.messages');
    const prompt = root.querySelector('.prompt');
    const writes = [];
    const commands = [];
    const confirmations = [];
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalConfirm = window.confirm;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => writes.push(text) } });
    window.confirm = (text) => { confirmations.push(text); return true; };
    prompt.addEventListener('keydown', (event) => { if (event.key === 'Enter') commands.push(prompt.value); });
    const thread = createThread(root);
    const checks = [];
    const check = (name, pass) => checks.push({ name, pass });
    const article = (source) => {
      const node = document.createElement('article');
      node.className = 'message user';
      node.innerHTML = '<div class="markdown-body"><strong>Rendered only</strong></div><button class="core-copy">Core Copy</button>';
      if (source !== null) {
        const raw = document.createElement('div');
        raw.className = 'message-text';
        raw.textContent = source;
        node.append(raw);
      }
      messages.append(node);
      return node;
    };
    const toolbar = (node) => node.querySelector(':scope > .vn-user-actions');
    const click = async (node, label) => {
      node.querySelector(`[aria-label="${label} message"]`).click();
      await Promise.resolve();
    };
    try {
      const raw = '**Markdown**\n\n- first\n- second\n';
      const supported = article(raw);
      const unsupported = article(null);
      const empty = article('');
      const coreCopy = unsupported.querySelector('.core-copy');
      thread.sync();
      check('mixed articles decorate per capability including empty source', !!toolbar(supported) && !toolbar(unsupported) && !!toolbar(empty));
      thread.sync();
      thread.process(root);
      check('repeated decoration is idempotent', supported.querySelectorAll('.vn-user-actions').length === 1 && empty.querySelectorAll('.vn-user-actions').length === 1);
      await click(supported, 'Copy');
      check('supported Copy preserves Markdown exactly', writes.at(-1) === raw);
      prompt.value = 'draft sentinel';
      await click(supported, 'Edit');
      check('supported older Edit uses raw source after confirmation', prompt.value === raw && confirmations.length === 1 && commands.length === 0);
      await click(empty, 'Copy');
      check('empty raw source is copyable', writes.at(-1) === '');
      prompt.value = 'draft sentinel';
      await click(empty, 'Edit');
      check('empty raw source is editable', prompt.value === '');
      // Read current source on activation, never the value at decoration time.
      supported.querySelector('.message-text').textContent = 'updated raw';
      await click(supported, 'Copy');
      check('Copy reads current source', writes.at(-1) === 'updated raw');
      for (const mode of ['absent source', 'detached article', 'outside root', 'not user article']) {
        const node = article('never copy this');
        thread.sync();
        const actions = toolbar(node);
        if (mode === 'absent source') node.querySelector('.message-text').remove();
        if (mode === 'detached article') node.remove();
        if (mode === 'outside root') document.body.append(node);
        if (mode === 'not user article') node.classList.remove('user');
        prompt.value = 'draft sentinel';
        const before = [writes.length, confirmations.length, commands.length];
        await click(actions, 'Copy');
        await click(actions, 'Edit');
        check(`${mode}: retained controls do nothing before sync`, prompt.value === 'draft sentinel' && writes.length === before[0] && confirmations.length === before[1] && commands.length === before[2]);
        node.remove();
      }
      for (let cycle = 0; cycle < 3; cycle++) {
        supported.querySelector('.message-text').remove();
        thread.sync();
        check(`cycle ${cycle}: unsupported toolbar removed`, !toolbar(supported));
        const source = document.createElement('div');
        source.className = 'message-text';
        source.textContent = raw;
        supported.append(source);
        thread.sync();
        check(`cycle ${cycle}: supported toolbar restored once`, supported.querySelectorAll('.vn-user-actions').length === 1);
      }
      check('unsupported core markup and Copy remain untouched', unsupported.querySelector('.core-copy') === coreCopy && unsupported.querySelector('.markdown-body strong').textContent === 'Rendered only');
      // Last-message native /undo is preserved only for supported idle articles.
      prompt.value = '';
      await click(empty, 'Edit');
      check('supported idle last Edit still requests undo', commands.at(-1) === '/undo');
      for (const markup of ['<button class="stop-btn visible"></button>', '<button id="sendBtn" class="send-btn loading stop"></button>']) {
        root.querySelector('.composer').insertAdjacentHTML('beforeend', markup);
        empty.querySelector('.message-text').textContent = 'busy raw';
        prompt.value = '';
        const count = commands.length;
        await click(empty, 'Edit');
        check(`running Edit does not undo: ${markup}`, prompt.value === 'busy raw' && commands.length === count);
        root.querySelector('.composer button').remove();
      }
      return checks;
    } finally {
      thread.dispose();
      root.remove();
      window.confirm = originalConfirm;
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete navigator.clipboard;
    }
  });
  for (const result of results) assert.equal(result.pass, true, result.name);
  return results;
}

export default { key: 'userActions', run: checkUserActions };
