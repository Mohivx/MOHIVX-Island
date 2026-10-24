const { test } = require('node:test');
const assert = require('node:assert/strict');

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function microphone() { const track = { stopped: false, stop() { this.stopped = true; } }; return { track, getTracks: () => [track] }; }
async function harness(options = {}) {
  const { RecordingSession } = await import('../src/hooks/recordingSession.mjs');
  const states = [], results = [], recorders = [], streams = [];
  const session = new RecordingSession({
    getMedia: async () => { const stream = microphone(); streams.push(stream); return stream; },
    createRecorder: () => {
      const recorder = {
        state: 'inactive', mimeType: 'audio/webm',
        start() { this.state = 'recording'; },
        stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['spoken audio']) }); queueMicrotask(() => this.onstop?.()); },
      };
      recorders.push(recorder); return recorder;
    },
    encode: async () => 'data:audio/webm;base64,c3Bva2Vu',
    onState: state => states.push(state), onComplete: data => results.push(data),
    ...options,
  });
  return { session, states, results, recorders, streams };
}

test('closing while microphone access is pending releases the eventual stream without recording', async () => {
  const access = deferred(), stream = microphone();
  const h = await harness({ getMedia: () => access.promise });
  const start = h.session.start(); h.session.cancel(); access.resolve(stream); await start;
  assert.equal(stream.track.stopped, true); assert.equal(h.recorders.length, 0); assert.deepEqual(h.results, []);
  assert.equal(h.states.at(-1).recording, false);
});

test('closing after Finish prevents a late encoder from sending the recording', async () => {
  const encoded = deferred();
  const h = await harness({ encode: () => encoded.promise });
  await h.session.start(); h.session.stop(); await flush();
  h.session.cancel(); encoded.resolve('late audio'); await flush();
  assert.deepEqual(h.results, []); assert.equal(h.streams[0].track.stopped, true);
});

test('starting again releases the previous microphone and sends only the new session', async () => {
  const h = await harness(); await h.session.start(); await h.session.start();
  assert.equal(h.streams[0].track.stopped, true); assert.equal(h.streams[1].track.stopped, false);
  h.session.stop(); await flush();
  assert.equal(h.results.length, 1); assert.equal(h.streams[1].track.stopped, true);
});

test('recorder creation failures release microphone access and expose an actionable error', async () => {
  const h = await harness({ createRecorder: () => { throw new Error('Recorder unavailable'); } });
  await h.session.start();
  assert.equal(h.streams[0].track.stopped, true);
  assert.deepEqual(h.states.at(-1), { recording: false, error: 'Recorder unavailable' });
});

test('Finish before access resolves still stops and completes the actual recording', async () => {
  const access = deferred(), stream = microphone();
  const h = await harness({ getMedia: () => access.promise });
  const start = h.session.start(); h.session.stop(); access.resolve(stream); await start;
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(h.results.length, 1); assert.equal(stream.track.stopped, true);
});

test('an empty recording reports an error instead of leaving dictation waiting forever', async () => {
  const h = await harness(); await h.session.start();
  h.recorders[0].stop = function () { this.state = 'inactive'; queueMicrotask(() => this.onstop()); };
  h.session.stop(); await flush();
  assert.deepEqual(h.results, []); assert.match(h.states.at(-1).error, /No audio was recorded/);
});
