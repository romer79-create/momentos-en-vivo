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
let firebase, db, auth, bucket, server, base, a, b, event, imageBase64;
async function api(path, { token, key, body, method = 'GET' } = {}) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'X-Event-Key': key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, res, data: res.headers.get('content-type')?.includes('application/json') ? await res.json() : null };
}
const path = suffix => `/events/${event.id}${suffix}`;
const put = (presentation, extra = {}) => api(path('/presentation'), { token: a, method: 'PUT', body: { presentation, version: event.themeVersion || 0, ...extra } });
async function update(presentation) { const result = await put(presentation); assert.equal(result.status, 200, JSON.stringify(result.data)); event = { ...event, ...result.data }; return result; }
before(async () => {
  for (const name of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[name] || '', /^127\.0\.0\.1:/);
  firebase = initializeApp({ projectId: 'demo-momentos', storageBucket: 'demo-momentos.appspot.com' }); db = getFirestore(); auth = getAuth(); bucket = getStorage().bucket();
  server = createApp({ db, auth, bucket, emulator: true }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    const email = `design-${randomUUID()}@example.test`; await auth.createUser({ email, password: 'Prueba-local-123456', emailVerified: true });
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba-local-123456', returnSecureToken: true }) }); tokens.push((await res.json()).idToken);
  }
  [a, b] = tokens;
  const created = await api('/events', { token: a, method: 'POST', body: { name: 'Invitación privada', date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '20:30' } }); assert.equal(created.status, 201); event = created.data;
  const bytes = await sharp({ create: { width: 2200, height: 1400, channels: 4, background: '#ab56ff88' } }).withExif({ IFD0: { Copyright: 'private metadata' } }).png().toBuffer(); imageBase64 = `data:image/png;base64,${bytes.toString('base64')}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (firebase) await deleteApp(firebase); });

test('draft theme stays private; publishing requires paid activation; owner boundaries hold', async () => {
  await update({ themeId: 'aurora', subtitle: '<script>alert(1)</script>', custom: { accent: '#cba8fa' }, opening: true, countdown: false, musicEnabled: true });
  assert.equal(event.presentation.opening, true); assert.equal(event.presentation.countdown, false); assert.equal(event.presentation.musicEnabled, true);
  assert.equal((await api(path('/invitation'), { key: event.invitationKey })).status, 403);
  assert.equal((await put({ themeId: 'aurora', published: true })).status, 409);
  assert.equal((await api(path('/presentation'), { token: b, method: 'PUT', body: { presentation: {}, version: event.themeVersion } })).status, 403);
  assert.equal((await api(path('/theme-assets/logo'), { token: b, method: 'POST', body: { imageBase64, version: event.themeVersion } })).status, 403);
  assert.equal((await api(path('/rsvps'), { token: b })).status, 403);
});
test('theme data rejects CSS/URL payloads and unsupported fonts; stale writes cannot overwrite a newer design', async () => {
  for (const presentation of [{ themeId: '__proto__' }, { custom: { accent: 'url(https://attacker.test)' } }, { custom: { font: '<style>' } }, { custom: { css: 'body{}' } }, { message: 'a'.repeat(301) }, { rsvpEnabled: 'true' }, { opening: 'true' }, { countdown: 1 }, { musicEnabled: 'yes' }]) assert.equal((await put(presentation)).status, 400);
  assert.equal((await put({ themeId: 'champagne' }, { version: 0 })).status, 409);
});
test('custom assets are actual raster images, sanitized, bounded, private and scoped to the event', async () => {
  const upload = await api(path('/theme-assets/logo'), { token: a, method: 'POST', body: { imageBase64, version: event.themeVersion } }); assert.equal(upload.status, 201); event.themeVersion = upload.data.version;
  const privateFile = await api(path('/theme-assets/logo'), { token: a }); assert.equal(privateFile.status, 200);
  const meta = await sharp(Buffer.from(await privateFile.res.arrayBuffer())).metadata(); assert.equal(meta.width, 600); assert.equal(meta.format, 'webp'); assert.equal(meta.hasAlpha, true); assert.equal(meta.exif, undefined);
  for (const options of [{}, { token: b }, { key: event.invitationKey }, { key: event.guestKey }]) assert.equal((await api(path('/theme-assets/logo'), options)).status, 403);
  const disguisedSvg = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>').toString('base64')}`;
  assert.equal((await api(path('/theme-assets/logo'), { token: a, method: 'POST', body: { imageBase64: disguisedSvg, version: event.themeVersion } })).status, 400);
  assert.equal((await api(path('/theme-assets/invalid'), { token: a, method: 'POST', body: { imageBase64, version: event.themeVersion } })).status, 400);
});
test('published invitations open before the event but never disclose owner data or the projection secret', async () => {
  const id = randomUUID(); await api('/orders', { token: a, method: 'POST', body: { id, planId: 'evento-1' } }); await api(`/orders/${id}/simulate`, { token: a, method: 'POST', body: { status: 'approved' } });
  assert.equal((await api(path('/activate'), { token: a, method: 'POST' })).status, 200);
  await update({ ...event.presentation, published: true, venue: 'Posadas', address: 'Salón de prueba' });
  const result = await api(path('/invitation'), { key: event.invitationKey }); assert.equal(result.status, 200); assert.equal(result.data.rsvpOpen, true); assert.equal(result.data.guestKey, null); assert.equal(result.data.presentation.subtitle, '<script>alert(1)</script>');
  for (const field of ['ownerEmail', 'ownerId', 'projectionKey', 'invitationKey', 'creditOrderId']) assert.equal(field in result.data, false);
  assert.equal((await api(path('/theme-assets/logo'), { key: event.invitationKey })).status, 200);
  assert.equal((await api(path('/photos'), { key: event.invitationKey })).status, 403);
  assert.equal((await api(path('/invitation'), { key: event.projectionKey })).status, 403);
});
test('RSVP retries and changes are atomic, bounded and do not expose other guests', async () => {
  const body = { id: randomUUID(), name: '=HYPERLINK("test")', attending: true, seats: 3 };
  const submit = body => api(path('/invitation/rsvp'), { key: event.invitationKey, method: 'POST', body });
  const results = await Promise.all([submit(body), submit(body)]); assert.deepEqual(results.map(r => r.status), [200, 200]);
  const list = await api(path('/rsvps'), { token: a }); assert.equal(list.data.responses.length, 1); assert.equal(list.data.seats, 3);
  assert.equal((await api(path('/rsvps'), { key: event.invitationKey })).status, 401);
  assert.equal((await submit({ ...body, seats: 11 })).status, 400);
  assert.equal((await submit({ ...body, attending: false })).status, 200); assert.equal((await api(path('/rsvps'), { token: a })).data.seats, 0);
  await db.collection('events').doc(event.id).update({ rsvpCount: 2000 });
  assert.equal((await submit({ ...body, id: randomUUID() })).status, 429);
  assert.equal((await submit({ ...body, seats: 2 })).status, 200); assert.equal((await api(path('/rsvps'), { token: a })).data.seats, 2);
});
test('custom music has private access, strict validation, transactional replacement and removal', async () => {
  const audioBase64 = require('./music-fixture.cjs').wave().toString('base64');
  const upload = (token = a, extra = {}) => api(path('/theme-music'), { token, method: 'POST', body: { audioBase64, name: 'Mi música.wav', version: event.themeVersion, ...extra } });
  assert.equal((await upload(b)).status, 403);
  assert.equal((await upload(a, { audioBase64: Buffer.from('<script>bad</script>').toString('base64') })).status, 400);
  assert.equal((await put({ ...event.presentation, musicSource: 'custom' })).status, 400);
  let result = await upload(); assert.equal(result.status, 201); event.themeVersion = result.data.version;
  const firstId = result.data.track.id;
  const saved = await api(path('/theme-music'), { token: a }); assert.equal(saved.status, 200); assert.equal(saved.res.headers.get('content-type'), 'audio/wav');
  assert.equal((await api(path('/theme-music'), { token: b })).status, 403);
  assert.equal((await api(path('/theme-music'))).status, 403);
  assert.equal((await api(path('/theme-music'), { key: event.projectionKey })).status, 403);
  assert.equal((await api(path('/theme-music'), { key: event.invitationKey })).status, 200);
  const stale = await upload(a, { version: event.themeVersion - 1 }); assert.equal(stale.status, 409);
  assert.equal((await bucket.getFiles({ prefix: `themes/${event.id}/music/` }))[0].length, 1);
  await update({ ...event.presentation, musicEnabled: true, musicSource: 'custom' });
  assert.equal((await api(path('/invitation'), { key: event.invitationKey })).data.themeMusic.id, firstId);
  result = await upload(); assert.equal(result.status, 201); event.themeVersion = result.data.version;
  assert.equal((await bucket.file(`themes/${event.id}/music/${firstId}.wav`).exists())[0], false);
  await update({ ...event.presentation, published: false });
  assert.equal((await api(path('/theme-music'), { key: event.invitationKey })).status, 403);
  assert.equal((await put(event.presentation, { removeMusic: true })).status, 400);
  const removed = await put({ ...event.presentation, published: true, musicSource: 'instrumental' }, { removeMusic: true });
  assert.equal(removed.status, 200); event = { ...event, ...removed.data };
  assert.equal(event.themeMusic, null); assert.equal((await bucket.getFiles({ prefix: `themes/${event.id}/music/` }))[0].length, 0);
  assert.equal((await api(path('/theme-music'), { token: a })).status, 404);
});

