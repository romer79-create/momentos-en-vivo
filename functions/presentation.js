'use strict';
const express = require('express');
const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const S = require('./security');
const themes = require('./themes.json');
const { installMusic } = require('./invitation-music');
const slots = ['background', 'cover', 'logo'];

function normalize(input = {}) {
  S.requireValue(input && typeof input === 'object' && !Array.isArray(input), 400, 'Diseño inválido.');
  const themeId = input.themeId || 'champagne';
  S.requireValue(Object.hasOwn(themes, themeId), 400, 'Elegí un tema disponible.');
  const preset = themes[themeId];
  const result = { themeId };
  S.requireValue(input.musicSource === undefined || ['instrumental', 'custom'].includes(input.musicSource), 400, 'Origen de música inválido.');
  result.musicSource = input.musicSource || 'instrumental';
  for (const [key, max] of Object.entries({ eyebrow: 60, subtitle: 100, message: 300, venue: 100, address: 180 })) result[key] = S.text(input[key] ?? preset[key] ?? '', max);
  for (const key of ['published', 'rsvpEnabled', 'motion', 'opening', 'countdown', 'musicEnabled']) {
    S.requireValue(input[key] === undefined || typeof input[key] === 'boolean', 400, 'Opción inválida.');
    result[key] = input[key] ?? !['published', 'musicEnabled'].includes(key);
  }
  result.custom = {};
  if (input.custom !== undefined) {
    S.requireValue(input.custom && typeof input.custom === 'object' && !Array.isArray(input.custom), 400, 'Personalización inválida.');
    for (const key of Object.keys(input.custom)) S.requireValue(['background', 'text', 'accent', 'font'].includes(key), 400, 'Personalización no admitida.');
    for (const key of ['background', 'text', 'accent']) if (input.custom[key] !== undefined) {
      S.requireValue(typeof input.custom[key] === 'string' && /^#[0-9a-f]{6}$/i.test(input.custom[key]), 400, 'Usá colores válidos.');
      result.custom[key] = input.custom[key].toLowerCase();
    }
    if (input.custom.font !== undefined) {
      S.requireValue(['editorial', 'modern', 'bold'].includes(input.custom.font), 400, 'Tipografía no disponible.');
      result.custom.font = input.custom.font;
    }
  }
  return result;
}
function publicPresentation(event) {
  return { presentation: normalize(event.presentation), themeMusic: event.themeMusic ? { id: event.themeMusic.id, name: event.themeMusic.name, duration: event.themeMusic.duration } : null, themeAssets: Object.fromEntries(slots.filter(slot => event.themeAssets?.[slot]).map(slot => [slot, { id: event.themeAssets[slot].id }])) };
}
function invitationOpen(event, key) {
  return event.status === 'active' && event.activatedAt && Date.parse(event.receivesUntil) > Date.now() && event.presentation?.published === true && S.sameSecret(key, event.invitationKey);
}

function installPresentation(app, { db, bucket, route, owner, eventFor, user, attestation, throttle }) {
  installMusic(app, { db, bucket, route, owner, eventFor, user, throttle, invitationOpen });
  const invited = async req => {
    const e = await eventFor(req);
    S.requireValue(invitationOpen(e.data, req.headers['x-event-key']), 403, 'La invitación no está disponible. Pedí al organizador el enlace actualizado.');
    return e;
  };
  // These routes are installed before the general JSON parser. Access is checked
  // before reading large image bodies, and invitation responses have a tiny limit.
  app.use('/events/:eventId/theme-assets/:slot', (req, _res, next) => {
    if (req.method !== 'POST') return next();
    (async () => { req.designEvent = await owner(req); await throttle(req, `design:${req.designEvent.id}`); next(); })().catch(next);
  });
  app.post('/events/:eventId/theme-assets/:slot', express.json({ limit: '7mb' }), route(async (req, res) => {
    const e = req.designEvent; const slot = req.params.slot;
    S.requireValue(slots.includes(slot), 400, 'Tipo de imagen inválido.');
    S.requireValue((e.data.themeUploadCount || 0) < 200, 429, 'Alcanzaste el límite de cambios de imágenes de este evento.');
    const bytes = S.decodeImage(req.body.imageBase64);
    let output;
    try {
      const image = sharp(bytes, { limitInputPixels: 25000000 }); const meta = await image.metadata();
      S.requireValue(['jpeg', 'png', 'webp'].includes(meta.format) && (meta.pages || 1) === 1, 400, 'Usá una imagen JPEG, PNG o WebP estática.');
      output = await image.rotate().resize(slot === 'logo' ? 600 : 1920, slot === 'logo' ? 600 : 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    } catch (err) { if (err instanceof S.HttpError) throw err; throw new S.HttpError(400, 'No pudimos abrir esa imagen. Usá JPEG, PNG o WebP de hasta 25 megapíxeles.'); }
    const id = randomUUID(); const file = bucket.file(`themes/${e.id}/${slot}/${id}.webp`); let previous;
    await file.save(output, { resumable: false, metadata: { contentType: 'image/webp', cacheControl: 'private, no-store' } });
    let committed = false;
    try {
      await db.runTransaction(async tx => {
        const current = (await tx.get(e.ref)).data();
        S.requireValue(current && S.canManage(req.user, current), 403, 'No tenés acceso a este evento.');
        S.requireValue(req.body.version === (current.themeVersion || 0), 409, 'El diseño cambió en otra ventana. Recargá antes de guardar.');
        S.requireValue((current.themeUploadCount || 0) < 200, 429, 'Alcanzaste el límite de cambios de imágenes de este evento.');
        previous = current.themeAssets?.[slot];
        tx.update(e.ref, { themeAssets: { ...current.themeAssets, [slot]: { id } }, themeVersion: (current.themeVersion || 0) + 1, themeUploadCount: (current.themeUploadCount || 0) + 1 });
      }); committed = true;
    } finally { if (!committed) await file.delete({ ignoreNotFound: true }).catch(() => {}); }
    if (previous) await bucket.file(`themes/${e.id}/${slot}/${previous.id}.webp`).delete({ ignoreNotFound: true }).catch(() => {});
    res.status(201).json({ id, version: req.body.version + 1 });
  }));
  app.post('/events/:eventId/invitation/rsvp', (req, _res, next) => {
    (async () => { await attestation(req); req.invitedEvent = await invited(req); await throttle(req, `rsvp:${req.invitedEvent.id}`); next(); })().catch(next);
  }, express.json({ limit: '4kb' }), route(async (req, res) => {
    const e = req.invitedEvent; const id = req.body.id;
    S.requireValue(typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id), 400, 'Respuesta inválida.');
    const name = S.text(req.body.name, 80, true);
    S.requireValue(typeof req.body.attending === 'boolean' && Number.isInteger(req.body.seats) && req.body.seats >= 1 && req.body.seats <= 10, 400, 'Revisá la cantidad de personas.');
    const attending = req.body.attending; const seats = attending ? req.body.seats : 0; const ref = e.ref.collection('rsvps').doc(id);
    await db.runTransaction(async tx => {
      const [eventSnap, responseSnap] = await Promise.all([tx.get(e.ref), tx.get(ref)]); const current = eventSnap.data();
      S.requireValue(current && invitationOpen(current, req.headers['x-event-key']) && current.presentation.rsvpEnabled && Date.parse(current.startsAt) > Date.now(), 403, 'La confirmación de asistencia está cerrada.');
      const previous = responseSnap.data(); const count = current.rsvpCount || 0;
      S.requireValue(previous || count < 2000, 429, 'La lista de respuestas está completa. Contactá al organizador.');
      tx.set(ref, { name, attending, seats, updatedAt: new Date().toISOString() });
      tx.update(e.ref, { rsvpCount: count + (previous ? 0 : 1), rsvpSeats: (current.rsvpSeats || 0) - (previous?.seats || 0) + seats });
    });
    res.json({ ok: true });
  }));
  app.get('/events/:eventId/invitation', route(async (req, res) => {
    const e = await invited(req);
    res.json({ id: e.id, name: e.data.name, date: e.data.date, startsAt: e.data.startsAt, ...publicPresentation(e.data), rsvpOpen: e.data.presentation.rsvpEnabled && Date.parse(e.data.startsAt) > Date.now(), receiving: S.receptionOpen(e.data), guestKey: S.receptionOpen(e.data) ? e.data.guestKey : null });
  }));
  app.get('/events/:eventId/theme-assets/:slot', route(async (req, res) => {
    const e = await eventFor(req); const u = req.headers.authorization ? await user(req) : null; const key = req.headers['x-event-key'];
    const active = e.data.status === 'active' && e.data.activatedAt && Date.parse(e.data.receivesUntil) > Date.now();
    S.requireValue(S.canManage(u, e.data) || invitationOpen(e.data, key) || (active && (S.sameSecret(key, e.data.guestKey) || S.sameSecret(key, e.data.projectionKey))), 403, 'Imagen no disponible.');
    const slot = req.params.slot; const asset = slots.includes(slot) && e.data.themeAssets?.[slot];
    S.requireValue(asset, 404, 'Imagen no disponible.');
    const [bytes] = await bucket.file(`themes/${e.id}/${slot}/${asset.id}.webp`).download(); res.type('webp').send(bytes);
  }));
  // Small owner writes use their own parser so all presentation routes can be
  // registered together before the existing 7 MB photo parser.
  app.put('/events/:eventId/presentation', express.json({ limit: '12kb' }), route(async (req, res) => {
    const e = await owner(req); const presentation = normalize(req.body.presentation);
    let result, previousAssets, previousMusic;
    S.requireValue(req.body.removeMusic === undefined || typeof req.body.removeMusic === 'boolean', 400, 'Opción de música inválida.');
    await db.runTransaction(async tx => {
      const current = (await tx.get(e.ref)).data();
      S.requireValue(current && S.canManage(req.user, current), 403, 'No tenés acceso a este evento.');
      S.requireValue(req.body.version === (current.themeVersion || 0), 409, 'El diseño cambió en otra ventana. Recargá antes de guardar.');
      S.requireValue(!presentation.published || (current.status === 'active' && current.activatedAt && Date.parse(current.receivesUntil) > Date.now()), 409, 'Activá el evento antes de publicar la invitación.');
      const remove = req.body.removeAssets || [];
      S.requireValue(Array.isArray(remove) && remove.every(slot => slots.includes(slot)), 400, 'Imágenes inválidas.');
      const assets = { ...current.themeAssets }; for (const slot of remove) delete assets[slot];
      previousAssets = current.themeAssets;
      previousMusic = current.themeMusic;
      const themeMusic = req.body.removeMusic ? null : current.themeMusic || null;
      S.requireValue(presentation.musicSource !== 'custom' || themeMusic, 400, 'Subí tu música antes de seleccionarla.');
      result = { presentation, themeAssets: assets, themeMusic, themeVersion: (current.themeVersion || 0) + 1, invitationKey: current.invitationKey || S.secret() };
      tx.update(e.ref, result);
    });
    for (const slot of req.body.removeAssets || []) if (previousAssets?.[slot]) await bucket.file(`themes/${e.id}/${slot}/${previousAssets[slot].id}.webp`).delete({ ignoreNotFound: true }).catch(() => {});
    if (req.body.removeMusic && previousMusic) await bucket.file(`themes/${e.id}/music/${previousMusic.id}.wav`).delete({ ignoreNotFound: true }).catch(() => {});
    res.json(result);
  }));
  app.get('/events/:eventId/rsvps', route(async (req, res) => {
    const e = await owner(req); const docs = await e.ref.collection('rsvps').orderBy('updatedAt', 'desc').limit(2000).get();
    res.json({ responses: docs.docs.map(doc => doc.data()), seats: e.data.rsvpSeats || 0 });
  }));
}
module.exports = { installPresentation, publicPresentation, normalize, invitationOpen };
