import assert from 'node:assert/strict';

export async function checkStarterDraft(page) {
  const composer = page.locator('.composer .prompt');
  const draft = 'Unsent migration notes — keep every line.\nPR 123';
  const dialogs = [];
  let accept = false;
  const handleDialog = async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on('dialog', handleDialog);
  try {
    for (const [index, label] of ['Review a pull request', 'Run the specs', 'Explain this codebase', 'Open a shell'].entries()) {
      await composer.fill(draft);
      const starter = page.getByText(label, { exact: true });
      const count = dialogs.length;
      if (index === 1) {
        await starter.focus();
        await page.keyboard.press('Enter');
      } else await starter.click();
      assert.equal(dialogs.length, count + 1, `${label} asks before replacing a draft`);
      assert.equal(dialogs.at(-1).type, 'confirm');
      assert.equal(dialogs.at(-1).message, 'Replace your current draft with this starter?');
      assert.equal(await composer.inputValue(), draft, `${label} cancellation preserves draft`);
      assert.equal(await page.locator('.shell-overlay').count(), 0, 'Cancelled shell starter does not open shell');
    }
    accept = true;
    await page.getByText('Run the specs', { exact: true }).click();
    assert.equal(dialogs.length, 5, 'Accepting replacement still asks first');
    assert.equal(await composer.inputValue(), 'Run the specs for ');
    assert.equal(await composer.evaluate((el) => el === document.activeElement), true);
    const selection = await composer.evaluate((el) => [el.selectionStart, el.selectionEnd]);
    assert.deepEqual(selection, [18, 18]);
    for (const [initial, label, expected] of [
      ['', 'Review a pull request', 'Review this pull request: '],
      [' \n ', 'Explain this codebase', 'Give me a tour of this codebase: the main pieces and how they fit together.'],
    ]) {
      await composer.fill(initial);
      await page.getByText(label, { exact: true }).click();
      assert.equal(dialogs.length, 5, 'Empty and whitespace-only drafts need no confirmation');
      assert.equal(await composer.inputValue(), expected);
    }
    await composer.fill('');
    return { cancelled: 4, accepted: 1, emptyOrWhitespace: 2, keyboardCancellation: true };
  } finally {
    page.off('dialog', handleDialog);
  }
}
