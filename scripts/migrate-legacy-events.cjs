'use strict';
// One-time, explicitly authorized cleanup of legacy events. Default: count only.
require('./secret-log-redaction.cjs');
const path = require('node:path');
const r = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { Firestore } = r('@google-cloud/firestore');
const { Storage } = r('@google-cloud/storage');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const firebaseApi = require('firebase-tools/lib/api');
const { resetEvents } = require('./reset-events.cjs');
const PROJECT = 'momentos-en-vivo', BUCKET = 'momentos-en-vivo.firebasestorage.app';
let stage = 'authentication';
async function migrate({ apply = false } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('EMULATOR_CONFIG_PRESENT');
  const account = firebaseAuth.findAccountByEmail('sylar.soluciones@gmail.com');
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: 'sylar.soluciones@gmail.com', nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  // Reuse only this owner's existing OAuth session in memory. No ADC changes,
  // service-account keys, environment secrets or credential files are created.
  const credentials = { type: 'authorized_user', client_id: firebaseApi.clientId(), client_secret: firebaseApi.clientSecret(), refresh_token: account.tokens.refresh_token };
  const db = new Firestore({ projectId: PROJECT, credentials, preferRest: true });
  try {
    stage = 'initialize_clients';
    const bucket = new Storage({ projectId: PROJECT, credentials }).bucket(BUCKET);
    if (bucket.name !== BUCKET) throw new Error('WRONG_BUCKET');
    stage = 'check_event_schema';
    const events = await db.collection('events').select('ownerId', 'automationVersion', 'activatedAt').get();
    if (events.docs.some(d => d.data().ownerId || d.data().automationVersion || d.data().activatedAt)) throw new Error('MODERN_EVENTS_PRESENT');
    if (apply) {
      stage = 'check_maintenance';
      const response = await fetch(`https://us-central1-${PROJECT}.cloudfunctions.net/api1/api/health`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      const health = await response.json();
      if (!response.ok || health.version !== 3 || health.ok !== true) throw new Error('NEW_API_NOT_READY');
      const page = await fetch(`https://${PROJECT}.web.app/`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!page.ok || !(await page.text()).includes('Estamos preparando algo especial.')) throw new Error('MAINTENANCE_NOT_ACTIVE');
    }
    stage = apply ? 'reset_legacy_events' : 'count_legacy_events';
    console.log(JSON.stringify(await resetEvents({ db, bucket, apply })));
  } finally { await db.terminate(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--apply' || args[1] !== '--confirm-project=momentos-en-vivo')) {
    console.error('Uso: node scripts/migrate-legacy-events.cjs [--apply --confirm-project=momentos-en-vivo]'); process.exitCode = 1;
  } else migrate({ apply: args.length > 0 }).catch(error => {
    const message = /^[A-Z_]{1,48}$/.test(error.message || '') ? error.message : 'MIGRATION_FAILED';
    const detail = /^[a-zA-Z_0-9\/-]{1,64}$/.test(String(error.code || '')) ? error.code : undefined;
    console.error(JSON.stringify({ status: 'failed', stage, code: message, detail, httpStatus: Number(error.status) || undefined })); process.exitCode = 1;
  });
}
module.exports = { migrate };
