const { test } = require('node:test');
const assert = require('node:assert/strict');
const now = Date.parse('2026-09-29T00:00:00Z');
const active = { id: 'event-1', status: 'active', activatedAt: '2026-09-28T00:00:00Z', startsAt: '2026-09-28T23:00:00Z', receivesUntil: '2026-09-30T23:00:00Z', downloadUntil: '2026-10-30T23:00:00Z', photoCount: 2 };
const guide = async event => (await import('../web/event-guidance.mjs')).eventGuidance(event, now);
test('first-time and draft advice never skips the activation review', async () => {
  assert.equal((await guide()).stage, 'create');
  assert.equal((await guide({ ...active, status: 'draft' })).stage, 'design');
  const saved = await guide({ ...active, status: 'draft', presentation: { published: false } });
  assert.equal(saved.stage, 'activate'); assert.match(saved.href, /cliente-panel/); assert.doesNotMatch(saved.href, /invitacion.html/);
});
test('expired and closed events are not told to share or accept photos', async () => {
  assert.equal((await guide({ ...active, downloadUntil: new Date(now).toISOString(), status: 'closed' })).stage, 'expired');
  for (const event of [{ ...active, status: 'closed' }, { ...active, receivesUntil: new Date(now).toISOString() }]) {
    const result = await guide(event); assert.equal(result.stage, 'album'); assert.match(result.href, /#album$/);
  }
});
test('scheduled invitations distinguish saved from actually published', async () => {
  const future = { ...active, startsAt: '2026-10-01T00:00:00Z' };
  assert.equal((await guide(future)).stage, 'publish');
  assert.equal((await guide({ ...future, presentation: { published: true } })).stage, 'share');
});
test('live events prioritize photo handling even without an invitation', async () => {
  assert.equal((await guide({ ...active, photoCount: 0 })).stage, 'first-photo');
  const manual = await guide(active), automatic = await guide({ ...active, autoApprove: true });
  assert.equal(manual.stage, 'live'); assert.match(manual.text, /Pendientes/);
  assert.match(automatic.text, /automáticamente/); assert.match(automatic.text, /retirar/);
});
test('unknown or unactivated states do not claim reception is open', async () => {
  assert.equal((await guide({ ...active, status: 'unknown' })).stage, 'review');
  assert.equal((await guide({ ...active, activatedAt: null })).stage, 'review');
});
