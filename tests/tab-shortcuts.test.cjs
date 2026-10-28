const test = require('node:test');
const assert = require('node:assert/strict');
const { TAB_SHORTCUTS, isTabShortcutEnabled } = require('../electron/services/tabShortcuts.cjs');

test('tab shortcut map covers the controls that open or query a page', () => {
  assert.deepEqual(TAB_SHORTCUTS['open-apps'], ['apps']);
  assert.deepEqual(TAB_SHORTCUTS['ask-clipboard'], ['clipboard']);
  assert.deepEqual(TAB_SHORTCUTS['trigger-scheduled'], ['today']);
  assert.deepEqual(TAB_SHORTCUTS['open-power'], ['power']);
});

test('hiding a page disables its related shortcuts while unrelated actions stay enabled', () => {
  const visible = { apps: true, clipboard: false, today: false, controls: true, wallpaper: true, power: false };
  assert.equal(isTabShortcutEnabled('open-apps', visible), true);
  assert.equal(isTabShortcutEnabled('open-clipboard', visible), false);
  assert.equal(isTabShortcutEnabled('ask-clipboard', visible), false);
  assert.equal(isTabShortcutEnabled('trigger-scheduled', visible), false);
  assert.equal(isTabShortcutEnabled('open-controls', visible), true);
  assert.equal(isTabShortcutEnabled('open-power', visible), false);
  assert.equal(isTabShortcutEnabled('toggle-island', visible), true);
});

test('missing visibility metadata keeps a shortcut enabled for backwards compatibility', () => {
  assert.equal(isTabShortcutEnabled('open-wallpaper'), true);
  assert.equal(isTabShortcutEnabled('open-wallpaper', { wallpaper: true }), true);
});
