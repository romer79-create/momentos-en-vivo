'use strict';
const S = require('./security');
const { POLICY, messageId } = require('./notifications');
const DAY = 86400000;
function eligible(event, warning, now) {
  return event?.purgePending === true && event.limits?.retentionPolicy === POLICY && Date.parse(event.downloadUntil) <= now && warning?.state === 'sent' && warning.version === event.downloadUntil && Number.isFinite(warning.sentAt) && warning.sentAt <= Date.parse(event.downloadUntil) - 3 * DAY;
}
function createRetention({ db, bucket, env = process.env, now = () => Date.now() }) {
  async function processEvent(id) {
    if (env.RETENTION_CLEANUP !== 'enabled') return { disabled: true };
    const ref = db.collection('events').doc(S.identifier(id));
    const event = await db.runTransaction(async tx => {
      const snap = await tx.get(ref), e = snap.data(); if (!e?.purgePending || e.limits?.retentionPolicy !== POLICY || Date.parse(e.downloadUntil) > now()) return null;
      if (e.assetsState === 'deleting') return e;
      const warning = await tx.get(db.collection('mailOutbox').doc(messageId('expiry', id, e.downloadUntil)));
      if (!eligible(e, warning.data(), now())) {
        tx.set(db.collection('serviceIncidents').doc(`retention_${id}`), { eventId: id, reason: 'expiry_notice_missing_or_late', resolved: false }, { merge: true }); return null;
      }
      const changes = { assetsState: 'deleting', status: 'closed', purgeAfter: now() + 15 * 60000, purgeStage: 0, purgeFailures: 0, guestKey: S.secret(), projectionKey: S.secret(), invitationKey: S.secret() };
      tx.update(ref, changes); return { ...e, ...changes };
    });
    if (!event || event.purgeAfter > now() || event.purgeFailures >= 20) return { waiting: true };
    try {
      // Each invocation removes one bounded batch. The stage persists after failure.
      const stage = event.purgeStage || 0;
      if (stage < 3) {
        const prefix = `${['photos', 'themes', 'albums'][stage]}/${id}/`;
        const [files] = await bucket.getFiles({ prefix, maxResults: 100, autoPaginate: false });
        if (files.length) { for (const file of files) { S.requireValue(file.name.startsWith(prefix), 409, 'Ruta inválida.'); await file.delete({ ignoreNotFound: true }); } return { more: true }; }
      } else if (stage < 5) {
        const query = stage === 3 ? db.collection('photos').where('eventId', '==', id) : ref.collection('rsvps');
        const docs = await query.limit(200).get();
        if (!docs.empty) { const batch = db.batch(); docs.forEach(d => batch.delete(d.ref)); await batch.commit(); return { more: true }; }
      } else {
        const batch = db.batch(); batch.delete(db.collection('albumJobs').doc(id));
        batch.update(ref, { assetsState: 'deleted', purgePending: false, purgedAt: new Date(now()).toISOString(), photoCount: 0, rsvpCount: 0, rsvpSeats: 0, themeAssets: {}, themeMusic: null, presentation: null });
        await batch.commit(); return { deleted: true };
      }
      // Multiple scheduler deliveries may repeat deletions safely; only advance the observed stage.
      await db.runTransaction(async tx => { const snap = await tx.get(ref); if (snap.data()?.purgeStage === stage) tx.update(ref, { purgeStage: stage + 1 }); });
      return { more: true };
    } catch {
      await db.runTransaction(async tx => {
        const e = (await tx.get(ref)).data(); if (!e?.purgePending) return;
        tx.update(ref, { purgeFailures: (e.purgeFailures || 0) + 1 });
        tx.set(db.collection('serviceIncidents').doc(`retention_${id}`), { eventId: id, reason: 'cleanup_failed', resolved: false }, { merge: true });
      }); return { retry: true };
    }
  }
  async function maintenance() {
    if (env.RETENTION_CLEANUP !== 'enabled') return;
    const due = await db.collection('events').where('purgePending', '==', true).where('cleanupCheckAt', '<=', now()).orderBy('cleanupCheckAt').limit(5).get();
    for (const e of due.docs) { const result = await processEvent(e.id); if (!result?.deleted) await e.ref.update({ cleanupCheckAt: now() + (result?.waiting || result?.retry ? DAY : 15 * 60000) }); }
  }
  return { processEvent, maintenance };
}
module.exports = { createRetention, eligible };
