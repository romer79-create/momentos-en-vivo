const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, getApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getAuth } = requireFunctions('firebase-admin/auth');
const { getStorage } = requireFunctions('firebase-admin/storage');
const sharp = require('../functions/node_modules/sharp');
const { createApp } = require('../functions/app');
const { randomUUID } = require('node:crypto');
const project = 'demo-momentos';
let db, auth, bucket, server, base, a, b, unverified, pending, eventA, eventB, photoId, imageBase64;
async function account(uid, verified = true, organizer = true) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Prueba-local-123456', emailVerified: verified });
  await auth.setCustomUserClaims(uid, { organizer });
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'Prueba-local-123456', returnSecureToken: true }) });
  return (await r.json()).idToken;
}
async function api(path, options = {}) {
  const headers = { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.key ? { 'X-Event-Key': options.key } : {}), ...options.headers };
  if (options.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}/api${path}`, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined });
  return { status: response.status, response, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null };
}
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'Only run against all three emulators.');
  initializeApp({ projectId: project, storageBucket: `${project}.appspot.com` }); db = getFirestore(); auth = getAuth(); bucket = getStorage().bucket();
  server = createApp({ db, auth, bucket, emulator: true }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  a = await account(`alice-${Date.now()}`); b = await account(`bob-${Date.now()}`); unverified = await account(`unverified-${Date.now()}`, false); pending = await account(`pending-${Date.now()}`, true, false);
  const bytes = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#cba366' } }).withExif({ IFD0: { Copyright: 'test metadata' } }).jpeg().toBuffer(); imageBase64 = `data:image/jpeg;base64,${bytes.toString('base64')}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await deleteApp(getApp()); });
