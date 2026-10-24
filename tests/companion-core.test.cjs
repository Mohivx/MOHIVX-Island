const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeSettings, isSensitiveClipboard, resolveAudioDevice, mediaPart, CompanionAI, ScheduledActionsStore } = require('../electron/services/companionCore.cjs');
const { measureConnection, getWeather } = require('../electron/services/networkTools.cjs');

test('partial preferences preserve nested controls and reject prototype pollution', () => {
  const base = { visibleTabs: { controls: true, apps: true }, androidGateway: { enabled: false, port: 9120 } };
  const result = mergeSettings(base, { visibleTabs: { apps: false }, ...JSON.parse('{"__proto__":{"polluted":true}}') });
  assert.deepEqual(result.visibleTabs, { controls: true, apps: false });
  assert.equal(base.visibleTabs.apps, true); assert.equal({}.polluted, undefined);
});
test('sensitive clipboard filtering distinguishes tokens and everyday text', () => {
  assert.equal(isSensitiveClipboard('password = secret123'), true);
  assert.equal(isSensitiveClipboard('-----BEGIN PRIVATE KEY-----'), true);
  assert.equal(isSensitiveClipboard('Meet at 9 and bring the project notes.'), false);
});
test('audio selection resolves friendly names and PnP ids to the actual CoreAudio endpoint', () => {
  const devices = [{ id: 'SWD\\MMDEVAPI\\{0.0.0.00000000}.{ABC}', name: 'Speakers', isDefault: true }];
  assert.equal(resolveAudioDevice(devices, 'Speakers'), '{0.0.0.00000000}.{ABC}');
  assert.equal(resolveAudioDevice(devices, '{0.0.0.00000000}.{abc}'), '{0.0.0.00000000}.{ABC}');
  assert.equal(resolveAudioDevice(devices, 'default'), '{0.0.0.00000000}.{ABC}');
  assert.equal(resolveAudioDevice(devices, 'Unknown'), null);
});
test('media validation accepts recorder formats and rejects arbitrary inputs', () => {
  assert.equal(mediaPart('data:audio/webm;codecs=opus;base64,YWJj', /^audio\/webm$/).inlineData.data, 'YWJj');
  assert.throws(() => mediaPart('file:///private.txt', /^image\//));
  assert.throws(() => mediaPart('data:text/plain;base64,YWJj', /^image\//));
});
test('vision passes actual selected image and recorded question in the same request', async () => {
  let payload; const service = new CompanionAI({ callGeminiApi: async (_key, p) => { payload = p; return { candidates: [{ content: { parts: [{ text: 'A selected window.' }] } }] }; } }, () => ({ geminiKey: 'test-only-key' }));
  const res = await service.ask({ prompt: 'What is this?', image: 'data:image/png;base64,YWJj', audio: 'data:audio/webm;base64,YWJj' });
  assert.equal(res.text, 'A selected window.'); assert.equal(payload.contents[0].parts.length, 3);
});
test('local-only mode and missing keys block all network calls', async () => {
  let requests = 0; let settings = { localOnlyMode: true, geminiKey: 'test-only-key' };
  const service = new CompanionAI({ callGeminiApi: () => requests++, _makeRequest: () => requests++ }, () => settings);
  assert.equal((await service.ask({ prompt: 'test' })).success, false);
  assert.equal((await service.voice()).success, false);
  settings = {}; assert.equal((await service.ask({ prompt: 'test' })).success, false);
  assert.equal(requests, 0);
});
test('dictation preserves genuine no-speech results without inventing text', async () => {
  const service = new CompanionAI({ callGeminiApi: async () => ({ candidates: [{ content: { parts: [] } }] }) }, () => ({ geminiKey: 'test-only-key' }));
  const res = await service.ask({ mode: 'dictation', audio: 'data:audio/webm;base64,YWJj' });
  assert.equal(res.success, true); assert.equal(res.text, '');
});
test('scheduler survives reload, runs only due actions, and records actual success', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-schedule-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'actions.json'); let now = 1000; const calls = [];
  const original = new ScheduledActionsStore(file, async item => calls.push(item.id), () => {}, () => now);
  const item = original.add({ title: 'Test', actionType: 'url', target: 'https://example.com', targetTime: 2000 });
  const restored = new ScheduledActionsStore(file, async i => calls.push(i.id), () => {}, () => now);
  await restored.tick(); assert.deepEqual(calls, []);
  now = 2001; await restored.tick(); await restored.tick();
  assert.deepEqual(calls, [item.id]); assert.equal(restored.items[0].status, 'completed');
  assert.equal(JSON.parse(fs.readFileSync(file))[0].completed, true);
});
test('failed actions are reported as failures and never presented as completed successfully', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-failed-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = 1000; let notification;
  const store = new ScheduledActionsStore(path.join(dir, 'actions.json'), async () => { throw new Error('Application missing'); }, item => notification = item, () => now);
  store.add({ actionType: 'app', target: 'Z:/missing.exe', targetTime: 2000 }); now = 3000; await store.tick();
  assert.equal(notification.status, 'failed'); assert.equal(notification.error, 'Application missing');
  assert.throws(() => store.add({ actionType: 'url', target: 'javascript:alert(1)', targetTime: 4000 }));
  assert.throws(() => store.add({ actionType: 'app', target: 'test', targetTime: 999 }));
});
test('weekday recurrence moves to next future working day and overlapping ticks do not duplicate execution', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-repeat-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = new Date(2026, 9, 16, 8).getTime(); let count = 0;
  const store = new ScheduledActionsStore(path.join(dir, 'actions.json'), async () => { count++; await new Promise(resolve => setImmediate(resolve)); }, () => {}, () => now);
  store.add({ actionType: 'url', target: 'https://example.com', targetTime: now + 1000, repeat: 'weekdays' }); now += 2000;
  await Promise.all([store.tick(), store.tick()]);
  assert.equal(count, 1); assert.equal(new Date(store.items[0].targetTime).getDay(), 1); assert.equal(store.items[0].completed, false);
});
test('speed results are computed from transferred bytes and elapsed time', async () => {
  let time = 0; let request = 0;
  const result = await measureConnection(async (_url, options) => {
    request++; return { ok: true, arrayBuffer: async () => { time += request === 1 ? 20 : 1000; return new ArrayBuffer(request === 2 ? 5000000 : options?.body?.length || 100); } };
  }, () => time);
  assert.equal(result.ping, 20); assert.equal(result.down, 40); assert.equal(result.up, 8.4);
});
test('network failures return unavailable states without sample measurements', async () => {
  const result = await measureConnection(async () => { throw new Error('offline'); });
  assert.equal(result.success, false); assert.equal(result.down, undefined);
  let requests = 0;
  assert.equal((await getWeather('', () => requests++)).success, false); assert.equal(requests, 0);
});
test('research uses the saved key and returns real source results', async () => {
  let input;
  const service = new CompanionAI({}, () => ({ tavilyKey: 'test-only-key' }));
  const result = await service.research('test topic', async (_url, options) => { input = options; return { ok: true, json: async () => ({ results: [{ title: 'A source', url: 'https://example.com', content: 'A relevant passage' }] }) }; });
  assert.equal(input.headers.Authorization, 'Bearer test-only-key'); assert.equal(JSON.parse(input.body).query, 'test topic'); assert.equal(result.results[0].url, 'https://example.com');
});

