const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');
const sharp = requireFunctions('sharp');
const JSZip = require('jszip');
const { createAlbums } = require('../functions/albums');
const { createNotifications, messageId, POLICY, compose } = require('../functions/notifications');
const { createRetention, eligible } = require('../functions/retention');
const { createApp } = require('../functions/app');
const { createCommerce } = require('../functions/commerce');
const S = require('../functions/security');
let firebase, db, bucket, bytes, server, base;
const ids = [], docs = [];
const uid = randomUUID(), DAY = 86400000;
const auth = { verifyIdToken: async token => ({ uid: token, email_verified: true, email: 'qa@example.test' }), getUser: async () => ({ emailVerified: true, email: 'qa@example.test' }) };
before(async () => {
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[key] || '', /^127\.0\.0\.1:/);
  // Separate emulator project: no live user data or shared function triggers.
  firebase = initializeApp({ projectId: 'demo-automation-tests', storageBucket: 'demo-automation-tests.appspot.com' }, 'automation'); db = getFirestore(firebase); bucket = getStorage(firebase).bucket();
  bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#b78942' } }).jpeg().toBuffer();
  server = createApp({ db, auth, bucket, emulator: true }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
async function event(extra = {}) {
  const id = randomUUID(); ids.push(id); const now = Date.now();
  await db.collection('events').doc(id).set({ name: 'Evento QA', ownerId: uid, billingMode: 'local', status: 'active', activatedAt: new Date(now).toISOString(), automationVersion: 'self-service-v1', startsAt: new Date(now + 2 * DAY).toISOString(), receivesUntil: new Date(now + 4 * DAY).toISOString(), downloadUntil: new Date(now + 34 * DAY).toISOString(), limits: { photoLimit: 3000, receptionHours: 48, downloadDays: 30 }, ...extra }); return id;
}
async function photo(eventId, status = 'approved', extra = {}) {
  const id = randomUUID(), ref = db.collection('photos').doc(id); docs.push(ref);
  const fileName = `photos/${eventId}/${id}.jpg`; await bucket.file(fileName).save(bytes);
  await ref.set({ eventId, status, fileName, message: 'Un recuerdo', createdAt: new Date().toISOString(), ...extra }); return id;
}
async function api(path, token = uid, method = 'GET') { return fetch(`${base}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  for (const id of ids) {
    for (const prefix of ['photos', 'themes', 'albums']) await bucket.deleteFiles({ prefix: `${prefix}/${id}/` });
    const ref = db.collection('events').doc(id); await db.recursiveDelete(ref); await db.collection('albumJobs').doc(id).delete(); await db.collection('serviceIncidents').doc(`retention_${id}`).delete();
    const mails = await db.collection('mailOutbox').where('entityId', '==', id).get(); for (const mail of mails.docs) await mail.ref.delete();
  }
  for (const ref of docs) await ref.delete();
  if (firebase) await deleteApp(firebase);
});
test('full album resumes across workers, separates moderation states and excludes processing photos', async () => {
  const id = await event(); const photos = [];
  for (const status of ['approved', 'pending', 'rejected', 'approved', 'pending']) photos.push(await photo(id, status));
  await photo(id, 'processing');
  const create = () => createAlbums({ db, bucket, partSize: 2 });
  const job = await create().request(id); assert.equal(job.total, 5);
  await Promise.all([create().run(id), create().run(id)]);
  assert.ok([2, 4].includes((await create().status(id)).done));
  await create().run(id); await create().run(id);
  const ready = await create().status(id); assert.equal(ready.state, 'ready'); assert.deepEqual(ready.parts.map(p => p.count), [2, 2, 1]);
  const record = (await db.collection('albumJobs').doc(id).get()).data(); const entries = [];
  for (const part of record.parts) {
    const [buffer] = await bucket.file(part.name).download(); const zip = await JSZip.loadAsync(buffer);
    assert.ok(zip.file('recuerdos.json')); const manifest = JSON.parse(await zip.file('recuerdos.json').async('string')); assert.equal(manifest.fotos.length, part.count);
    entries.push(...Object.keys(zip.files).filter(name => name.endsWith('.jpg')));
  }
  assert.equal(entries.length, 5); assert.equal(new Set(entries.map(n => n.split('/')[1])).size, 5);
  assert.ok(entries.some(n => n.startsWith('rechazadas/')));
  assert.equal((await create().request(id)).state, 'ready');
});
test('album endpoints reject anonymous, foreign and expired access and do not leak storage paths', async () => {
  const id = await event(); await photo(id);
  assert.equal((await api(`/events/${id}/album`, null)).status, 401);
  assert.equal((await api(`/events/${id}/album`, 'foreign')).status, 403);
  assert.equal((await api(`/events/${id}/album`, uid, 'POST')).status, 202);
  const albums = createAlbums({ db, bucket }); await albums.run(id);
  const result = await (await api(`/events/${id}/album`)).json(); assert.ok(result.parts.length); assert.equal(result.parts[0].name, undefined);
  assert.equal((await api(`/events/${id}/album/0/download`, 'foreign', 'POST')).status, 403);
  assert.equal((await api(`/events/${id}/album/0/file`)).status, 200);
  await db.collection('events').doc(id).update({ downloadUntil: new Date(Date.now() - 1).toISOString() });
  assert.equal((await api(`/events/${id}/album/0/download`, uid, 'POST')).status, 410);
  assert.equal((await api(`/events/${id}/album/0/file`)).status, 410);
});
test('missing or foreign files fail closed and retry without dropping the photo', async () => {
  let time = Date.now(); const id = await event(), other = await event(); const pid = await photo(id, 'approved', { fileName: `photos/${other}/foreign.jpg` });
  const albums = createAlbums({ db, bucket, now: () => time }); await albums.request(id); await albums.run(id);
  assert.equal((await albums.status(id)).done, 0); assert.equal((await albums.status(id)).state, 'queued');
  await db.collection('photos').doc(pid).update({ fileName: `photos/${id}/${pid}.jpg` }); time += 10 * 60000;
  await albums.run(id); assert.equal((await albums.status(id)).state, 'ready');
});
test('mail scheduling is idempotent, future reminders wait, stale dates are cancelled', async () => {
  const id = await event(); let time = Date.now(), sends = 0;
  const mail = createNotifications({ db, auth, now: () => time, deliver: async () => { sends++; return { accepted: ['qa@example.test'] }; } });
  await Promise.all([mail.scheduleEvent(id), mail.scheduleEvent(id)]);
  const e = (await db.collection('events').doc(id).get()).data();
  const activation = messageId('activation', id, e.activatedAt), reminder = messageId('reminder', id, e.startsAt);
  await Promise.all([mail.run(activation), mail.run(activation)]); assert.equal(sends, 1);
  await mail.run(reminder); assert.equal(sends, 1);
  await db.collection('events').doc(id).update({ startsAt: new Date(time + 5 * DAY).toISOString() });
  time += 1.5 * DAY; await mail.run(reminder); assert.equal((await db.collection('mailOutbox').doc(reminder).get()).data().state, 'cancelled');
});
test('disabled mail never delivers; preview is not sent; failed deliveries retry', async () => {
  const id = await event(); const preview = createNotifications({ db, auth, emulator: true }); await preview.scheduleEvent(id);
  const e = (await db.collection('events').doc(id).get()).data(), mid = messageId('activation', id, e.activatedAt);
  await createNotifications({ db, auth, env: {} }).run(mid); assert.equal((await db.collection('mailOutbox').doc(mid).get()).data().state, 'queued');
  await preview.run(mid); assert.equal((await db.collection('mailOutbox').doc(mid).get()).data().state, 'preview');
  const second = await event(), e2 = (await db.collection('events').doc(second).get()).data(), m2 = messageId('activation', second, e2.activatedAt); let time = Date.now(), calls = 0;
  const mail = createNotifications({ db, auth, now: () => time, deliver: async () => { if (++calls === 1) throw new Error('Offline'); return { accepted: ['qa@example.test'] }; } });
  await mail.scheduleEvent(second); await mail.run(m2); assert.equal((await db.collection('mailOutbox').doc(m2).get()).data().state, 'queued');
  time += 10 * 60000; await mail.run(m2); assert.equal((await db.collection('mailOutbox').doc(m2).get()).data().state, 'sent');
  assert.match(compose('purchase', { credits: 3, planTitle: 'Pack' }).text, /3 eventos/);
});
test('cleanup needs explicit policy, an on-time sent warning and the real deadline', async () => {
  const now = Date.now(), until = new Date(now - DAY).toISOString(); const e = { purgePending: true, limits: { retentionPolicy: POLICY }, downloadUntil: until };
  const warning = { state: 'sent', version: until, sentAt: now - 5 * DAY };
  assert.equal(eligible(e, warning, now), true);
  for (const w of [undefined, { ...warning, state: 'preview' }, { ...warning, sentAt: now - 2 * DAY }, { ...warning, version: 'old' }]) assert.equal(eligible(e, w, now), false);
  assert.equal(eligible({ ...e, purgePending: false }, warning, now), false);
  assert.equal(eligible(e, warning, now - 2 * DAY), false);
  const id = await event(e); await photo(id); const retention = createRetention({ db, bucket, now: () => now, env: { RETENTION_CLEANUP: 'enabled' } });
  await retention.processEvent(id); assert.equal((await db.collection('events').doc(id).get()).data().assetsState, undefined);
});
test('cleanup quiesces writes, resumes bounded batches, and preserves neighboring events', async () => {
  let time = Date.now(); const until = new Date(time - DAY).toISOString();
  const id = await event({ downloadUntil: until, purgePending: true, limits: { retentionPolicy: POLICY } }), neighbor = await event();
  const pid = await photo(id), other = await photo(neighbor); await bucket.file(`themes/${id}/music/test.wav`).save(Buffer.from('fixture')); await bucket.file(`albums/${id}/fixture/test.zip`).save(Buffer.from('fixture'));
  await db.collection('events').doc(id).collection('rsvps').doc('guest').set({ name: 'QA' });
  await db.collection('mailOutbox').doc(messageId('expiry', id, until)).set({ state: 'sent', kind: 'expiry', entityId: id, ownerId: uid, version: until, sentAt: time - 5 * DAY });
  const retention = () => createRetention({ db, bucket, now: () => time, env: { RETENTION_CLEANUP: 'enabled' } });
  await retention().processEvent(id); const e = (await db.collection('events').doc(id).get()).data();
  assert.equal(e.assetsState, 'deleting'); assert.equal(S.canManage({ uid }, e), false); assert.equal((await bucket.file(`photos/${id}/${pid}.jpg`).exists())[0], true);
  time += 16 * 60000;
  for (let i = 0; i < 12; i++) await retention().processEvent(id);
  assert.equal((await db.collection('events').doc(id).get()).data().assetsState, 'deleted');
  assert.equal((await db.collection('photos').doc(pid).get()).exists, false);
  assert.equal((await bucket.file(`photos/${neighbor}/${other}.jpg`).exists())[0], true);
  assert.equal((await db.collection('events').doc(neighbor).get()).exists, true);
});
test('activation rejects an outdated review without consuming credit and duplicate activation is idempotent', async () => {
  const commerce = createCommerce({ db, emulator: true }); const orderId = randomUUID(); docs.push(db.collection('orders').doc(orderId), db.collection('creditLots').doc(orderId), db.collection('creditLedger').doc(`purchase_${orderId}`), db.collection('payments').doc(`mp_local-${orderId}`), db.collection('mailOutbox').doc(messageId('purchase', orderId)));
  await commerce.createOrder(uid, { id: orderId, planId: 'pack-3' }); await commerce.simulate(uid, orderId, 'approved');
  const id = await event({ status: 'draft', activatedAt: null }); const quote = await commerce.previewActivation(uid, id);
  await db.collection('events').doc(id).update({ name: 'Nombre cambiado' });
  await assert.rejects(commerce.activate(uid, id, false, quote.reviewToken), error => error.status === 409); assert.equal(await commerce.balance(uid), 3);
  const fresh = await commerce.previewActivation(uid, id); await Promise.all([commerce.activate(uid, id, false, fresh.reviewToken), commerce.activate(uid, id, false, fresh.reviewToken)]);
  assert.equal(await commerce.balance(uid), 2); docs.push(db.collection('creditLedger').doc(`activate_${id}`));
});
