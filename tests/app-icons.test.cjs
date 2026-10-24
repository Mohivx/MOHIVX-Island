const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppIconResolver } = require('../electron/services/appIcons.cjs');
const picture = data => ({ isEmpty: () => false, toDataURL: () => data });

test('application icons resolve a shortcut target before its generic shell image', async () => {
  const calls = [];
  const resolve = createAppIconResolver({
    exists: () => true, nativeImage: {},
    shell: { readShortcutLink: () => ({ target: 'C:\\Apps\\chrome.exe', icon: '' }) },
    app: { getFileIcon: async file => { calls.push(file); return picture(file.endsWith('.exe') ? 'real-logo' : 'generic-shortcut'); } },
  });
  assert.equal(await resolve('C:\\Start\\Chrome.lnk'), 'real-logo');
  assert.deepEqual(calls, ['C:\\Apps\\chrome.exe']);
});

test('custom shortcut ICO is preserved, and timed out targets fall back without blocking icon discovery', async () => {
  const deps = { exists: () => true, timeoutMs: 10, nativeImage: { createFromPath: () => picture('custom-ico') },
    shell: { readShortcutLink: () => ({ target: 'target.exe', icon: 'chosen.ico' }) },
    app: { getFileIcon: file => file === 'target.exe' ? new Promise(() => {}) : Promise.resolve(picture('shell-fallback')) },
  };
  assert.equal(await createAppIconResolver(deps)('start.lnk'), 'custom-ico');
  deps.shell.readShortcutLink = () => ({ target: 'target.exe' });
  assert.equal(await createAppIconResolver(deps)('start.lnk'), 'shell-fallback');
});
