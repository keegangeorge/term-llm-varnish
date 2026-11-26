import assert from 'node:assert/strict';

// Exercise the real empty-chat controls without sending a prompt or opening a
// shell. In particular, locators must use exposed roles, not just CSS classes.
export async function checkStarterButtons(page) {
  const group = page.getByRole('group', { name: 'Conversation starters', exact: true });
  await group.waitFor({ state: 'visible' });
  const labels = ['Review a pull request', 'Run the specs', 'Explain this codebase', 'Open a shell'];
  assert.equal(await group.getByRole('button').count(), labels.length);
  for (const name of labels) {
    assert.equal(await group.getByRole('button', { name, exact: true }).count(), 1, name);
  }
  assert.equal(await group.getByRole('listitem').count(), 0);
  const prompt = page.locator('.composer .prompt');
  const original = await prompt.inputValue();
  const results = [];
  for (const [index, activation, text] of [
    [0, 'Enter', 'Review this pull request: '],
    [1, 'Space', 'Run the specs for '],
    [2, 'pointer', 'Give me a tour of this codebase: the main pieces and how they fit together.'],
  ]) {
    // This helper covers empty-chat starter semantics. Draft replacement and its
    // native confirmation are exercised separately by checkStarterDraft().
    await prompt.fill('');
    const button = group.getByRole('button', { name: labels[index], exact: true });
    if (activation === 'pointer') await button.click();
    else { await button.focus(); await page.keyboard.press(activation); }
    assert.equal(await prompt.inputValue(), text);
    assert.equal(await prompt.evaluate(node => node === document.activeElement), true);
    results.push({ name: labels[index], activation, text });
  }
  // Confirm normal sequential keyboard discovery of all four actions. The last
  // is focus-only: submitting /shell is not necessary to prove its semantics.
  await group.getByRole('button', { name: labels[0], exact: true }).focus();
  const tabOrder = [];
  for (let i = 0; i < labels.length; i++) {
    tabOrder.push(await page.evaluate(() => document.activeElement.textContent));
    if (i < labels.length - 1) await page.keyboard.press('Tab');
  }
  assert.deepEqual(tabOrder, labels);
  await prompt.fill(original);
  return { buttons: labels.length, labels, tabOrder, results, snapshot: await group.ariaSnapshot(), shellActivated: false };
}
