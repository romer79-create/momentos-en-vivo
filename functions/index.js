'use strict';
const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { getAppCheck } = require('firebase-admin/app-check');
const { createApp } = require('./app');
const { createCommerce } = require('./commerce');
const { createAlbums } = require('./albums');
const { createNotifications } = require('./notifications');
const { createRetention } = require('./retention');
initializeApp();
const secrets = ['sandbox', 'live'].includes(process.env.PAYMENTS_MODE) ? ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'] : [];
exports.api1 = functions.runWith({ memory: '512MB', timeoutSeconds: 120, maxInstances: 10, secrets }).https.onRequest(createApp({
 db: getFirestore(), auth: getAuth(), bucket: getStorage().bucket(), appCheck: getAppCheck(),
 emulator: process.env.FUNCTIONS_EMULATOR === 'true', siteKey: process.env.APP_CHECK_SITE_KEY || '', ownerEmail: process.env.OWNER_EMAIL || ''
}));
exports.billingMaintenance = functions.runWith({ timeoutSeconds: 540, maxInstances: 1, secrets }).pubsub.schedule('every 15 minutes').timeZone('America/Argentina/Buenos_Aires').onRun(() => createCommerce({ db: getFirestore(), emulator: process.env.FUNCTIONS_EMULATOR === 'true' }).maintenance());
const albums = () => createAlbums({ db: getFirestore(), bucket: getStorage().bucket() });
const notifications = () => createNotifications({ db: getFirestore(), auth: getAuth(), emulator: process.env.FUNCTIONS_EMULATOR === 'true' });
const mailSecrets = process.env.MAIL_MODE === 'smtp' ? ['SMTP_PASSWORD'] : [];
exports.albumWorker = functions.runWith({ memory: '512MB', timeoutSeconds: 540, maxInstances: 2 }).firestore.document('albumJobs/{eventId}').onWrite(change => change.after.data()?.state === 'queued' ? albums().run(change.after.id) : null);
exports.albumMaintenance = functions.runWith({ memory: '512MB', timeoutSeconds: 540, maxInstances: 1 }).pubsub.schedule('every 5 minutes').onRun(() => albums().maintenance());
exports.eventNotifications = functions.runWith({ timeoutSeconds: 60, maxInstances: 2, failurePolicy: true }).firestore.document('events/{eventId}').onWrite(change => {
  const e = change.after.data(), before = change.before.data();
  return e?.activatedAt && (!before?.activatedAt || e.startsAt !== before.startsAt || e.downloadUntil !== before.downloadUntil) ? notifications().scheduleEvent(change.after.id) : null;
});
exports.mailWorker = functions.runWith({ timeoutSeconds: 120, maxInstances: 2, secrets: mailSecrets }).firestore.document('mailOutbox/{messageId}').onCreate(snap => notifications().run(snap.id));
exports.mailMaintenance = functions.runWith({ timeoutSeconds: 540, maxInstances: 1, secrets: mailSecrets }).pubsub.schedule('every 5 minutes').onRun(() => notifications().maintenance());
exports.retentionMaintenance = functions.runWith({ timeoutSeconds: 540, maxInstances: 1 }).pubsub.schedule('every 15 minutes').onRun(() => createRetention({ db: getFirestore(), bucket: getStorage().bucket() }).maintenance());