test('authentication rejects fake browser sessions, shared API keys and unverified accounts', async () => {
  assert.equal((await api('/events')).status, 401);
  assert.equal((await api('/events', { headers: { 'x-api-key': 'legacy', cookie: 'adminSession=admin' } })).status, 401);
  assert.equal((await api('/events', { token: 'forged' })).status, 401);
  assert.equal((await api('/events', { token: unverified })).status, 403);
  assert.equal((await api('/events', { token: pending })).status, 200);
  const old = await api('/get-photos'); assert.equal(old.status, 404); assert.equal('expected' in old.data, false);
});
test('clients create paid cloud events and can list only their own', async () => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const token of [a, b]) { const id = randomUUID(); assert.equal((await api('/orders', { token, method: 'POST', body: { id, planId: 'evento-1' } })).status, 201); assert.equal((await api(`/orders/${id}/simulate`, { token, method: 'POST', body: { status: 'approved' } })).status, 200); }
  const first = await api('/events', { token: a, method: 'POST', body: { name: 'Evento de Alicia', date, ownerId: 'attacker', admin: true } });
  assert.equal(first.status, 201); eventA = first.data;
  const second = await api('/events', { token: b, method: 'POST', body: { name: 'Evento de Bruno', date } }); assert.equal(second.status, 201); eventB = second.data;
  for (const [token, event] of [[a, eventA], [b, eventB]]) assert.equal((await api(`/events/${event.id}/activate`, { token, method: 'POST' })).status, 200);
  assert.deepEqual((await api('/events', { token: a })).data.events.map(x => x.id), [eventA.id]);
  assert.equal((await api(`/events/${eventA.id}`, { token: b })).status, 403);
  assert.equal((await api(`/events/${eventA.id}`, { token: b, method: 'PATCH', body: { status: 'closed' } })).status, 403);
});
test('guest link has upload scope only; photos are pending until moderated', async () => {
  const path = `/events/${eventA.id}`;
  assert.equal((await api(`${path}/public`, { key: eventA.guestKey })).status, 200);
  assert.equal((await api(`${path}/photos`, { key: eventA.guestKey })).status, 403);
  assert.equal((await api(`${path}/photos`, { method: 'POST', key: eventA.projectionKey, body: {} })).status, 403);
  photoId = randomUUID(); const body = { id: photoId, imageBase64, message: '<img src=x onerror=alert(1)>', status: 'approved' };
  assert.equal((await api(`${path}/photos`, { method: 'POST', key: eventA.guestKey, body })).status, 201);
  const stored = (await db.collection('photos').doc(photoId).get()).data(); assert.equal(stored.status, 'pending'); assert.equal('imageBase64' in stored, false);
  assert.equal((await api(`${path}/photos`, { key: eventA.projectionKey })).data.photos.length, 0);
  assert.equal((await api(`${path}/photos/${photoId}/image`, { key: eventA.projectionKey })).status, 404);
});
test('retry is idempotent and image messages are preserved as text', async () => {
  const retry = await api(`/events/${eventA.id}/photos`, { method: 'POST', key: eventA.guestKey, body: { id: photoId, imageBase64, message: 'retry' } });
  assert.equal(retry.status, 200); assert.equal(retry.data.duplicate, true);
  assert.equal((await db.collection('events').doc(eventA.id).get()).data().photoCount, 1);
  assert.equal((await api(`/events/${eventA.id}/photos`, { token: a })).data.photos[0].message, '<img src=x onerror=alert(1)>');
});
test('foreign photo IDs cannot be read or moderated under another event', async () => {
  assert.equal((await api(`/events/${eventB.id}/photos/${photoId}`, { token: b, method: 'PATCH', body: { status: 'approved' } })).status, 404);
  assert.equal((await api(`/events/${eventA.id}/photos/${photoId}`, { token: b, method: 'PATCH', body: { status: 'approved' } })).status, 403);
  assert.equal((await api(`/events/${eventB.id}/photos/${photoId}/image`, { token: b })).status, 404);
});
test('approved projection uses resized images with metadata removed', async () => {
  assert.equal((await api(`/events/${eventA.id}/photos/${photoId}`, { token: a, method: 'PATCH', body: { status: 'approved' } })).status, 200);
  const photos = await api(`/events/${eventA.id}/photos?status=pending`, { key: eventA.projectionKey }); assert.equal(photos.data.photos.length, 1); assert.equal(photos.data.photos[0].status, 'approved');
  const img = await api(`/events/${eventA.id}/photos/${photoId}/image`, { key: eventA.projectionKey }); assert.equal(img.status, 200);
  const info = await sharp(Buffer.from(await img.response.arrayBuffer())).metadata(); assert.equal(info.width, 1920); assert.equal(info.exif, undefined); assert.equal(info.format, 'jpeg');
});
test('direct Firestore and Storage requests cannot bypass API permissions', async () => {
  const path = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/events/${eventA.id}`;
  assert.equal((await fetch(path)).status, 403);
  assert.equal((await fetch(path, { headers: { Authorization: `Bearer ${a}` } })).status, 403);
  assert.equal((await fetch(path, { method: 'PATCH', headers: { Authorization: `Bearer ${a}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { ownerId: { stringValue: 'attacker' } } }) })).status, 403);
  const file = `photos/${eventA.id}/${photoId}.jpg`;
  const storageUrl = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${project}.appspot.com/o/${encodeURIComponent(file)}?alt=media`;
  assert.equal((await fetch(storageUrl)).status, 403);
  assert.equal((await fetch(storageUrl, { headers: { Authorization: `Bearer ${a}` } })).status, 403);
});
test('fake files, huge messages and path traversal are rejected', async () => {
  const path = `/events/${eventA.id}/photos`;
  for (const body of [{ id: randomUUID(), imageBase64: 'data:image/png;base64,bm90YW5pbWFnZQ==' }, { id: randomUUID(), imageBase64, message: 'x'.repeat(201) }, { id: '../other', imageBase64 }]) assert.equal((await api(path, { method: 'POST', key: eventA.guestKey, body })).status, 400);
});
test('projection cannot keep reading a photo after rejection', async () => {
  assert.equal((await api(`/events/${eventA.id}/photos/${photoId}`, { token: a, method: 'PATCH', body: { status: 'rejected' } })).status, 200);
  assert.equal((await api(`/events/${eventA.id}/photos/${photoId}/image`, { key: eventA.projectionKey })).status, 404);
});
test('rotating links and closing events revoke guest access', async () => {
  assert.equal((await api(`/events/${eventA.id}`, { token: a, method: 'PATCH', body: { rotateLinks: true } })).status, 200);
  assert.equal((await api(`/events/${eventA.id}/public`, { key: eventA.guestKey })).status, 403);
  assert.equal((await api(`/events/${eventA.id}/photos`, { key: eventA.projectionKey })).status, 403);
  const changed = (await api(`/events/${eventA.id}`, { token: a })).data;
  assert.equal((await api(`/events/${eventA.id}`, { token: a, method: 'PATCH', body: { status: 'closed', ownerId: 'attacker' } })).status, 200);
  assert.equal((await api(`/events/${eventA.id}/public`, { key: changed.guestKey })).status, 403);
  assert.equal((await api(`/events/${eventA.id}/photos`, { method: 'POST', key: changed.guestKey, body: { id: randomUUID(), imageBase64 } })).status, 403);
  assert.equal((await api(`/events/${eventA.id}`, { token: a })).data.ownerId, eventA.ownerId);
});
test('only administrators can grant customer permissions', async () => {
  assert.equal((await api('/admin/enable-client', { token: a, method: 'POST', body: { email: 'other@example.test' } })).status, 403);
});
test('invalid calendar dates and event limits are enforced', async () => {
  assert.equal((await api('/events', { token: a, method: 'POST', body: { name: 'Bad date', date: '2026-02-31' } })).status, 400);
  await db.collection('accountLimits').doc(eventA.ownerId).set({ events: 100 });
  assert.equal((await api('/events', { token: a, method: 'POST', body: { name: 'Over quota', date: '2026-12-10' } })).status, 429);
});
test('network rate limits and per-event photo quotas fail before saving a file', async () => {
  const id = require('node:crypto').createHash('sha256').update(`${eventB.id}:127.0.0.1`).digest('hex');
  await db.collection('uploadLimits').doc(id).set({ count: 120, window: Date.now() });
  assert.equal((await api(`/events/${eventB.id}/photos`, { method: 'POST', key: eventB.guestKey, body: { id: randomUUID(), imageBase64 } })).status, 429);
  await db.collection('uploadLimits').doc(id).delete(); await db.collection('events').doc(eventB.id).update({ photoCount: 3000 });
  assert.equal((await api(`/events/${eventB.id}/photos`, { method: 'POST', key: eventB.guestKey, body: { id: randomUUID(), imageBase64 } })).status, 429);
  await db.collection('events').doc(eventB.id).update({ photoCount: 0 });
});
test('pagination covers more than 50 photos without exposing another event', async () => {
  const batch = db.batch(); for (let i = 0; i < 55; i++) batch.set(db.collection('photos').doc(`page-${i}`), { eventId: eventB.id, status: 'approved', createdAt: `2026-09-28T01:00:${String(i).padStart(2,'0')}.000Z`, message: 'page' }); await batch.commit();
  const first = await api(`/events/${eventB.id}/photos?status=approved`, { token: b }); assert.equal(first.data.photos.length, 50);
  const second = await api(`/events/${eventB.id}/photos?status=approved&cursor=${first.data.nextCursor}`, { token: b }); assert.equal(second.data.photos.length, 5);
  assert.equal(new Set([...first.data.photos, ...second.data.photos].map(p => p.id)).size, 55);
  assert.equal((await api(`/events/${eventB.id}/photos?status=approved&cursor=${photoId}`, { token: b })).status, 404);
});
test('production uploads fail closed without App Check configuration or token', async () => {
  const production = createApp({ db, auth, bucket, emulator: false }).listen(0, '127.0.0.1'); await new Promise(resolve => production.once('listening', resolve));
  try { const result = await fetch(`http://127.0.0.1:${production.address().port}/events/${eventB.id}/photos`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-event-key': eventB.guestKey }, body: '{}' }); assert.equal(result.status, 503); }
  finally { await new Promise(resolve => production.close(resolve)); }
  const checked = createApp({ db, auth, bucket, emulator: false, siteKey: 'configured', appCheck: { verifyToken: async () => { throw new Error('invalid'); } } }).listen(0, '127.0.0.1'); await new Promise(resolve => checked.once('listening', resolve));
  try { assert.equal((await fetch(`http://127.0.0.1:${checked.address().port}/events/${eventB.id}/photos`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-event-key': eventB.guestKey }, body: '{}' })).status, 403); }
  finally { await new Promise(resolve => checked.close(resolve)); }
});
test('approved reset deletes only event/photo data and leaves accounts and unrelated files intact', async () => {
  const { resetEvents } = require('../scripts/reset-events.cjs');
  await db.collection('unrelated').doc('keep').set({ preserve: true });
  await bucket.file('unrelated/keep.txt').save('keep');
  const before = await resetEvents({ db, bucket }); assert.ok(before.documents.events >= 2); assert.ok(before.photoFiles >= 1);
  assert.ok((await db.collection('events').get()).size >= 2);
  await resetEvents({ db, bucket, apply: true });
  for (const collection of ['events','photos','uploadLimits','accountLimits']) assert.equal((await db.collection(collection).get()).size, 0);
  assert.equal((await bucket.getFiles({ prefix: 'photos/' }))[0].length, 0);
  assert.equal((await bucket.file('unrelated/keep.txt').exists())[0], true);
  assert.equal((await db.collection('unrelated').doc('keep').get()).exists, true);
  assert.ok((await auth.getUser(eventA.ownerId)).emailVerified);
});
test('owner bootstrap requires the configured and verified Firebase email', async () => {
  const verified = await auth.verifyIdToken(pending);
  const ownerServer = createApp({ db, auth, bucket, emulator: true, ownerEmail: verified.email }).listen(0, '127.0.0.1'); await new Promise(resolve => ownerServer.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${ownerServer.address().port}/me`;
    const owner = await fetch(url, { headers: { Authorization: `Bearer ${pending}` } }); assert.equal((await owner.json()).admin, true);
    const other = await fetch(url, { headers: { Authorization: `Bearer ${b}` } }); assert.equal((await other.json()).admin, false);
    const unconfirmed = await fetch(url, { headers: { Authorization: `Bearer ${unverified}` } }); assert.equal(unconfirmed.status, 403);
    const change = (email, enabled) => fetch(`http://127.0.0.1:${ownerServer.address().port}/admin/enable-client`, { method: 'POST', headers: { Authorization: `Bearer ${pending}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, enabled }) });
    assert.equal((await change(verified.email, false)).status, 409);
    const newUid = `customer-${Date.now()}`; await account(newUid, true, false);
    assert.equal((await change(`${newUid}@example.test`, true)).status, 200);
    assert.equal((await auth.getUser(newUid)).customClaims.organizer, true);
    await db.collection('events').doc('suspended-event').set({ ownerId: newUid, status: 'active', guestKey: 'old-guest-key', projectionKey: 'old-projection-key' });
    await db.collection('events').doc('suspended-draft').set({ ownerId: newUid, status: 'draft' });
    assert.equal((await change(`${newUid}@example.test`, false)).status, 200);
    assert.equal((await auth.getUser(newUid)).customClaims.suspended, true);
    const suspended = (await db.collection('events').doc('suspended-event').get()).data();
    assert.equal(suspended.status, 'closed'); assert.notEqual(suspended.guestKey, 'old-guest-key'); assert.notEqual(suspended.projectionKey, 'old-projection-key');
    assert.equal((await db.collection('events').doc('suspended-draft').get()).data().status, 'draft');
  } finally { await new Promise(resolve => ownerServer.close(resolve)); }
});
