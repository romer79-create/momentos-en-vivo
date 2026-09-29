const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../functions/security');
const e = { ownerId: 'a', status: 'active', activatedAt: new Date().toISOString(), startsAt: new Date(Date.now() - 3600000).toISOString(), receivesUntil: new Date(Date.now() + 3600000).toISOString(), guestKey: S.secret(), projectionKey: S.secret() };
test('only an authenticated non-suspended owner or administrator can manage the event', () => {
  assert.equal(S.canManage({ uid: 'a', organizer: true }, e), true);
  assert.equal(S.canManage({ uid: 'a' }, e), true);
  for (const user of [null, { uid: 'b', organizer: true }, { uid: 'a', suspended: true }]) assert.equal(S.canManage(user, e), false);
  assert.equal(S.canManage({ uid: 'admin', admin: true }, e), true);
});
test('drafts, unpaid records and expired reception never accept uploads', () => {
  for (const event of [{ ...e, status: 'draft' }, { ...e, activatedAt: null }, { ...e, startsAt: new Date(Date.now() + 3600000).toISOString() }, { ...e, receivesUntil: new Date(Date.now() - 1).toISOString() }]) assert.equal(S.canUpload({ uid: 'a' }, event, e.guestKey), false);
  assert.equal(S.eventStart('2026-10-10', '21:30'), '2026-10-11T00:30:00.000Z');
  for (const [date, time] of [['2026-02-31', '12:00'], ['2026-10-10', '24:00']]) assert.throws(() => S.eventStart(date, time));
});
test('guest and projection capabilities cannot be exchanged', () => {
  assert.equal(S.canUpload(null, e, e.guestKey), true);
  assert.equal(S.canView(null, e, e.guestKey), false);
  assert.equal(S.canView(null, e, e.projectionKey), true);
  assert.equal(S.canUpload(null, e, e.projectionKey), false);
  assert.equal(S.canView(null, { ...e, status: 'closed' }, e.projectionKey), false);
  assert.equal(S.canUpload(null, { ...e, status: 'closed' }, e.guestKey), false);
});
test('missing, shortened, and rotated links cannot authorize requests', () => {
  for (const value of [undefined, '', 'guess', e.guestKey.slice(1), [e.guestKey]]) assert.equal(S.sameSecret(value, e.guestKey), false);
  assert.equal(S.sameSecret(e.guestKey, S.secret()), false);
});
test('IDs cannot escape their collection or storage prefix', () => {
  for (const id of ['../other', 'a/b', 'a%2fb', '', '__bad space', 'x'.repeat(101), null]) assert.throws(() => S.identifier(id));
  assert.equal(S.identifier('event_2026-09'), 'event_2026-09');
});
test('photo data and user input have explicit bounds', () => {
  assert.throws(() => S.decodeImage('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(() => S.decodeImage('data:image/jpeg;base64,not a valid payload'));
  assert.throws(() => S.text('x'.repeat(201), 200));
  assert.throws(() => S.text({}, 200));
  assert.equal(S.text('<img onerror=alert(1)>', 200), '<img onerror=alert(1)>');
});
