'use strict';
const { createHash, randomUUID } = require('node:crypto');
const S = require('./security');
const DAY = 86400000, POLICY = 'retencion-avisada-v1';
const stamp = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
const messageId = (kind, id, version = '') => `${kind}_${id}_${stamp(version)}`;
function enqueue(tx, db, kind, id, ownerId, version = '', availableAt = Date.now()) {
  const ref = db.collection('mailOutbox').doc(messageId(kind, id, version));
  tx.create(ref, { kind, entityId: id, ownerId, version, state: 'queued', availableAt, leaseUntil: 0, attempts: 0, createdAt: new Date().toISOString() });
}
function formatDate(value) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)) + ' (Argentina)'; }
function compose(kind, data) {
  const footer = '\n\nEntrá a tu cuenta: https://momentos-en-vivo.web.app/cliente-panel.html\n\nMomentos en Vivo · Un proyecto de Sylar.soluciones\nAyuda: sylar.soluciones@gmail.com · +54 9 376 410-4660';
  const templates = {
    purchase: () => ['Tu compra fue acreditada', `Ya tenés ${data.credits} ${data.credits === 1 ? 'evento disponible' : 'eventos disponibles'} de tu compra ${data.planTitle}. Podés preparar y activar tus eventos desde tu cuenta.${data.creditsExpireAt ? ` El saldo sin usar vence el ${formatDate(data.creditsExpireAt)}.` : ''} Este mensaje confirma la acreditación del saldo.`],
    activation: () => ['Tu evento está activado', `${data.name}\nInicio: ${formatDate(data.startsAt)}\nRecepción de fotos hasta: ${formatDate(data.receivesUntil)}\nDescargas hasta: ${formatDate(data.downloadUntil)}\nPublicá tu invitación y descargá el QR desde tu panel.`],
    reminder: () => ['Tu evento está por empezar', `${data.name}\nComienza el ${formatDate(data.startsAt)}. Probá internet, el QR y la pantalla antes de recibir a tus invitados. La recepción se habilita en el horario programado.`],
    expiry: () => ['Descargá los recuerdos de tu evento', `${data.name}\nEl plazo de descarga termina el ${formatDate(data.downloadUntil)}. Prepará tu álbum completo desde Administrar fotos. ${data.limits?.retentionPolicy === POLICY ? 'Después de ese plazo, las fotos, imágenes, música y respuestas de invitados se eliminarán automáticamente.' : 'Guardá tus fotos antes de esa fecha.'}`]
  };
  S.requireValue(templates[kind], 400, 'Tipo de aviso inválido.'); const [subject, text] = templates[kind](); return { subject, text: text + footer };
}
function createNotifications({ db, auth, emulator = false, env = process.env, now = () => Date.now(), deliver }) {
  const mode = emulator ? 'preview' : env.MAIL_MODE === 'smtp' ? 'smtp' : 'disabled';
  let transport;
  async function send(to, message, id) {
    if (deliver) return deliver(to, message, id);
    if (!transport) {
      S.requireValue(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.MAIL_FROM || ''), 503, 'Correo sin configurar.');
      const port = Number(env.SMTP_PORT || 465); S.requireValue([465, 587].includes(port), 503, 'Puerto de correo inválido.');
      transport = require('nodemailer').createTransport({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port === 587, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true });
    }
    return transport.sendMail({ from: { name: 'Momentos en Vivo', address: env.MAIL_FROM }, replyTo: 'sylar.soluciones@gmail.com', to, ...message, messageId: `<${id}@momentos-en-vivo.web.app>`, disableFileAccess: true, disableUrlAccess: true });
  }
  async function scheduleEvent(id) {
    const ref = db.collection('events').doc(S.identifier(id));
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const e = snap.data();
      if (!e?.activatedAt || e.automationVersion !== 'self-service-v1' || e.assetsState) return;
      const messages = [{ kind: 'activation', version: e.activatedAt, at: now() }];
      if (Date.parse(e.startsAt) - Date.parse(e.activatedAt) >= DAY && Date.parse(e.startsAt) > now()) messages.push({ kind: 'reminder', version: e.startsAt, at: Math.max(now(), Date.parse(e.startsAt) - DAY) });
      // One extra day absorbs scheduler delays while preserving a 72-hour notice.
      if (Date.parse(e.downloadUntil) > now()) messages.push({ kind: 'expiry', version: e.downloadUntil, at: Math.max(now(), Date.parse(e.downloadUntil) - 4 * DAY) });
      const existing = await Promise.all(messages.map(m => tx.get(db.collection('mailOutbox').doc(messageId(m.kind, id, m.version)))));
      messages.forEach((m, i) => { if (!existing[i].exists) enqueue(tx, db, m.kind, id, e.ownerId, m.version, m.at); });
    });
  }
  async function run(id) {
    if (mode === 'disabled' && !deliver) return;
    const ref = db.collection('mailOutbox').doc(S.identifier(id)), leaseId = randomUUID();
    const job = await db.runTransaction(async tx => {
      const snap = await tx.get(ref), value = snap.data();
      if (!value || !['queued', 'sending'].includes(value.state) || value.availableAt > now() || value.leaseUntil > now()) return null;
      if (value.attempts >= 5) { tx.update(ref, { state: 'failed' }); return null; }
      tx.update(ref, { state: 'sending', leaseId, leaseUntil: now() + 5 * 60000, attempts: value.attempts + 1 }); return value;
    });
    if (!job) return;
    async function finish(patch) { await db.runTransaction(async tx => { const current = await tx.get(ref); if (current.data()?.leaseId === leaseId) tx.update(ref, { ...patch, leaseUntil: 0 }); }); }
    try {
      const data = (await db.collection(job.kind === 'purchase' ? 'orders' : 'events').doc(S.identifier(job.entityId)).get()).data();
      const valid = data && data.ownerId === job.ownerId && (job.kind === 'purchase' ? data.status === 'approved' : !data.assetsState && data.activatedAt && (job.kind !== 'reminder' || data.startsAt === job.version && Date.parse(data.startsAt) > now()) && (job.kind !== 'expiry' || data.downloadUntil === job.version && Date.parse(data.downloadUntil) > now()));
      if (!valid) return finish({ state: 'cancelled' });
      const message = compose(job.kind, data);
      if (mode === 'preview' && !deliver) return finish({ state: 'preview', preview: message });
      const recipient = await auth.getUser(job.ownerId);
      S.requireValue(recipient.emailVerified && recipient.email && !recipient.disabled && !recipient.customClaims?.suspended, 409, 'Destinatario no disponible.');
      const result = await send(recipient.email, message, id);
      S.requireValue(result?.accepted?.length > 0, 503, 'El proveedor no aceptó el mensaje.');
      await finish({ state: 'sent', sentAt: now() });
    } catch {
      await finish({ state: job.attempts + 1 >= 5 ? 'failed' : 'queued', availableAt: now() + Math.min(60, 2 ** (job.attempts + 1)) * 60000, error: 'delivery_failed' });
    }
  }
  async function maintenance() {
    if (mode === 'disabled' && !deliver) return;
    const due = await db.collection('mailOutbox').where('state', 'in', ['queued', 'sending']).where('availableAt', '<=', now()).orderBy('availableAt').limit(10).get();
    for (const job of due.docs) await run(job.id);
  }
  return { scheduleEvent, run, maintenance, mode };
}
module.exports = { createNotifications, enqueue, messageId, compose, POLICY };
