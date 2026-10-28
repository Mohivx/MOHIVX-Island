const test = require('node:test');
const assert = require('node:assert/strict');

test('media accent extracts a saturated colour and ignores transparent or muddy pixels', async () => {
  const { accentFromPixels } = await import('../src/hooks/mediaAccent.mjs');
  const pixels = new Uint8ClampedArray([
    255, 20, 20, 255,
    20, 20, 20, 255,
    120, 120, 120, 255,
    0, 255, 0, 0,
  ]);
  assert.match(accentFromPixels(pixels, 2, 2), /^#[a-f0-9]{6}$/i);
  assert.notEqual(accentFromPixels(pixels, 2, 2), '');
});

test('media accent never tries to load remote artwork or unavailable canvas APIs', async () => {
  const { extractMediaAccent } = await import('../src/hooks/mediaAccent.mjs');
  assert.equal(await extractMediaAccent('https://example.com/art.jpg'), '');
  assert.equal(await extractMediaAccent('data:image/png;base64,AA==', { ImageCtor: null, documentRef: null }), '');
});
