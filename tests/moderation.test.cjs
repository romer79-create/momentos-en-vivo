const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const r = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = r('firebase-admin/app');
const { getFirestore } = r('firebase-admin/firestore');
const { getAuth } = r('firebase-admin/auth');
const { getStorage } = r('firebase-admin/storage');
const sharp = r('sharp');
const { createApp } = require('../functions/app');
const policy = require('../functions/moderation-policy.json');
let firebase, db, auth, bucket, server, base, owner, other, admin, event, imageBase64, gate;
const users = [];
const path = suffix => `/events/${event.id}${suffix}`;
async function api(suffix, { token, key, method = 'GET', body } = {}) {
  const res = await fetch(`${base}/api${suffix}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'X-Event-Key': key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: res.headers.get('content-type')?.includes('application/json') ? await res.json() : null, res };
}
const setting = (autoApprove, extra = {}) => api(path(''), { token: owner, method: 'PATCH', body: { autoApprove, ...(autoApprove ? { responsibilityAccepted: true, responsibilityVersion: policy.version } : {}), ...extra } });
const upload = (extra = {}) => api(path('/photos'), { key: event.guestKey, method: 'POST', body: { id: randomUUID(), imageBase64, message: 'Un momento', ...extra } });
before(async () => {
  for (const name of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[name] || '', /^127\.0\.0\.1:/);
  firebase = initializeApp({ projectId: 'demo-momentos', storageBucket: 'demo-momentos.appspot.com' }); db = getFirestore(); auth = getAuth(); bucket = getStorage().bucket();
  const wrappedBucket = { file: name => ({
    save: async (...args) => { await bucket.file(name).save(...args); if (gate?.name === name) { gate.started(); await gate.wait; } },
    delete: (...args) => bucket.file(name).delete(...args), download: (...args) => bucket.file(name).download(...args)
  }) };
  server = createApp({ db, auth, bucket: wrappedBucket, emulator: true }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const tokens = [];
  for (let i = 0; i < 3; i++) {
    const email = `moderation-${randomUUID()}@example.test`; const u = await auth.createUser({ email, password: 'Prueba-local-123456', emailVerified: true }); users.push(u.uid);
    if (i === 2) await auth.setCustomUserClaims(u.uid, { admin: true });
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba-local-123456', returnSecureToken: true }) }); tokens.push((await res.json()).idToken);
  }
  [owner, other, admin] = tokens;
  const created = await api('/events', { token: owner, method: 'POST', body: { name: 'Prueba aislada de moderación', date: new Date().toISOString().slice(0, 10), autoApprove: true } }); assert.equal(created.status, 201); event = created.data;
  await db.collection('events').doc(event.id).update({ status: 'active', activatedAt: new Date().toISOString(), billingMode: 'local', startsAt: new Date(Date.now() - 60000).toISOString(), receivesUntil: new Date(Date.now() + 3600000).toISOString(), downloadUntil: new Date(Date.now() + 86400000).toISOString(), limits: { photoLimit: 3000 } });
  imageBase64 = `data:image/png;base64,${(await sharp({ create: { width: 120, height: 90, channels: 3, background: '#dbb984' } }).withExif({ IFD0: { Copyright: 'private' } }).png().toBuffer()).toString('base64')}`;
});
after(async () => {
  gate?.release(); if (server) await new Promise(resolve => server.close(resolve));
  // Only this suite's own records; never reset shared emulators.
  if (event) {
    await bucket.deleteFiles({ prefix: `photos/${event.id}/` });
    const photos = await db.collection('photos').where('eventId', '==', event.id).get(); const batch = db.batch(); photos.forEach(doc => batch.delete(doc.ref)); batch.delete(db.collection('events').doc(event.id)); await batch.commit();
  }
  for (const uid of users) { await auth.deleteUser(uid); await db.collection('accountLimits').doc(uid).delete(); }
  if (firebase) await deleteApp(firebase);
});

test('manual by default and strict consent required; guests, other owners and admins cannot opt in for the client', async () => {
  assert.equal(event.autoApprove, false);
  for (const body of [{ autoApprove: true }, { autoApprove: 'true' }, { autoApprove: true, responsibilityAccepted: 'true', responsibilityVersion: policy.version }, { autoApprove: true, responsibilityAccepted: true, responsibilityVersion: 'outdated' }]) assert.equal((await api(path(''), { token: owner, method: 'PATCH', body })).status, 400);
  const body = { autoApprove: true, responsibilityAccepted: true, responsibilityVersion: policy.version };
  for (const token of [other, admin]) assert.equal((await api(path(''), { token, method: 'PATCH', body })).status, 403);
  assert.equal((await api(path(''), { key: event.guestKey, method: 'PATCH', body })).status, 401);
});
test('guest cannot force approval; enabling affects only new photos and records consent', async () => {
  const pending = await upload({ status: 'approved', autoApprove: true }); assert.equal(pending.status, 201); assert.equal(pending.data.status, 'pending');
  assert.equal((await setting(true)).status, 200);
  const record = (await api(path(''), { token: owner })).data; assert.equal(record.safeModeConsent.acceptedBy, users[0]); assert.equal(record.safeModeConsent.text, policy.responsibility); assert.ok(Date.parse(record.safeModeConsent.acceptedAt));
  assert.equal((await db.collection('photos').doc(pending.data.id).get()).data().status, 'pending');
  const publicInfo = (await api(path('/public'), { key: event.guestKey })).data; assert.equal(publicInfo.autoApprove, true); assert.equal(publicInfo.safeModeConsent, undefined);
  assert.equal((await api(path('/photos'), { key: event.projectionKey })).data.photos.length, 0);
});
test('automatic photos are published only after storage, sanitized, idempotent and still removable', async () => {
  const id = randomUUID(); const sent = await upload({ id }); assert.equal(sent.status, 201); assert.equal(sent.data.status, 'approved');
  const photo = (await db.collection('photos').doc(id).get()).data(); assert.equal(photo.approvalMode, 'automatic'); assert.ok(Date.parse(photo.publishedAt));
  const file = await api(path(`/photos/${id}/image`), { key: event.projectionKey }); assert.equal(file.status, 200); const meta = await sharp(Buffer.from(await file.res.arrayBuffer())).metadata(); assert.equal(meta.exif, undefined);
  const feed = (await api(path('/photos'), { key: event.projectionKey })).data;
  assert.deepEqual((await api(path(`/photos?version=${feed.version}`), { key: event.projectionKey })).data, { unchanged: true, version: feed.version });
  assert.equal((await api(path(`/photos?version=${feed.version}`), { key: event.guestKey })).status, 403);
  const count = (await db.collection('events').doc(event.id).get()).data().photoCount;
  const retry = await upload({ id }); assert.equal(retry.data.duplicate, true); assert.equal(retry.data.status, 'approved'); assert.equal((await db.collection('events').doc(event.id).get()).data().photoCount, count);
  await api(path(`/photos/${id}`), { token: owner, method: 'PATCH', body: { status: 'rejected' } });
  const changed = (await api(path(`/photos?version=${feed.version}`), { key: event.projectionKey })).data; assert.notEqual(changed.version, feed.version); assert.equal(changed.photos.some(p => p.id === id), false);
  assert.equal((await upload({ id })).data.status, 'rejected'); assert.equal((await api(path(`/photos/${id}/image`), { key: event.projectionKey })).status, 404);
});
test('disabling automatic publication also catches in-flight uploads; processing is private', async () => {
  const id = randomUUID(); let started, release; const start = new Promise(resolve => { started = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  gate = { name: `photos/${event.id}/${id}.jpg`, started, wait, release };
  const uploading = upload({ id });
  try {
    await Promise.race([start, new Promise((_, reject) => setTimeout(() => reject(new Error('upload did not reach storage')), 10000).unref())]);
    assert.equal((await db.collection('photos').doc(id).get()).data().status, 'processing');
    assert.equal((await api(path(`/photos/${id}/image`), { key: event.projectionKey })).status, 404);
    await setting(false); release(); const result = await uploading; assert.equal(result.data.status, 'pending');
    assert.equal((await upload()).data.status, 'pending');
  } finally { release(); gate = null; await uploading; }
});
test('safe mode preserves access, file, quota and closed-event checks', async () => {
  await setting(true);
  assert.equal((await api(path('/photos'), { key: 'wrong', method: 'POST', body: { id: randomUUID(), imageBase64 } })).status, 403);
  assert.equal((await upload({ imageBase64: 'data:image/png;base64,YmFk' })).status, 400);
  assert.equal((await upload({ message: 'x'.repeat(201) })).status, 400);
  const ref = db.collection('events').doc(event.id); const data = (await ref.get()).data();
  await ref.update({ limits: { photoLimit: data.photoCount } }); assert.equal((await upload()).status, 429);
  await ref.update({ limits: { photoLimit: 3000 }, status: 'closed' }); assert.equal((await upload()).status, 403); await ref.update({ status: 'active' });
});
test('late approval enters the latest publication feed beyond 50 newer uploads, with legacy compatibility', async () => {
  await setting(false); const late = await upload(); const ref = db.collection('photos').doc(late.data.id); await ref.update({ createdAt: '2020-01-01T00:00:00.000Z' });
  const batch = db.batch(); let legacyId;
  for (let i = 0; i < 52; i++) { const p = db.collection('photos').doc(); legacyId = p.id; batch.create(p, { eventId: event.id, status: 'approved', createdAt: new Date(Date.now() - 60000 + i * 10).toISOString(), message: 'legacy' }); }
  await batch.commit();
  await api(path(`/photos/${late.data.id}`), { token: owner, method: 'PATCH', body: { status: 'approved' } });
  const firstTime = (await ref.get()).data().publishedAt;
  await api(path(`/photos/${late.data.id}`), { token: owner, method: 'PATCH', body: { status: 'approved' } }); assert.equal((await ref.get()).data().publishedAt, firstTime);
  const list = (await api(path('/photos'), { key: event.projectionKey })).data.photos; assert.equal(list.length, 50); assert.equal(list[0].id, late.data.id); assert.ok(list.some(p => p.id === legacyId));
});
