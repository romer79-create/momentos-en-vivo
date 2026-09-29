'use strict';
const express = require('express');
const sharp = require('sharp');
const { createHash } = require('node:crypto');
const S = require('./security');
const { createCommerce } = require('./commerce');
const { installPresentation, publicPresentation } = require('./presentation');
const moderationPolicy = require('./moderation-policy.json');
const { createAlbums, installAlbums } = require('./albums');

function createApp({ db, auth, bucket, appCheck, emulator = false, siteKey = '', ownerEmail = '', commerce: suppliedCommerce }) {
  const app = express();
  const commerce = suppliedCommerce || createCommerce({ db, emulator });
  const albums = createAlbums({ db, bucket });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.url = req.url.replace(/^\/api1(?=\/|$)/, '').replace(/^\/api(?=\/|$)/, '') || '/';
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next();
  });
  const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const user = async req => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    S.requireValue(match, 401, 'Iniciá sesión para continuar.');
    let decoded;
    try { decoded = await auth.verifyIdToken(match[1], true); } catch { throw new S.HttpError(401, 'La sesión venció. Volvé a ingresar.'); }
    S.requireValue(decoded.email_verified === true, 403, 'Verificá tu correo antes de continuar.');
    S.requireValue(decoded.suspended !== true, 403, 'Tu cuenta está suspendida. Contactá a soporte.');
    // Optional owner bootstrap: server configuration plus Firebase-verified email.
    // A browser-supplied email/role or an unverified account never grants privileges.
    if (ownerEmail && decoded.email?.toLowerCase() === ownerEmail.toLowerCase()) decoded = { ...decoded, admin: true, organizer: true };
    req.user = decoded; return decoded;
  };
  const eventFor = async req => {
    const ref = db.collection('events').doc(S.identifier(req.params.eventId)); const doc = await ref.get();
    S.requireValue(doc.exists && (!doc.data().activatedAt || doc.data().billingMode === commerce.billingMode), 404, 'Evento no disponible.'); return { ref, data: doc.data(), id: doc.id };
  };
  const owner = async req => {
    const current = await user(req); const event = await eventFor(req);
    S.requireValue(S.canManage(current, event.data), 403, 'No tenés acceso a este evento.');
    if (req.method !== 'GET' && event.data.downloadUntil) S.requireValue(Date.parse(event.data.downloadUntil) > Date.now(), 410, 'El plazo de este evento terminó.');
    return event;
  };
  const viewer = async req => {
    const current = req.headers.authorization ? await user(req) : null; const event = await eventFor(req);
    S.requireValue(S.canView(current, event.data, req.headers['x-event-key']), 403, 'El enlace no es válido o el evento está cerrado.');
    return { ...event, manager: S.canManage(current, event.data) };
  };
  const attestation = async req => {
    if (emulator) return;
    S.requireValue(siteKey, 503, 'La recepción de fotos todavía no está habilitada.');
    try { await appCheck.verifyToken(req.headers['x-firebase-appcheck'] || ''); }
    catch { throw new S.HttpError(403, 'No pudimos verificar este dispositivo. Recargá la página.'); }
  };
  // Bounded counter per event/network; never retain raw addresses or user agents.
  const throttle = async (req, eventId) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').at(-1).trim();
    const id = createHash('sha256').update(`${eventId}:${ip}`).digest('hex');
    const ref = db.collection('uploadLimits').doc(id); const now = Date.now();
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const previous = snap.data() || {};
      const count = now - (previous.window || 0) < 60000 ? (previous.count || 0) : 0;
      S.requireValue(count < 120, 429, 'Hay muchas fotos en proceso. Esperá un minuto e intentá otra vez.');
      tx.set(ref, { count: count + 1, window: count ? previous.window : now, expiresAt: new Date(now + 86400000) });
    });
  };
  const photoFor = async (eventId, photoId) => {
    const ref = db.collection('photos').doc(S.identifier(photoId)); const snap = await ref.get();
    S.requireValue(snap.exists && snap.data().eventId === eventId, 404, 'Foto no disponible.'); return { ref, data: snap.data(), id: snap.id };
  };
  const photoJson = doc => {
    const p = doc.data(); return { id: doc.id, eventId: p.eventId, status: p.status, message: p.message || '', createdAt: p.createdAt || '', publishedAt: p.publishedAt || '', approvalMode: p.approvalMode || 'manual', width: p.width || null, height: p.height || null };
  };
  const bytesFor = async photo => {
    if (photo.fileName) {
      S.requireValue(photo.fileName.startsWith(`photos/${photo.eventId}/`), 404, 'Archivo no disponible.');
      return (await bucket.file(photo.fileName).download())[0];
    }
    // Read-only compatibility for past events. Never fetch arbitrary legacy URLs.
    return sharp(S.decodeImage(photo.imageBase64), { limitInputPixels: 25000000 }).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  };
  app.get('/config', (_req, res) => res.json({ appCheckSiteKey: siteKey, emulator }));
  app.get('/health', (_req, res) => res.json({ ok: true, version: 3 }));
  app.get('/admin/service-status', route(async (req, res) => {
    const u = await user(req); S.requireValue(u.admin === true, 403, 'Solo el administrador puede consultar este panel.');
    const sources = [['billingIncidents', 'resolved', false], ['serviceIncidents', 'resolved', false], ['mailOutbox', 'state', 'failed'], ['albumJobs', 'state', 'failed']];
    const found = await Promise.all(sources.map(([collection, field, value]) => db.collection(collection).where(field, '==', value).limit(20).get()));
    res.json({ payments: commerce.catalog().mode, mail: emulator ? 'preview' : process.env.MAIL_MODE === 'smtp' ? 'smtp' : 'disabled', cleanup: process.env.RETENTION_CLEANUP === 'enabled', issues: found.flatMap((result, i) => result.docs.map(d => ({ id: d.id, source: sources[i][0], eventId: d.data().eventId || (sources[i][0] === 'mailOutbox' && d.data().kind !== 'purchase' ? d.data().entityId : null), orderId: d.data().orderId || null, reason: d.data().reason || (sources[i][0] === 'mailOutbox' ? 'delivery_failed' : 'album_failed') }))) });
  }));
  app.get('/catalog', route(async (req, res) => {
    const u = req.headers.authorization ? await user(req) : null;
    res.json(commerce.catalog(u?.admin === true));
  }));
  app.get('/me', route(async (req, res) => {
    const u = await user(req); res.json({ uid: u.uid, email: u.email, organizer: true, admin: u.admin === true, credits: await commerce.balance(u.uid) });
  }));
  // Verify upload access before parsing large bodies or decoding images.
  app.use('/events/:eventId/photos', (req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/') return next();
    (async () => {
      await attestation(req); const event = await eventFor(req);
      const u = req.headers.authorization ? await user(req) : null;
      S.requireValue(S.canUpload(u, event.data, req.headers['x-event-key']), 403, 'El enlace no es válido o el evento está cerrado.');
      await throttle(req, event.id); req.uploadEvent = event; next();
    })().catch(next);
  });
  installPresentation(app, { db, bucket, route, owner, eventFor, user, attestation, throttle });
  app.use(express.json({ limit: '7mb', strict: true }));
  installAlbums(app, { db, bucket, route, owner, emulator, albums });
  app.get('/billing', route(async (req, res) => { const u = await user(req); res.json(await commerce.billing(u.uid, u.admin === true)); }));
  app.post('/orders', route(async (req, res) => { const u = await user(req); res.status(201).json(await commerce.createOrder(u.uid, req.body, u.admin === true)); }));
  app.get('/orders/:orderId', route(async (req, res) => { const u = await user(req); res.json(await commerce.ownOrder(u.uid, req.params.orderId)); }));
  app.post('/orders/:orderId/refresh', route(async (req, res) => { const u = await user(req); res.json(await commerce.refresh(u.uid, req.params.orderId)); }));
  app.post('/orders/:orderId/simulate', route(async (req, res) => { const u = await user(req); res.json(await commerce.simulate(u.uid, req.params.orderId, req.body?.status)); }));
  app.post('/payments/webhook', route(async (req, res) => res.json(await commerce.webhook(req))));
  app.get('/events', route(async (req, res) => {
    const u = await user(req);
    let q = db.collection('events'); if (u.admin !== true) q = q.where('ownerId', '==', u.uid);
    const docs = await q.orderBy('createdAt', 'desc').limit(100).get();
    res.json({ events: docs.docs.filter(d => !d.data().activatedAt || d.data().billingMode === commerce.billingMode).map(d => ({ id: d.id, ...d.data() })) });
  }));
  app.post('/events', route(async (req, res) => {
    const u = await user(req);
    const name = S.text(req.body.name, 100, true); const date = S.text(req.body.date, 10, true);
    const startTime = req.body.startTime || '00:00'; const startsAt = S.eventStart(date, startTime);
    const ref = db.collection('events').doc();
    const record = { name, date, startTime, startsAt, ownerId: u.uid, ownerEmail: u.email, status: 'draft', autoApprove: false, createdAt: new Date().toISOString(), guestKey: S.secret(), projectionKey: S.secret(), photoCount: 0 };
    await db.runTransaction(async tx => {
      const quota = db.collection('accountLimits').doc(u.uid); const snap = await tx.get(quota); const count = snap.data()?.events || 0;
      S.requireValue(count < 100, 429, 'Alcanzaste el límite de eventos. Contactá al administrador.');
      tx.set(quota, { events: count + 1 }, { merge: true }); tx.create(ref, record);
    });
    res.status(201).json({ id: ref.id, ...record });
  }));
  app.get('/events/:eventId', route(async (req, res) => { const e = await owner(req); res.json({ id: e.id, ...e.data }); }));
  app.get('/events/:eventId/activation-preview', route(async (req, res) => { const u = await user(req); res.json(await commerce.previewActivation(u.uid, req.params.eventId, u.admin === true)); }));
  app.post('/events/:eventId/activate', route(async (req, res) => { const u = await user(req); res.json(await commerce.activate(u.uid, req.params.eventId, u.admin === true, req.body?.reviewToken)); }));
  app.get('/events/:eventId/public', route(async (req, res) => {
    const e = await eventFor(req); const key = req.headers['x-event-key'];
    S.requireValue(e.data.status === 'active' && e.data.activatedAt && Date.parse(e.data.receivesUntil) > Date.now() && (S.sameSecret(key, e.data.guestKey) || S.sameSecret(key, e.data.projectionKey)), 403, 'El enlace no es válido o el evento está cerrado.');
    res.json({ id: e.id, name: e.data.name, date: e.data.date, startsAt: e.data.startsAt, receiving: S.receptionOpen(e.data), autoApprove: e.data.autoApprove === true, ...publicPresentation(e.data) });
  }));
  app.patch('/events/:eventId', route(async (req, res) => {
    const e = await owner(req);
    await db.runTransaction(async tx => {
      const snap = await tx.get(e.ref); const current = snap.data(); const updates = {};
      S.requireValue(current && S.canManage(req.user, current), 403, 'No tenés acceso a este evento.');
      if (req.body.name !== undefined || req.body.date !== undefined || req.body.startTime !== undefined) {
        S.requireValue(current.status === 'draft' || (current.activatedAt && Date.now() < Date.parse(current.startsAt) && !current.photoCount), 409, 'El evento ya comenzó. No se puede cambiar su fecha o identidad.');
        updates.name = req.body.name === undefined ? current.name : S.text(req.body.name, 100, true); updates.date = req.body.date === undefined ? current.date : S.text(req.body.date, 10, true); updates.startTime = req.body.startTime === undefined ? current.startTime : req.body.startTime; updates.startsAt = S.eventStart(updates.date, updates.startTime);
        if (current.activatedAt) { const until = Date.parse(updates.startsAt) + current.limits.receptionHours * 3600000; S.requireValue(until > Date.now(), 400, 'Esa fecha ya pasó.'); updates.receivesUntil = new Date(until).toISOString(); updates.downloadUntil = new Date(until + current.limits.downloadDays * 86400000).toISOString(); updates.cleanupCheckAt = Date.parse(updates.downloadUntil); }
      }
      if (req.body.status !== undefined) { S.requireValue(['active', 'closed'].includes(req.body.status) && current.activatedAt, 400, 'Activá el evento con tu saldo antes de abrirlo.'); if (req.body.status === 'active') S.requireValue(Date.parse(updates.receivesUntil || current.receivesUntil) > Date.now(), 409, 'El período de este evento terminó.'); updates.status = req.body.status; }
      if (req.body.rotateLinks === true) { updates.guestKey = S.secret(); updates.projectionKey = S.secret(); updates.invitationKey = S.secret(); }
      if (req.body.autoApprove !== undefined) {
        S.requireValue(typeof req.body.autoApprove === 'boolean', 400, 'Elegí revisión manual o publicación automática.');
        const now = new Date().toISOString();
        if (req.body.autoApprove) {
          S.requireValue(req.user.uid === current.ownerId, 403, 'Solo el titular del evento puede asumir esta responsabilidad.');
          S.requireValue(req.body.responsibilityAccepted === true && req.body.responsibilityVersion === moderationPolicy.version, 400, 'Para activar Publicación automática, aceptá expresamente la responsabilidad por la publicación sin revisión.');
          updates.safeModeConsent = { acceptedBy: req.user.uid, acceptedAt: now, version: moderationPolicy.version, text: moderationPolicy.responsibility };
        }
        updates.autoApprove = req.body.autoApprove;
        updates.moderationChangedAt = now; updates.moderationChangedBy = req.user.uid;
      }
      S.requireValue(Object.keys(updates).length, 400, 'No hay cambios válidos.'); tx.update(e.ref, updates);
    }); res.json({ ok: true });
  }));
  app.get('/events/:eventId/photos', route(async (req, res) => {
    const e = await viewer(req); const status = e.manager ? (req.query.status || 'pending') : 'approved';
    S.requireValue(['pending', 'approved', 'rejected'].includes(status), 400, 'Filtro inválido.');
    const version = e.data.photosVersion || 0;
    if (!e.manager && req.query.version === String(version)) return res.json({ unchanged: true, version });
    let q = db.collection('photos').where('eventId', '==', e.id).where('status', '==', status).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    if (req.query.cursor) {
      const cursor = await photoFor(e.id, req.query.cursor); S.requireValue(cursor.data.status === status, 400, 'La lista cambió. Volvé a cargarla.');
      q = q.startAfter(cursor.data.createdAt, cursor.id);
    }
    // Include legacy approved photos without publishedAt while prioritizing newly
    // published ones, even when their upload was older than the first 50 photos.
    if (!e.manager) {
      const [legacy, published] = await Promise.all([q.limit(50).get(), db.collection('photos').where('eventId', '==', e.id).where('status', '==', 'approved').orderBy('publishedAt', 'desc').orderBy('__name__', 'desc').limit(50).get()]);
      const unique = new Map([...legacy.docs, ...published.docs].map(doc => [doc.id, photoJson(doc)]));
      const photos = [...unique.values()].sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt) || b.id.localeCompare(a.id)).slice(0, 50);
      return res.json({ photos, nextCursor: null, version });
    }
    const snapshot = await q.limit(50).get();
    res.json({ photos: snapshot.docs.map(photoJson), nextCursor: snapshot.size === 50 ? snapshot.docs.at(-1).id : null });
  }));
  app.post('/events/:eventId/photos', route(async (req, res) => {
    const e = req.uploadEvent; S.requireValue(e, 403, 'No se pudo verificar el evento.');
    const photoId = S.identifier(req.body.id); const message = S.text(req.body.message || '', 200);
    const ref = db.collection('photos').doc(photoId); const fileName = `photos/${e.id}/${photoId}.jpg`;
    let encoded;
    try { encoded = await sharp(S.decodeImage(req.body.imageBase64), { limitInputPixels: 25000000, animated: false }).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true }); }
    catch (err) { if (err instanceof S.HttpError) throw err; throw new S.HttpError(400, 'No pudimos abrir esa imagen. Probá con otra foto.'); }
    const duplicate = await db.runTransaction(async tx => {
      const currentEvent = await tx.get(e.ref); const existing = await tx.get(ref); const data = currentEvent.data();
      S.requireValue(data && S.canUpload(req.user, data, req.headers['x-event-key']), 403, 'El evento está cerrado o el enlace cambió.');
      if (existing.exists) { S.requireValue(existing.data().eventId === e.id && existing.data().status !== 'processing', 409, 'Esa foto está en proceso.'); return existing.data().status; }
      S.requireValue((data.photoCount || 0) < Math.min(3000, data.limits?.photoLimit || 3000), 429, 'Este evento alcanzó su límite de fotos.');
      tx.create(ref, { eventId: e.id, fileName, message, status: 'processing', createdAt: new Date().toISOString(), width: encoded.info.width, height: encoded.info.height });
      tx.update(e.ref, { photoCount: (data.photoCount || 0) + 1 }); return false;
    });
    if (duplicate) return res.json({ id: photoId, duplicate: true, status: duplicate });
    let status;
    try {
      await bucket.file(fileName).save(encoded.data, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, no-store' } });
      status = await db.runTransaction(async tx => {
        const current = (await tx.get(e.ref)).data();
        S.requireValue(current && S.canUpload(req.user, current, req.headers['x-event-key']), 403, 'El evento está cerrado o el enlace cambió.');
        // Re-read the setting after saving: disabling automatic publication also
        // applies to uploads still in flight. A processing photo is never public.
        const automatic = current.autoApprove === true && current.safeModeConsent?.version === moderationPolicy.version && current.safeModeConsent?.acceptedBy === current.ownerId;
        const finalStatus = automatic ? 'approved' : 'pending';
        tx.update(ref, { status: finalStatus, ...(automatic ? { publishedAt: new Date().toISOString(), approvalMode: 'automatic', consentVersion: current.safeModeConsent.version } : {}) });
        if (automatic) tx.update(e.ref, { photosVersion: (current.photosVersion || 0) + 1 });
        return finalStatus;
      });
    } catch {
      await bucket.file(fileName).delete({ ignoreNotFound: true }).catch(() => {});
      await db.runTransaction(async tx => { const snap = await tx.get(e.ref); tx.delete(ref); tx.update(e.ref, { photoCount: Math.max(0, (snap.data()?.photoCount || 1) - 1) }); });
      throw new S.HttpError(503, 'No pudimos guardar la foto. Intentá otra vez.');
    }
    res.status(201).json({ id: photoId, status });
  }));
  app.patch('/events/:eventId/photos/:photoId', route(async (req, res) => {
    const e = await owner(req); const photo = await photoFor(e.id, req.params.photoId);
    S.requireValue(['approved', 'rejected'].includes(req.body.status), 400, 'Estado inválido.');
    await db.runTransaction(async tx => {
      const currentEvent = (await tx.get(e.ref)).data(); const current = (await tx.get(photo.ref)).data();
      S.requireValue(currentEvent && S.canManage(req.user, currentEvent), 403, 'No tenés acceso a este evento.');
      S.requireValue(current && current.eventId === e.id, 404, 'Foto no disponible.');
      S.requireValue(current.status !== 'processing', 409, 'La foto todavía está subiendo.');
      const now = new Date().toISOString();
      tx.update(photo.ref, { status: req.body.status, moderatedBy: req.user.uid, moderatedAt: now, ...(req.body.status === 'approved' && current.status !== 'approved' ? { publishedAt: now, approvalMode: 'manual' } : {}) });
      if (current.status !== req.body.status && (current.status === 'approved' || req.body.status === 'approved')) tx.update(e.ref, { photosVersion: (currentEvent.photosVersion || 0) + 1 });
    }); res.json({ ok: true });
  }));
  app.get('/events/:eventId/photos/:photoId/image', route(async (req, res) => {
    const e = await viewer(req); const photo = await photoFor(e.id, req.params.photoId);
    S.requireValue(photo.data.status !== 'processing' && (e.manager || photo.data.status === 'approved'), 404, 'Foto no disponible.');
    res.type('jpg').send(await bytesFor(photo.data));
  }));
  app.post('/admin/enable-client', route(async (req, res) => {
    const u = await user(req); S.requireValue(u.admin === true, 403, 'Acceso restringido.');
    const email = S.text(req.body.email, 254, true).toLowerCase(); let target;
    try { target = await auth.getUserByEmail(email); } catch { throw new S.HttpError(404, 'La persona debe registrarse primero.'); }
    S.requireValue(target.emailVerified, 409, 'La persona debe verificar su correo primero.');
    S.requireValue(target.customClaims?.admin !== true && (!ownerEmail || target.email?.toLowerCase() !== ownerEmail.toLowerCase()), 409, 'Las cuentas administradoras se gestionan por separado.');
    await auth.setCustomUserClaims(target.uid, { ...target.customClaims, organizer: true, suspended: req.body.enabled === false }); await auth.revokeRefreshTokens(target.uid);
    if (req.body.enabled === false) {
      const events = await db.collection('events').where('ownerId', '==', target.uid).get();
      for (let offset = 0; offset < events.docs.length; offset += 400) {
        const batch = db.batch(); for (const event of events.docs.slice(offset, offset + 400)) batch.update(event.ref, { status: event.data().status === 'draft' ? 'draft' : 'closed', guestKey: S.secret(), projectionKey: S.secret(), invitationKey: S.secret() }); await batch.commit();
      }
    }
    res.json({ ok: true });
  }));
  app.use((_req, res) => res.status(404).json({ error: 'Esta operación ya no está disponible. Actualizá la página.' }));
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('API operation failed', { code: err.code || 'internal' });
    res.status(status).json({ error: status === 413 ? 'La foto es demasiado grande.' : (status >= 500 && !(err instanceof S.HttpError) ? 'No pudimos completar la operación. Intentá otra vez.' : (err instanceof S.HttpError ? err.message : 'Solicitud inválida.')) });
  });
  return app;
}
module.exports = { createApp };
