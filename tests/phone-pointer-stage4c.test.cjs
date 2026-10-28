const test = require('node:test');
const assert = require('node:assert/strict');

test('phonePoint maps coordinates with contain/letterbox, cover/crop, and device rotations', async () => {
  const { phonePoint, rotatePoint } = await import('../src/components/phonePointer.mjs');
  const rect = { left: 100, top: 100, width: 800, height: 600 };

  // 1. Contain / letterbox: 400x800 into 800x600 -> scale is 600/800 = 0.75 -> displayed is 300x600, centered horizontally
  // Horizontal offset: (800 - 300)/2 = 250 px from rect.left -> [350, 650]
  assert.equal(phonePoint(200, 400, rect, 400, 800), null); // in left letterbox pillar
  assert.deepEqual(phonePoint(500, 400, rect, 400, 800), { x: 0.5, y: 0.5 }); // center

  // 2. Cover / fill:
  const fillPoint = phonePoint(100, 100, rect, 400, 800, true);
  assert.ok(fillPoint !== null);
  assert.equal(fillPoint.x, 0);

  // 3. Rotations (0, 90, 180, 270 and Surface.ROTATION_0..3)
  const center = { x: 0.2, y: 0.8 };
  assert.deepEqual(rotatePoint(center, 0), { x: 0.2, y: 0.8 });
  assert.deepEqual(rotatePoint(center, 1), { x: 0.8, y: 0.8 }); // 90 deg / Surface.ROTATION_90: (y, 1-x)
  assert.deepEqual(rotatePoint(center, 90), { x: 0.8, y: 0.8 });
  assert.deepEqual(rotatePoint(center, 2), { x: 0.8, y: 0.2 }); // 180 deg / Surface.ROTATION_180: (1-x, 1-y)
  assert.deepEqual(rotatePoint(center, 180), { x: 0.8, y: 0.2 });
  assert.deepEqual(rotatePoint(center, 3), { x: 0.2, y: 0.2 }); // 270 deg / Surface.ROTATION_270: (1-y, x)
  assert.deepEqual(rotatePoint(center, 270), { x: 0.2, y: 0.2 });

  // 4. phonePoint with rotation option
  const pRot = phonePoint(500, 400, rect, 400, 800, { fill: false, rotation: 1 });
  assert.deepEqual(pRot, { x: 0.5, y: 0.5 });

  // 5. Bounds rejection
  assert.equal(phonePoint(50, 400, rect, 400, 800), null);
  assert.equal(phonePoint(500, 50, rect, 400, 800), null);
  assert.equal(phonePoint(500, 400, null, 400, 800), null);
  assert.equal(phonePoint(500, 400, rect, 0, 800), null);
});

test('server-side PhoneSync validates move geometry and coalesces consecutive pending moves ahead of bulk traffic', async () => {
  const { PhoneSync, phoneInput } = require('../electron/services/phoneSync.cjs');

  // Validation
  assert.deepEqual(phoneInput({ type: 'move', x: 0.25, y: 0.75 }), { type: 'move', x: 0.25, y: 0.75 });
  assert.deepEqual(phoneInput({ type: 'move', x: 0, y: 1 }), { type: 'move', x: 0, y: 1 });
  assert.throws(() => phoneInput({ type: 'move', x: -0.01, y: 0.5 }), /Unsupported phone input/);
  assert.throws(() => phoneInput({ type: 'move', x: 1.01, y: 0.5 }), /Unsupported phone input/);
  assert.throws(() => phoneInput({ type: 'move', x: 'invalid', y: 0.5 }), /Unsupported phone input/);
  assert.throws(() => phoneInput({ type: 'move' }), /Unsupported phone input/);

  // Coalescing and priority ahead of bulk commands
  const sync = new PhoneSync();
  const device = { id: 'dev1', name: 'Pixel', capabilities: ['phoneScreen', 'phoneControl', 'phoneFilesWrite'] };
  sync.exchange(device, {
    status: {
      controlEnabled: true,
      capture: ['screen'],
      folderWritable: true,
    },
  });

  // Enqueue 3 moves and 1 tap
  const p1 = sync.request(device, { type: 'input', input: { type: 'move', x: 0.1, y: 0.1 } });
  const p2 = sync.request(device, { type: 'input', input: { type: 'move', x: 0.2, y: 0.2 } });
  const p3 = sync.request(device, { type: 'input', input: { type: 'move', x: 0.3, y: 0.3 } });
  const pTap = sync.request(device, { type: 'input', input: { type: 'tap', x: 0.3, y: 0.3 } });

  // Android polls exchange
  const exchanged = sync.exchange(device, { status: { controlEnabled: true, capture: ['screen'] } });

  p3.catch(() => {});
  pTap.catch(() => {});

  // Consecutive moves p1, p2 should have been coalesced; p3 and pTap remain in exact order!
  assert.equal(exchanged.commands.length, 2);
  assert.deepEqual(exchanged.commands[0].input, { type: 'move', x: 0.3, y: 0.3 });
  assert.deepEqual(exchanged.commands[1].input, { type: 'tap', x: 0.3, y: 0.3 });

  // p1 and p2 should have resolved as coalesced
  await Promise.all([
    p1.then(res => assert.equal(res.coalesced, true)),
    p2.then(res => assert.equal(res.coalesced, true)),
  ]);
  sync.clear();
});

