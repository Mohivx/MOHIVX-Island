'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { test, describe, beforeEach, afterEach } = require('node:test');

const { WindowsBannerControl } = require('../electron/services/windowsBannerControl.cjs');

describe('WindowsBannerControl Service', () => {
  let tmpDir;
  let stateFilePath;
  let dummyScriptPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbc-test-'));
    stateFilePath = path.join(tmpDir, 'windows_banner_state.json');
    dummyScriptPath = path.join(tmpDir, 'mock_script.ps1');
    fs.writeFileSync(dummyScriptPath, '# dummy', 'utf8');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup error
    }
  });

  test('status() reads journal synchronously without invoking openSettings or runScript', async () => {
    let settingsOpened = false;
    let scriptRan = false;

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { settingsOpened = true; },
      canReplace: async () => true,
      runScript: async () => { scriptRan = true; return { success: true, state: 'Off' }; }
    });

    const initialStatus = control.status();
    assert.strictEqual(initialStatus.success, true);
    assert.strictEqual(initialStatus.active, false);
    assert.strictEqual(initialStatus.owned, false);
    assert.strictEqual(settingsOpened, false);
    assert.strictEqual(scriptRan, false);
  });

  test('canReplace gate denies before opening UI or running script', async () => {
    let settingsOpened = false;
    let scriptRan = false;

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { settingsOpened = true; },
      canReplace: async () => false,
      runScript: async () => { scriptRan = true; return { success: true, state: 'Off' }; }
    });

    const res = await control.enable();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'gate-denied');
    assert.strictEqual(settingsOpened, false);
    assert.strictEqual(scriptRan, false);
  });

  test('enable: Off -> On saves original Off before toggle and verifies', async () => {
    const actions = [];
    let stateAtToggleTime = null;

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { actions.push('openSettings'); },
      canReplace: async () => true,
      runScript: async (action) => {
        actions.push(`runScript:${action}`);
        if (action === 'read') {
          return { success: true, state: 'Off', before: 'Off', changed: false };
        }
        if (action === 'on') {
          // Verify journal was persisted BEFORE toggling on
          if (fs.existsSync(stateFilePath)) {
            const raw = fs.readFileSync(stateFilePath, 'utf8');
            stateAtToggleTime = JSON.parse(raw);
          }
          return { success: true, state: 'On', before: 'Off', changed: true };
        }
        return { success: false, code: 'unsupported' };
      }
    });

    const res = await control.enable();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.owned, true);
    assert.deepStrictEqual(actions, ['openSettings', 'runScript:read', 'runScript:on']);

    // Ensure atomic journal was written with originalState Off before toggling
    assert.ok(stateAtToggleTime !== null);
    assert.strictEqual(stateAtToggleTime.originalState, 'Off');
    assert.strictEqual(stateAtToggleTime.owned, true);

    const stat = control.status();
    assert.strictEqual(stat.active, true);
    assert.strictEqual(stat.owned, true);
  });

  test('repeat enable keeps originalOff record and does not overwrite it', async () => {
    // Initial enable from Off -> On
    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async (action) => {
        if (action === 'read') return { success: true, state: 'Off' };
        if (action === 'on') return { success: true, state: 'On' };
      }
    });

    await control.enable();
    const stat1 = control.status();
    assert.strictEqual(stat1.originalState, 'Off');

    // Second enable when OS is now already On
    const control2 = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async (action) => {
        if (action === 'read') return { success: true, state: 'On' };
        throw new Error('should not toggle');
      }
    });

    const res2 = await control2.enable();
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.owned, true);

    const stat2 = control2.status();
    assert.strictEqual(stat2.originalState, 'Off');
    assert.strictEqual(stat2.owned, true);
  });

  test('restore originalOff restores state to Off and clears journal', async () => {
    // Setup existing journal with originalState: 'Off', owned: true
    fs.writeFileSync(stateFilePath, JSON.stringify({
      version: 1,
      originalState: 'Off',
      owned: true,
      active: true,
      lastVerifiedAt: new Date().toISOString()
    }), 'utf8');

    const actions = [];
    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { actions.push('openSettings'); },
      canReplace: async () => false, // restore allowed regardless of gate
      runScript: async (action) => {
        actions.push(`runScript:${action}`);
        if (action === 'read') return { success: true, state: 'On' };
        if (action === 'off') return { success: true, state: 'Off', before: 'On', changed: true };
      }
    });

    const res = await control.restore();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.restored, true);
    assert.deepStrictEqual(actions, ['openSettings', 'runScript:read', 'runScript:off']);
    assert.strictEqual(fs.existsSync(stateFilePath), false);
  });

  test('originalOn is preserved and not toggled off on restore', async () => {
    // State was originally On before user enabled
    fs.writeFileSync(stateFilePath, JSON.stringify({
      version: 1,
      originalState: 'On',
      owned: false,
      active: true,
      lastVerifiedAt: new Date().toISOString()
    }), 'utf8');

    let scriptRan = false;
    let settingsOpened = false;

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { settingsOpened = true; },
      canReplace: async () => true,
      runScript: async () => { scriptRan = true; return { success: true, state: 'On' }; }
    });

    const res = await control.restore();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.restored, false);
    assert.strictEqual(settingsOpened, false);
    assert.strictEqual(scriptRan, false);
    assert.strictEqual(fs.existsSync(stateFilePath), false);
  });

  test('manual Off change by user is preserved: restore does not toggle it back On', async () => {
    fs.writeFileSync(stateFilePath, JSON.stringify({
      version: 1,
      originalState: 'Off',
      owned: true,
      active: true,
      lastVerifiedAt: new Date().toISOString()
    }), 'utf8');

    const actions = [];
    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => { actions.push('openSettings'); },
      canReplace: async () => true,
      runScript: async (action) => {
        actions.push(`runScript:${action}`);
        if (action === 'read') return { success: true, state: 'Off' }; // User already turned it Off
        throw new Error('should not toggle');
      }
    });

    const res = await control.restore();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.restored, false);
    assert.deepStrictEqual(actions, ['openSettings', 'runScript:read']);
    assert.strictEqual(fs.existsSync(stateFilePath), false);
  });

  test('malformed journal fails closed and leaves file untouched', async () => {
    const malformedContent = '{ invalid-json ';
    fs.writeFileSync(stateFilePath, malformedContent, 'utf8');

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async () => ({ success: true, state: 'Off' })
    });

    const stat = control.status();
    assert.strictEqual(stat.success, false);
    assert.strictEqual(stat.code, 'malformed-journal');

    const enableRes = await control.enable();
    assert.strictEqual(enableRes.success, false);
    assert.strictEqual(enableRes.code, 'malformed-journal');

    const restoreRes = await control.restore();
    assert.strictEqual(restoreRes.success, false);
    assert.strictEqual(restoreRes.code, 'malformed-journal');

    assert.strictEqual(fs.readFileSync(stateFilePath, 'utf8'), malformedContent);
  });

  test('permission/helper failure reports honest error and preserves journal', async () => {
    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async (action) => {
        if (action === 'read') return { success: true, state: 'Off' };
        if (action === 'on') {
          return { success: false, code: 'unverified', error: 'Toggle could not be verified within timeout.' };
        }
      }
    });

    const res = await control.enable();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'unverified');
    assert.strictEqual(fs.existsSync(stateFilePath), true); // journal retained for recovery
  });

  test('save failure before toggle must not mutate OS', async () => {
    // Provide an invalid state path directory to force save failure
    const invalidPath = path.join(tmpDir, 'nonexistent_sub_dir', 'file.json');
    // Make nonexistent_sub_dir a regular file so mkdirSync/writeFileSync fails
    const blocker = path.join(tmpDir, 'nonexistent_sub_dir');
    fs.writeFileSync(blocker, 'blocking file', 'utf8');

    let toggleInvoked = false;

    const control = new WindowsBannerControl({
      stateFile: invalidPath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async (action) => {
        if (action === 'read') return { success: true, state: 'Off' };
        if (action === 'on') {
          toggleInvoked = true;
          return { success: true, state: 'On' };
        }
      }
    });

    const res = await control.enable();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'storage-failure');
    assert.strictEqual(toggleInvoked, false);
  });

  test('busy concurrent actions are rejected', async () => {
    let finishFirst;
    const firstPromise = new Promise(resolve => { finishFirst = resolve; });

    const control = new WindowsBannerControl({
      stateFile: stateFilePath,
      scriptPath: dummyScriptPath,
      platform: 'win32',
      openSettings: async () => {},
      canReplace: async () => true,
      runScript: async (action) => {
        if (action === 'read') {
          await firstPromise;
          return { success: true, state: 'Off' };
        }
        return { success: true, state: 'On' };
      }
    });

    const op1 = control.enable();
    const op2 = control.enable();

    const res2 = await op2;
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.code, 'busy');

    finishFirst();
    const res1 = await op1;
    assert.strictEqual(res1.success, true);
  });
});