test('packaged Windows helpers are extracted to real paths and refreshed after an update', () => {
  const { stageNativeAssets } = require('../electron/services/nativeAssets.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-assets-'));
  try {
    const destination = path.join(dir, 'profile', 'bin');
    const source = path.join(__dirname, '..', 'electron');
    const assets = stageNativeAssets(source, destination);
    assert.ok(assets['get_clipboard_history.ps1']);
    assert.ok(assets['paste_dictation.ps1']);
    assert.ok(assets['companion_shortcuts.ps1']);
    for (const [name, file] of Object.entries(assets)) {
      assert.equal(path.dirname(file), destination);
      assert.ok(fs.statSync(file).size > 0, name);
    }
    fs.writeFileSync(assets['audio_controller.ps1'], 'obsolete helper');
    stageNativeAssets(source, destination);
    assert.deepEqual(fs.readFileSync(assets['audio_controller.ps1']), fs.readFileSync(path.join(source, 'audio_controller.ps1')));
    assert.throws(() => stageNativeAssets(path.join(dir, 'missing'), destination), /Missing bundled Windows helper/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overlapping scheduler ticks execute each of several due actions exactly once', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-multi-due-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = 1000, release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const store = new ScheduledActionsStore(path.join(dir, 'actions.json'), async item => { calls.push(item.id); if (calls.length === 1) await pending; }, () => {}, () => now);
  store.add({ actionType: 'app', target: 'first.exe', targetTime: 2000 });
  store.add({ actionType: 'app', target: 'second.exe', targetTime: 2000 });
  now = 3000;
  const first = store.tick(), overlap = store.tick();
  await new Promise(resolve => setImmediate(resolve)); release();
  await Promise.all([first, overlap]);
  assert.equal(calls.length, 2); assert.equal(new Set(calls).size, 2);
  assert.ok(store.items.every(item => item.status === 'completed'));
});

test('portable startup uses the persistent launcher and development does not register startup', () => {
  const { getStartupConfig } = require('../electron/services/startupConfig.cjs');
  assert.equal(getStartupConfig({ packaged: false, executable: 'C:\\electron.exe', enabled: true }), null);
  const config = getStartupConfig({ packaged: true, executable: 'C:\\Temp\\extracted\\app.exe', portableExecutable: 'E:\\My Apps\\MOHIVX Island.exe', enabled: true });
  assert.equal(config.path, 'E:\\My Apps\\MOHIVX Island.exe'); assert.deepEqual(config.args, ['--startup']); assert.equal(config.name, 'MOHIVX Island');
  assert.equal(getStartupConfig({ packaged: true, executable: 'C:\\Programs\\MOHIVX.exe', enabled: false }).openAtLogin, false);
  assert.throws(() => getStartupConfig({ packaged: true, executable: 'app.exe', enabled: true }), /full application path/);
});

test('cancelling a due action while another action runs prevents the queued launch', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-cancel-queued-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = 1000, release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  const store = new ScheduledActionsStore(path.join(dir, 'actions.json'), async item => { calls.push(item.id); await pending; }, () => {}, () => now);
  store.add({ actionType: 'app', target: 'first.exe', targetTime: 2000 });
  store.add({ actionType: 'app', target: 'second.exe', targetTime: 2000 });
  now = 3000; const tick = store.tick();
  const queued = store.items.find(item => item.id !== calls[0]); store.cancel(queued.id);
  release(); await tick;
  assert.equal(calls.length, 1); assert.equal(store.items.length, 1); assert.equal(store.items[0].status, 'completed');
});