test('phoneInputQueue coalesces high-rate moves and flushes the last move before click/swipe/wheel/key/text', async () => {
  const { createPhoneInputQueue } = await import('../src/components/phoneInputQueue.mjs');
  const dispatched = [];
  let resolveActive = null;

  const queue = createPhoneInputQueue(
    action => new Promise(res => {
      dispatched.push(action);
      resolveActive = res;
    }),
    { maxSize: 32 }
  );

  // 1. Send first move: immediately becomes activeItem
  const m1 = queue.enqueue({ type: 'move', x: 0.1, y: 0.1 });
  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0], { type: 'move', x: 0.1, y: 0.1 });

  // 2. High-rate moves arrive while first move is in-flight
  const m2 = queue.enqueue({ type: 'move', x: 0.2, y: 0.2 });
  const m3 = queue.enqueue({ type: 'move', x: 0.3, y: 0.3 });
  const m4 = queue.enqueue({ type: 'move', x: 0.4, y: 0.4 });

  // The queue should coalesce m2, m3, m4 into a single pending item at the tail!
  assert.equal(queue.pending(), 1);

  // 3. Now user clicks/taps!
  const tapPromise = queue.enqueue({ type: 'tap', x: 0.4, y: 0.4 });
  // The pending count is now 2: [coalesced move (0.4, 0.4), tap (0.4, 0.4)]
  assert.equal(queue.pending(), 2);

  // 4. Complete the first move
  resolveActive({ success: true });
  await m1;

  // Let microtasks run
  await new Promise(r => setImmediate(r));

  // The next dispatched action MUST be the flushed last move (0.4, 0.4)!
  assert.equal(dispatched.length, 2);
  assert.deepEqual(dispatched[1], { type: 'move', x: 0.4, y: 0.4 });

  // Complete the second move
  resolveActive({ success: true });
  await m4;
  await new Promise(r => setImmediate(r));

  // The third dispatched action MUST be the tap!
  assert.equal(dispatched.length, 3);
  assert.deepEqual(dispatched[2], { type: 'tap', x: 0.4, y: 0.4 });

  resolveActive({ success: true });
  await tapPromise;
});

