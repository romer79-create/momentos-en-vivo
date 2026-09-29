'use strict';
// Read-only check: the stored token stays in memory and is never printed.
require('./secret-log-redaction.cjs');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const manager = require('firebase-tools/lib/gcp/secretManager');
const { verifyTestAccount } = require('./configure-payments.cjs');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';

async function checkPayments() {
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw Object.assign(new Error(), { code: 'OWNER_SESSION_MISSING' });
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  const meta = await manager.getSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', 'latest');
  if (meta.state !== 'ENABLED') throw Object.assign(new Error(), { code: 'SECRET_NOT_ENABLED' });
  let token = await manager.accessSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', meta.versionId);
  let result;
  try { result = await verifyTestAccount(token); }
  finally { token = ''; }
  console.log(JSON.stringify({ secret: 'MERCADO_PAGO_ACCESS_TOKEN', state: meta.state, version: meta.versionId, ...result }));
  return result;
}

if (require.main === module) checkPayments().catch(error => {
  const code = /^[A-Z_0-9-]{1,48}$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED';
  console.error(JSON.stringify({ status: 'failed', code, httpStatus: Number(error.status) || undefined }));
  process.exitCode = 1;
});
module.exports = { checkPayments };
