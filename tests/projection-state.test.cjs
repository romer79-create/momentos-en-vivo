const { test } = require('node:test');
const assert = require('node:assert/strict');
const photo = (id, publishedAt = id) => ({ id, publishedAt });
test('existing photos are the carousel; bursts queue oldest first exactly once', async () => {
  const { ProjectionQueue } = await import('../web/projection-state.mjs'); const q = new ProjectionQueue();
  q.sync([photo('a')]); assert.equal(q.next(), null); assert.deepEqual(q.carousel().map(p => p.id), ['a']);
  q.sync([photo('c'), photo('b'), photo('a')]); assert.equal(q.next().id, 'b'); assert.deepEqual(q.carousel().map(p => p.id), ['a']);
  q.sync([photo('c'), photo('b'), photo('a')]); assert.equal(q.waiting.length, 1); q.finish();
  assert.deepEqual(q.carousel().map(p => p.id), ['b', 'a']); assert.equal(q.next().id, 'c'); q.finish(); assert.equal(q.next(), null);
  q.sync([photo('c'), photo('b'), photo('a')]); assert.equal(q.next(), null);
});
test('empty events spotlight their first arrival and cancel rejected current or queued photos', async () => {
  const { ProjectionQueue } = await import('../web/projection-state.mjs'); const q = new ProjectionQueue();
  q.sync([]); q.sync([photo('c'), photo('b')]); assert.equal(q.next().id, 'b');
  q.sync([]); assert.equal(q.current, null); assert.equal(q.next(), null); assert.deepEqual(q.carousel(), []);
  q.sync([photo('b', 'republished')]); assert.equal(q.next().id, 'b');
});
test('closed/reopened feeds restore a baseline without replaying the gallery', async () => {
  const { ProjectionQueue } = await import('../web/projection-state.mjs'); const q = new ProjectionQueue();
  q.sync([photo('a')]); q.clear(); q.sync([photo('a')]); assert.equal(q.next(), null); assert.equal(q.carousel().length, 1);
});