test('phoneInputQueue flushes buffered moves before keyboard shortcuts and Unicode text', async () => {
  const { createPhoneInputQueue } = await import('../src/components/phoneInputQueue.mjs');
  const dispatched = [];
  let resolveActive = null;

  const queue = createPhoneInputQueue(
    action => new Promise(res => {
      dispatched.push(action);
      resolveActive = res;
    }),
    { maxSize: 32 }
  );

  // Send an in-flight move
  queue.enqueue({ type: 'move', x: 0.05, y: 0.05 });
  // Buffer a subsequent move
  queue.enqueue({ type: 'move', x: 0.5, y: 0.5 });
  // Type Arabic text
  queue.enqueue({ type: 'text', text: 'سلام' });
  // Press enter key
  queue.enqueue({ type: 'key', key: 'enter' });

  // Step 1: finish first move
  resolveActive({ success: true });
  await new Promise(r => setImmediate(r));

  // Step 2: verify flushed move
  assert.deepEqual(dispatched[1], { type: 'move', x: 0.5, y: 0.5 });
  resolveActive({ success: true });
  await new Promise(r => setImmediate(r));

  // Step 3: verify Arabic text
  assert.deepEqual(dispatched[2], { type: 'text', text: 'سلام' });
  resolveActive({ success: true });
  await new Promise(r => setImmediate(r));

  // Step 4: verify Enter key
  assert.deepEqual(dispatched[3], { type: 'key', key: 'enter' });
  resolveActive({ success: true });
  await new Promise(r => setImmediate(r));

  assert.equal(dispatched.length, 4);
});

test('phoneInputQueue cancels promptly on clear/stop and ignores events when unavailable', async () => {
  const { createPhoneInputQueue } = await import('../src/components/phoneInputQueue.mjs');
  let allowed = true;
  const dispatched = [];

  const queue = createPhoneInputQueue(
    action => new Promise(() => { dispatched.push(action); }),
    { canAccept: () => allowed }
  );

  const p1 = queue.enqueue({ type: 'move', x: 0.1, y: 0.1 });
  const p2 = queue.enqueue({ type: 'tap', x: 0.1, y: 0.1 });

  queue.clear('stopped');
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, false);
  assert.equal(r2, false);
  assert.equal(queue.size(), 0);

  allowed = false;
  const p3 = queue.enqueue({ type: 'move', x: 0.2, y: 0.2 });
  assert.equal(await p3, false);
});

test('Arabic, English, and physical key shortcuts are preserved during control', async () => {
  const { resolvePhoneKeyShortcut, extractDirectPrintableKey } = await import('../src/components/phoneInputQueue.mjs');

  // Physical and layout shortcuts
  assert.deepEqual(resolvePhoneKeyShortcut({ key: 'Escape' }), { type: 'escape' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, code: 'KeyA' }), { type: 'key', key: 'selectAll' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, key: 'ش' }), { type: 'key', key: 'selectAll' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, code: 'KeyC' }), { type: 'key', key: 'copy' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, key: 'ؤ' }), { type: 'key', key: 'copy' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, code: 'KeyV' }), { type: 'key', key: 'paste' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, key: 'ر' }), { type: 'key', key: 'paste' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, code: 'KeyX' }), { type: 'key', key: 'cut' });
  assert.deepEqual(resolvePhoneKeyShortcut({ ctrlKey: true, key: 'ء' }), { type: 'key', key: 'cut' });

  // Special keys
  assert.deepEqual(resolvePhoneKeyShortcut({ key: 'Enter' }), { type: 'key', key: 'enter' });
  assert.deepEqual(resolvePhoneKeyShortcut({ key: 'Backspace' }), { type: 'key', key: 'backspace' });
  assert.deepEqual(resolvePhoneKeyShortcut({ key: 'Delete' }), { type: 'key', key: 'delete' });

  // IME composition suppression
  assert.equal(resolvePhoneKeyShortcut({ key: 'Enter', isComposing: true }), null);
  assert.equal(resolvePhoneKeyShortcut({ key: 'Process' }), null);
  assert.equal(resolvePhoneKeyShortcut({ key: 'Backspace', keyCode: 229 }), null);

  // Direct printable keys
  assert.equal(extractDirectPrintableKey({ key: 'م' }), 'م');
  assert.equal(extractDirectPrintableKey({ key: 'A' }), 'A');
  assert.equal(extractDirectPrintableKey({ key: '7' }), '7');
  assert.equal(extractDirectPrintableKey({ key: 'Enter' }), null);
  assert.equal(extractDirectPrintableKey({ key: 'Escape' }), null);
  assert.equal(extractDirectPrintableKey({ key: 'م', isComposing: true }), null);
});
