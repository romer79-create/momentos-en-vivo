'use strict';
require('./secret-log-redaction.cjs');
const assert = require('node:assert/strict');
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';
async function checkPaymentDeployment({ checkoutEnabled = false } = {}) {
  const account = auth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  auth.setActiveAccount(options, account); await requireAuth(options);
  const client = new Client({ urlPrefix: 'https://cloudfunctions.googleapis.com', apiVersion: 'v1', auth: true });
  const functions = await Promise.all(['api1', 'billingMaintenance'].map(async name => {
    const { body } = await client.get(`projects/${PROJECT}/locations/us-central1/functions/${name}`);
    assert.equal(body.status, 'ACTIVE'); assert.equal(body.runtime, 'nodejs22');
    const env = body.environmentVariables || {};
    assert.equal(env.PAYMENTS_MODE, 'live'); assert.equal(env.PAYMENTS_CHECKOUT_ENABLED, String(checkoutEnabled));
    assert.equal(env.PAYMENTS_SANDBOX_ADMIN, 'false'); assert.equal(env.MERCADO_PAGO_LIVE_COLLECTOR_ID, '78132866');
    const secrets = (body.secretEnvironmentVariables || []).map(entry => ({ name: entry.key, version: entry.version })).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(secrets, [{ name: 'MERCADO_PAGO_LIVE_ACCESS_TOKEN', version: '1' }, { name: 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET', version: '1' }]);
    return { name, state: body.status, runtime: body.runtime, mode: 'live', checkoutEnabled, secrets, updateTime: body.updateTime };
  }));
  return { status: 'PAYMENT_DEPLOYMENT_VERIFIED', functions, readOnly: true };
}
if (require.main === module) checkPaymentDeployment({ checkoutEnabled: process.argv.includes('--live') }).then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'PAYMENT_DEPLOYMENT_CHECK_FAILED' })); process.exitCode = 1;
});
module.exports = { checkPaymentDeployment };