test('removal deletes stored images; link rotation and unpublishing revoke invitation access', async () => {
  const file = (await api(path(''), { token: a })).data.themeAssets.logo;
  const removed = await put(event.presentation, { removeAssets: ['logo'] }); assert.equal(removed.status, 200); event = { ...event, ...removed.data };
  assert.equal((await bucket.file(`themes/${event.id}/logo/${file.id}.webp`).exists())[0], false);
  assert.equal((await api(path('/theme-assets/logo'), { key: event.invitationKey })).status, 404);
  const old = event.invitationKey;
  assert.equal((await api(path(''), { token: a, method: 'PATCH', body: { rotateLinks: true } })).status, 200);
  assert.equal((await api(path('/invitation'), { key: old })).status, 403);
  event = (await api(path(''), { token: a })).data;
  assert.equal((await api(path('/invitation'), { key: event.invitationKey })).status, 200);
  await update({ ...event.presentation, published: false }); assert.equal((await api(path('/invitation'), { key: event.invitationKey })).status, 403);
});
test('event start stops RSVP; expiry and closure stop the shared invitation', async () => {
  await update({ ...event.presentation, published: true });
  const ref = db.collection('events').doc(event.id); await ref.update({ startsAt: new Date(Date.now() - 60000).toISOString() });
  const active = await api(path('/invitation'), { key: event.invitationKey }); assert.equal(active.data.rsvpOpen, false); assert.equal(active.data.guestKey, event.guestKey);
  assert.equal((await api(path('/invitation/rsvp'), { key: event.invitationKey, method: 'POST', body: { id: randomUUID(), name: 'Tarde', attending: true, seats: 1 } })).status, 403);
  await ref.update({ receivesUntil: new Date(Date.now() - 1000).toISOString() }); assert.equal((await api(path('/invitation'), { key: event.invitationKey })).status, 403);
  await ref.update({ receivesUntil: new Date(Date.now() + 3600000).toISOString(), status: 'closed' }); assert.equal((await api(path('/invitation'), { key: event.invitationKey })).status, 403);
});
