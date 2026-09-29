'use strict';
const assert = require('node:assert/strict');
const SITE = 'https://momentos-en-vivo.web.app';
async function request(path, options = {}) {
  const response = await fetch(SITE + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  return { status: response.status, data, headers: response.headers };
}
async function checkPublic({ live = false } = {}) {
  const health = await request('/api/health'); assert.equal(health.status, 200); assert.deepEqual(health.data, { ok: true, version: 3 });
  const config = await request('/api/config'); assert.equal(config.status, 200); assert.equal(config.data.emulator, false); assert.ok(config.data.appCheckSiteKey);
  const catalog = await request('/api/catalog'); assert.equal(catalog.status, 200); assert.equal(catalog.data.checkoutEnabled, live); assert.equal(catalog.data.mode, live ? 'live' : 'disabled');
  assert.equal(catalog.data.plans.find(p => p.id === 'evento-1').priceCents, 6500000);
  assert.equal(catalog.data.plans.find(p => p.id === 'pack-3').priceCents, 17550000);
  assert.equal(catalog.data.plans.find(p => p.id === 'pack-10').quoteOnly, true);
  assert.equal(catalog.data.terms.receptionHours, 48); assert.equal(catalog.data.terms.downloadDays, 30);
  for (const path of ['/api/me', '/api/billing', '/api/admin/service-status']) assert.equal((await request(path)).status, 401);
  const forged = await request('/api/payments/webhook?data.id=0&type=payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': 'ts=1,v1=invalid', 'x-request-id': 'release-check' },
    body: JSON.stringify({ type: 'payment', data: { id: '0' } }),
  });
  assert.equal(forged.status, 401); assert.equal(forged.data.error, 'Firma inválida.');
  const login = await request('/cliente-login.html'); assert.equal(login.status, 200); assert.ok(login.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  const init = await request('/__/firebase/init.json'); assert.equal(init.data.projectId, 'momentos-en-vivo'); assert.equal(init.data.appId, '1:403164580472:web:9451616b5c586e4d587b8d');
  console.log(JSON.stringify({ publicApi: 'verified', version: 3, checkout: live ? 'live' : 'disabled', prices: 'approved', anonymousAccess: 'rejected', forgedWebhook: 'rejected', appCheck: 'configured', firebaseProject: 'matched', actualProviderPayment: 'not_tested' }));
}
if (require.main === module) checkPublic({ live: process.argv.includes('--live') }).catch(error => { console.error(JSON.stringify({ status: 'failed', code: error.code || 'CHECK_FAILED', expected: error.expected, actual: error.actual })); process.exitCode = 1; });
module.exports = { checkPublic };
