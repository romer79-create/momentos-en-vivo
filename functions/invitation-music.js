'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const S = require('./security');
const MAX_BYTES = 44 + 32000 * 2 * 60;

// Only our canonical PCM container is accepted. No codecs, tags, attachments,
// URLs or executable content are retained from the original uploaded file.
function validateMusic(base64) {
  S.requireValue(typeof base64 === 'string' && base64.length <= Math.ceil(MAX_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64), 400, 'Audio inválido o demasiado grande.');
  const b = Buffer.from(base64, 'base64');
  S.requireValue(b.length >= 128044 && b.length <= MAX_BYTES && b.length % 2 === 0, 400, 'La música debe durar entre 2 y 60 segundos.');
  const valid = b.toString('ascii', 0, 4) === 'RIFF' && b.readUInt32LE(4) === b.length - 8 && b.toString('ascii', 8, 16) === 'WAVEfmt ' && b.readUInt32LE(16) === 16 && b.readUInt16LE(20) === 1 && b.readUInt16LE(22) === 1 && b.readUInt32LE(24) === 32000 && b.readUInt32LE(28) === 64000 && b.readUInt16LE(32) === 2 && b.readUInt16LE(34) === 16 && b.toString('ascii', 36, 40) === 'data' && b.readUInt32LE(40) === b.length - 44;
  S.requireValue(valid, 400, 'No pudimos validar la música. Volvé a prepararla desde el editor.');
  return b;
}
function installMusic(app, { db, bucket, route, owner, eventFor, user, throttle, invitationOpen }) {
  app.post('/events/:eventId/theme-music', (req, _res, next) => {
    (async () => { req.musicEvent = await owner(req); await throttle(req, `music:${req.musicEvent.id}`); next(); })().catch(next);
  }, express.json({ limit: '6mb' }), route(async (req, res) => {
    const e = req.musicEvent; const bytes = validateMusic(req.body.audioBase64);
    const track = { id: randomUUID(), name: S.text(req.body.name, 80, true), duration: (bytes.length - 44) / 64000 };
    const file = bucket.file(`themes/${e.id}/music/${track.id}.wav`); let committed = false, previous;
    await file.save(bytes, { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'private, no-store' } });
    try {
      await db.runTransaction(async tx => {
        const current = (await tx.get(e.ref)).data();
        S.requireValue(current && S.canManage(req.user, current), 403, 'No tenés acceso a este evento.');
        S.requireValue(req.body.version === (current.themeVersion || 0), 409, 'El diseño cambió en otra ventana. Recargá antes de guardar.');
        S.requireValue((current.musicUploadCount || 0) < 100, 429, 'Alcanzaste el límite de cambios de música de este evento.');
        previous = current.themeMusic;
        tx.update(e.ref, { themeMusic: track, themeVersion: (current.themeVersion || 0) + 1, musicUploadCount: (current.musicUploadCount || 0) + 1 });
      }); committed = true;
    } finally { if (!committed) await file.delete({ ignoreNotFound: true }).catch(() => {}); }
    if (previous) await bucket.file(`themes/${e.id}/music/${previous.id}.wav`).delete({ ignoreNotFound: true }).catch(() => {});
    res.status(201).json({ track, version: req.body.version + 1 });
  }));
  app.get('/events/:eventId/theme-music', route(async (req, res) => {
    const e = await eventFor(req); const u = req.headers.authorization ? await user(req) : null;
    S.requireValue(S.canManage(u, e.data) || invitationOpen(e.data, req.headers['x-event-key']), 403, 'Música no disponible.');
    S.requireValue(e.data.themeMusic, 404, 'Todavía no hay música propia en este evento.');
    const [bytes] = await bucket.file(`themes/${e.id}/music/${e.data.themeMusic.id}.wav`).download();
    res.type('audio/wav').set('X-Content-Type-Options', 'nosniff').send(bytes);
  }));
}
module.exports = { installMusic, validateMusic };
