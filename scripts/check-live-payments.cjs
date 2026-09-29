'use strict';
// Read-only: inspect enabled versions and confirm the live seller without printing profiles or keys.
require('./secret-log-redaction.cjs');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const manager = require('firebase-tools/lib/gcp/secretManager');
const { verifyLiveAccount } = require('./configure-live-payments.cjs');
const { normalizeWebhookSecret } = require('./configure-webhook.cjs');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';

async function checkLivePayments() {
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw Object.assign(new Error(), { code: 'OWNER_SESSION_MISSING' });
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  const versions = [];
  let seller;
  for (const name of ['MERCADO_PAGO_LIVE_ACCESS_TOKEN', 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET']) {
    const meta = await manager.getSecretVersion(PROJECT, name, 'latest');
    if (meta.state !== 'ENABLED') throw Object.assign(new Error(), { code: 'SECRET_NOT_ENABLED' });
    let value = await manager.accessSecretVersion(PROJECT, name, meta.versionId);
    try {
      if (name === 'MERCADO_PAGO_LIVE_ACCESS_TOKEN') seller = await verifyLiveAccount(value);
      else normalizeWebhookSecret(value);
    } finally { value = ''; }
    versions.push({ secret: name, state: meta.state, version: meta.versionId });
  }
  const result = { status: 'LIVE_CREDENTIALS_VERIFIED', ...seller, versions, readOnly: true, webhookDeliveryVerified: false };
  console.log(JSON.stringify(result)); return result;
}
if (require.main === module) checkLivePayments().catch(error => {
  const code = /^[A-Z_0-9-]{1,48}$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED';
  console.error(JSON.stringify({ status: 'failed', code, httpStatus: Number(error.status) || undefined }));
  process.exitCode = 1;
});
module.exports = { checkLivePayments };
