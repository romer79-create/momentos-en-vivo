'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const sharp = require('sharp');
const S = require('./security');
const PART_SIZE = 50, LEASE = 10 * 60000;
const statuses = { approved: 'aprobadas', pending: 'pendientes', rejected: 'rechazadas' };
function available(event, now) { return event && event.activatedAt && !event.assetsState && Date.parse(event.downloadUntil) > now; }
function publicJob(job) {
  if (!job) return { state: 'none' };
  return { state: job.state, total: job.photos.length, done: job.done || 0, createdAt: job.createdAt, parts: (job.parts || []).map((p, i) => ({ index: i, count: p.count, bytes: p.bytes })), message: job.state === 'failed' ? 'No pudimos completar el álbum. Podés reintentar; las partes listas se conservan.' : null };
}
function createAlbums({ db, bucket, now = () => Date.now(), partSize = PART_SIZE }) {
  const jobs = db.collection('albumJobs');
  async function request(eventId) {
    const eventRef = db.collection('events').doc(S.identifier(eventId)), ref = jobs.doc(eventId);
    return db.runTransaction(async tx => {
      const [eventSnap, previous] = await Promise.all([tx.get(eventRef), tx.get(ref)]);
      const event = eventSnap.data(), prior = previous.data();
      S.requireValue(available(event, now()), 410, 'El plazo de descarga terminó o el evento no está activado.');
      if (prior && ['queued', 'processing'].includes(prior.state)) return publicJob(prior);
      if (prior?.state === 'failed') {
        const job = { ...prior, state: 'queued', attempts: 0, leaseUntil: 0, nextAttemptAt: now() };
        S.requireValue((prior.manualRetries || 0) < 3, 429, 'Contactá a soporte para recuperar este álbum.');
        tx.update(ref, { state: job.state, attempts: 0, leaseUntil: 0, nextAttemptAt: now(), manualRetries: (prior.manualRetries || 0) + 1 }); return publicJob(job);
      }
      const day = new Date(now()).toISOString().slice(0, 10), quota = event.albumDay === day ? event.albumRequests || 0 : 0;
      S.requireValue(quota < 6, 429, 'Ya preparaste varios álbumes hoy. Usá la última descarga o volvé mañana.');
      const snapshot = await tx.get(db.collection('photos').where('eventId', '==', eventId).orderBy('__name__').limit(3001));
      S.requireValue(snapshot.size <= 3000, 409, 'Este álbum necesita asistencia de soporte.');
      const photos = snapshot.docs.filter(d => statuses[d.data().status]).map(d => ({ id: d.id, status: d.data().status }));
      S.requireValue(photos.length, 400, 'Todavía no hay fotos listas para descargar.');
      const signature = createHash('sha256').update(JSON.stringify(photos)).digest('hex');
      tx.update(eventRef, { albumDay: day, albumRequests: quota + 1 });
      if (prior?.state === 'ready' && prior.signature === signature) return publicJob(prior);
      const job = { eventId, ownerId: event.ownerId, billingMode: event.billingMode, state: 'queued', generation: randomUUID(), photos, signature, parts: [], done: 0, attempts: 0, manualRetries: 0, nextAttemptAt: now(), leaseUntil: 0, createdAt: new Date(now()).toISOString() };
      tx.set(ref, job); return publicJob(job);
    });
  }
  async function run(eventId) {
    const ref = jobs.doc(S.identifier(eventId)), eventRef = db.collection('events').doc(eventId), leaseId = randomUUID();
    const job = await db.runTransaction(async tx => {
      const [snap, e] = await Promise.all([tx.get(ref), tx.get(eventRef)]); const value = snap.data();
      if (!value || !['queued', 'processing'].includes(value.state) || value.nextAttemptAt > now() || value.leaseUntil > now()) return null;
      if (!available(e.data(), now())) { tx.update(ref, { state: 'expired', leaseUntil: 0 }); return null; }
      if (value.attempts >= 5) { tx.update(ref, { state: 'failed', leaseUntil: 0 }); return null; }
      tx.update(ref, { state: 'processing', leaseId, leaseUntil: now() + LEASE, attempts: value.attempts + 1 }); return value;
    });
    if (!job) return;
    const selected = job.photos.slice(job.done, job.done + partSize), index = job.parts.length;
    const file = bucket.file(`albums/${eventId}/${job.generation}/parte-${index + 1}-${leaseId}.zip`);
    let archive, output;
    try {
      const { ZipArchive } = await import('archiver'); archive = new ZipArchive({ store: true });
      output = file.createWriteStream({ resumable: false, metadata: { contentType: 'application/zip', cacheControl: 'private, no-store' } });
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 420000);
      const completion = pipeline(archive, output, { signal: controller.signal });
      // Consume rejections immediately while the sequential producer is running.
      completion.catch(() => {});
      const manifest = [];
      try {
        for (const photo of selected) {
          const snap = await db.collection('photos').doc(S.identifier(photo.id)).get(), data = snap.data();
          S.requireValue(data?.eventId === eventId && statuses[data.status], 409, 'La foto cambió o no está disponible.');
          let bytes;
          if (data.fileName) {
            S.requireValue(data.fileName === `photos/${eventId}/${photo.id}.jpg`, 409, 'Ruta de foto inválida.');
            const source = bucket.file(data.fileName); const [meta] = await source.getMetadata();
            S.requireValue(Number(meta.size) <= 16 * 1024 * 1024, 413, 'Foto demasiado grande.');
            [bytes] = await source.download();
          } else bytes = await sharp(S.decodeImage(data.imageBase64), { limitInputPixels: 25000000 }).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          // One image in memory at a time; waiting for entry prevents buffering the entire album.
          const name = `${statuses[photo.status]}/${photo.id}.jpg`;
          await new Promise((resolve, reject) => {
            const done = () => { archive.off('error', error); resolve(); };
            const error = err => { archive.off('entry', done); reject(err); };
            archive.once('entry', done); archive.once('error', error); archive.append(bytes, { name });
            if (archive.destroyed) error(new Error('Archive stopped'));
          });
          manifest.push({ archivo: name, mensaje: data.message || '', fecha: data.createdAt || '' });
        }
        archive.append(JSON.stringify({ evento: eventId, preparado: job.createdAt, fotos: manifest }, null, 2), { name: 'recuerdos.json' });
        await archive.finalize(); await completion;
      } finally { clearTimeout(timer); if (!output.writableFinished) { archive.destroy(); output.destroy(); await completion.catch(() => {}); } }
      const [meta] = await file.getMetadata();
      await db.runTransaction(async tx => {
        const [snap, e] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
        S.requireValue(snap.data()?.leaseId === leaseId && available(e.data(), now()), 409, 'La preparación venció.');
        const done = job.done + selected.length;
        tx.update(ref, { done, parts: [...job.parts, { name: file.name, count: selected.length, bytes: Number(meta.size) }], state: done === job.photos.length ? 'ready' : 'queued', attempts: 0, leaseUntil: 0, nextAttemptAt: now() });
      });
    } catch {
      archive?.destroy(); output?.destroy();
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref); const current = snap.data(); if (current?.leaseId !== leaseId) return;
        tx.update(ref, { state: current.attempts >= 5 ? 'failed' : 'queued', leaseUntil: 0, nextAttemptAt: now() + Math.min(30, 2 ** current.attempts) * 60000 });
      });
    }
  }
  async function maintenance() {
    const due = await jobs.where('state', 'in', ['queued', 'processing']).where('nextAttemptAt', '<=', now()).orderBy('nextAttemptAt').limit(1).get();
    for (const job of due.docs) await run(job.id);
  }
  return { request, run, maintenance, status: async id => publicJob((await jobs.doc(S.identifier(id)).get()).data()) };
}
function installAlbums(app, { db, bucket, route, owner, emulator, albums }) {
  app.get('/events/:eventId/album', route(async (req, res) => { const e = await owner(req); res.json(await albums.status(e.id)); }));
  app.post('/events/:eventId/album', route(async (req, res) => { const e = await owner(req); res.status(202).json(await albums.request(e.id)); }));
  async function part(req) {
    const e = await owner(req); S.requireValue(available(e.data, Date.now()), 410, 'El plazo de descarga terminó.');
    const job = (await db.collection('albumJobs').doc(e.id).get()).data(); const n = Number(req.params.part);
    S.requireValue(/^\d+$/.test(req.params.part) && Number.isSafeInteger(n) && job?.parts[n], 404, 'Descarga no disponible.');
    const file = job.parts[n]; const prefix = `albums/${e.id}/${job.generation}/`;
    S.requireValue(file.name.startsWith(prefix) && new RegExp(`^parte-${n + 1}-[a-f0-9-]{36}\\.zip$`).test(file.name.slice(prefix.length)), 404, 'Descarga no disponible.');
    return { event: e, file: bucket.file(file.name), name: `momentos-${e.id}-parte-${n + 1}.zip` };
  }
  app.post('/events/:eventId/album/:part/download', route(async (req, res) => {
    const p = await part(req); if (emulator) return res.json({ local: true, name: p.name });
    const [url] = await p.file.getSignedUrl({ version: 'v4', action: 'read', expires: Math.min(Date.now() + 60000, Date.parse(p.event.data.downloadUntil)), responseDisposition: `attachment; filename="${p.name}"` });
    res.json({ url, name: p.name });
  }));
  if (emulator) app.get('/events/:eventId/album/:part/file', route(async (req, res) => { const p = await part(req); res.attachment(p.name); await pipeline(p.file.createReadStream(), res); }));
}
module.exports = { createAlbums, installAlbums, available, publicJob };
