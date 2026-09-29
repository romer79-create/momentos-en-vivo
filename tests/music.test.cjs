const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateMusic } = require('../functions/invitation-music');
const { normalize } = require('../functions/presentation');
const { wave } = require('./music-fixture.cjs');
test('music accepts bounded canonical PCM only, rejects metadata, forged sizes and codecs', () => {
  for (const seconds of [2, 16, 60]) { const b = wave(seconds); assert.deepEqual(validateMusic(b.toString('base64')), b); }
  for (const seconds of [1, 60.1]) assert.throws(() => validateMusic(wave(seconds).toString('base64')));
  for (const at of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) { const b = wave(); b[at] ^= 1; assert.throws(() => validateMusic(b.toString('base64')), String(at)); }
  assert.throws(() => validateMusic(Buffer.concat([wave(), Buffer.from('<script>metadata</script>')]).toString('base64')));
  for (const data of [null, 25, {}, 'https://example.com/song.mp3', '<svg>', 'data:audio/wav;base64,AAAA']) assert.throws(() => validateMusic(data));
});
test('catalog registers the new reusable theme and audio source is a closed choice', () => {
  assert.equal(normalize({ themeId: 'hechizo' }).themeId, 'hechizo');
  assert.equal(normalize({}).musicSource, 'instrumental');
  assert.equal(normalize({ musicSource: 'custom' }).musicSource, 'custom');
  for (const musicSource of ['url', '__proto__', {}, 1]) assert.throws(() => normalize({ musicSource }));
});
