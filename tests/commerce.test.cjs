const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const requireFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { createCommerce, configuration, safeCheckoutUrl, creditExpiry, gateway } = require('../functions/commerce');
const S = require('../functions/security');
let app, db;
const env = { PAYMENTS_MODE: 'sandbox', PAYMENTS_CHECKOUT_ENABLED: 'true', MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fixture', MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-secret', MERCADO_PAGO_COLLECTOR_ID: '123456', PRICE_EVENT_1_CENTS: '123400', PRICE_PACK_3_CENTS: '345600', PRICE_PACK_10_CENTS: '999900', EVENT_PHOTO_LIMIT: '800', EVENT_RECEPTION_HOURS: '24', EVENT_DOWNLOAD_DAYS: '30' };
before(() => { assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:/); app = initializeApp({ projectId: 'demo-commerce-tests' }); db = getFirestore(app); });
after(async () => { if (app) await deleteApp(app); });
function setup(options = {}) {
  let time = Date.now(), calls = 0; const uid = randomUUID(); const config = configuration(env); const payments = new Map();
  const provider = { checkout: async order => { calls++; return { checkoutUrl: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${order.id}`, preferenceId: order.id }; }, payment: async id => payments.get(id), search: async () => [...payments.values()] };
  const commerce = createCommerce({ db, config, provider, now: () => time, ...options });
  return { uid, config, provider, commerce, payments, advance: n => { time += n; }, calls: () => calls, now: () => time };
}
async function order(f, planId = 'evento-1', extra = {}) { return f.commerce.createOrder(f.uid, { id: randomUUID(), planId, ...extra }); }
function payment(f, o, extra = {}) { return { id: String(Math.floor(Math.random() * 1e12)), external_reference: o.id, collector_id: '123456', live_mode: false, currency_id: 'ARS', transaction_amount: o.priceCents / 100, status: 'approved', date_last_updated: new Date(f.now()).toISOString(), ...extra }; }
async function draft(f, extra = {}) { const id = randomUUID(); await db.collection('events').doc(id).set({ ownerId: f.uid, status: 'draft', startsAt: new Date(f.now() - 3600000).toISOString(), photoCount: 0, ...extra }); return id; }
const rejects = (promise, status) => assert.rejects(promise, error => error.status === status);

test('production checkout requires explicit configuration; browser URLs cannot point off-site', async () => {
  assert.equal(configuration({}).checkoutEnabled, false);
  assert.equal(configuration({ ...env, MERCADO_PAGO_WEBHOOK_SECRET: '' }).checkoutEnabled, false);
  assert.equal(configuration({ ...env, EVENT_RECEPTION_HOURS: '0' }).checkoutEnabled, false);
  assert.equal(configuration({}, true).mode, 'local');
  const f = setup({ config: configuration({}) }); await rejects(order(f), 503);
  for (const url of ['javascript:alert(1)', 'http://www.mercadopago.com.ar/checkout/v1', 'https://www.mercadopago.com.ar.evil.test/checkout/v1', 'https://evil@www.mercadopago.com.ar/checkout/v1', 'https://www.mercadopago.com.ar/other']) assert.equal(safeCheckoutUrl(url), null);
  assert.ok(safeCheckoutUrl('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test'));
});

test('approved catalog prices are in ARS and ten events are quotation only', async () => {
  const plans = configuration({}, true).plans;
  assert.equal(plans[0].priceCents, 6500000);
  assert.equal(plans[1].priceCents, plans[0].priceCents * 3 * .9);
  assert.equal(plans[2].quoteOnly, true); assert.equal(plans[2].priceCents, null);
  const f = setup(); await rejects(order(f, 'pack-10', { priceCents: 1 }), 400);
});

test('credit validity is twelve calendar months and handles leap day', async () => {
  assert.equal(new Date(creditExpiry(Date.parse('2024-02-29T20:30:00Z'))).toISOString(), '2025-02-28T20:30:00.000Z');
  const f = setup(); const o = await order(f, 'pack-3'), p = payment(f, o); await f.commerce.applyPayment(p);
  const expiry = Date.parse((await f.commerce.ownOrder(f.uid, o.id)).creditsExpireAt);
  assert.equal(expiry, creditExpiry(f.now()));
  await f.commerce.activate(f.uid, await draft(f)); assert.equal(await f.commerce.balance(f.uid), 2);
  f.advance(expiry - f.now());
  assert.deepEqual(await Promise.all([f.commerce.balance(f.uid), f.commerce.balance(f.uid)]), [0, 0]);
  await rejects(f.commerce.activate(f.uid, await draft(f)), 402);
  const ledger = (await db.collection('creditLedger').doc(`expire_${o.id}`).get()).data(); assert.equal(ledger.delta, -2);
  await f.commerce.applyPayment({ ...p, date_last_updated: new Date(f.now()).toISOString() }); assert.equal(await f.commerce.balance(f.uid), 0);
  const fresh = await order(f); await f.commerce.applyPayment(payment(f, fresh));
  await f.commerce.applyPayment({ ...p, status: 'refunded', date_last_updated: new Date(f.now()).toISOString() });
  assert.equal(await f.commerce.balance(f.uid), 1);
  assert.equal((await db.collection('billingIncidents').doc(`reversal_${p.id}`).get()).data().consumedCredits, 1);
});

test('server prices and package terms override forged client values; retries reuse the same order', async () => {
  const f = setup(); const o = await order(f, 'pack-3', { priceCents: 1, credits: 10000, terms: { receptionHours: 9999 }, status: 'approved' });
  assert.equal(o.priceCents, 345600); assert.equal(o.credits, 3); assert.equal(o.status, 'pending'); assert.equal(o.terms.receptionHours, 24);
  await Promise.all(Array.from({ length: 5 }, () => f.commerce.createOrder(f.uid, { id: o.id, planId: 'pack-3' })));
  assert.equal(f.calls(), 1); assert.equal((await f.commerce.billing(f.uid)).balance, 0);
  await rejects(f.commerce.createOrder('foreign', { id: o.id, planId: 'pack-3' }), 409);
  await rejects(f.commerce.createOrder(f.uid, { id: o.id, planId: 'evento-1' }), 409);
});

test('parallel duplicate payment notifications credit exactly once', async () => {
  const f = setup(); const o = await order(f, 'pack-3'); const p = payment(f, o);
  await Promise.all(Array.from({ length: 8 }, () => f.commerce.applyPayment(p)));
  assert.equal((await f.commerce.billing(f.uid)).balance, 3);
  assert.equal((await db.collection('creditLedger').where('orderId', '==', o.id).get()).size, 1);
  assert.equal((await f.commerce.ownOrder(f.uid, o.id)).status, 'approved');
  await f.commerce.applyPayment({ ...p, id: `${p.id}1` });
  assert.equal((await f.commerce.billing(f.uid)).balance, 3);
  assert.equal((await db.collection('billingIncidents').doc(`duplicate_${p.id}1`).get()).exists, true);
});

test('authenticated test-account payment with live_mode true credits only once; raw flags cannot bypass mode checks', async () => {
  const f = setup(), o = await order(f);
  const raw = payment(f, o, { live_mode: true, payer: { id: 55555 } });
  const config = { ...f.config, sandboxBuyerId: '55555' };
  const provider = gateway(config, async url => {
    const route = new URL(url).pathname;
    if (route === '/users/me') return { ok: true, json: async () => ({ id: 123456, tags: ['test_user'], site_id: 'MLA', country_id: 'AR' }) };
    assert.equal(route, `/v1/payments/${raw.id}`);
    return { ok: true, json: async () => ({ ...raw }) };
  });
  const commerce = createCommerce({ db, config, provider, now: f.now });
  await rejects(commerce.applyPayment({ ...raw, verifiedSandbox: true }), 409);
  const verified = await provider.payment(raw.id);
  await Promise.all(Array.from({ length: 4 }, () => commerce.applyPayment(verified)));
  assert.equal(await commerce.balance(f.uid), 1);
  assert.equal((await db.collection('creditLedger').doc(`purchase_${o.id}`).get()).data().delta, 1);
  await rejects(commerce.applyPayment({ ...verified }), 409);
});

test('pending and rejected payments grant no credits; a verified later approval can credit', async () => {
  const f = setup(); const o = await order(f); const p = payment(f, o, { status: 'pending' });
  await f.commerce.applyPayment(p); assert.equal((await f.commerce.billing(f.uid)).balance, 0);
  f.advance(1000); await f.commerce.applyPayment({ ...p, status: 'rejected', date_last_updated: new Date(f.now()).toISOString() });
  assert.equal((await f.commerce.ownOrder(f.uid, o.id)).status, 'rejected'); assert.equal((await f.commerce.billing(f.uid)).balance, 0);
  f.advance(1000); await f.commerce.applyPayment({ ...p, status: 'approved', date_last_updated: new Date(f.now()).toISOString() });
  assert.equal((await f.commerce.billing(f.uid)).balance, 1);
  await f.commerce.applyPayment(p); assert.equal((await f.commerce.ownOrder(f.uid, o.id)).status, 'approved');
});

test('wrong amount, currency, merchant and live mode fail closed', async () => {
  const f = setup(); const o = await order(f);
  for (const extra of [{ transaction_amount: 1 }, { currency_id: 'USD' }, { collector_id: '9999' }, { live_mode: true }]) await rejects(f.commerce.applyPayment(payment(f, o, extra)), 409);
  assert.equal((await f.commerce.billing(f.uid)).balance, 0);
  assert.deepEqual(await f.commerce.applyPayment({ external_reference: null }), { ignored: true });
});

test('a payment ID cannot fund two orders', async () => {
  const f = setup(); const a = await order(f); const b = await order(f); const p = payment(f, a);
  await f.commerce.applyPayment(p); await rejects(f.commerce.applyPayment({ ...p, external_reference: b.id }), 409);
  assert.equal((await f.commerce.billing(f.uid)).balance, 1);
});

test('foreign customers cannot inspect, refresh or activate an order/event', async () => {
  const f = setup(); const o = await order(f); const event = await draft(f);
  await rejects(f.commerce.ownOrder('foreign', o.id), 404); await rejects(f.commerce.refresh('foreign', o.id), 404);
  await rejects(f.commerce.activate('foreign', event), 404);
  assert.equal((await f.commerce.billing('foreign')).orders.length, 0);
});

test('unpaid activation is rejected and concurrent activation consumes one credit', async () => {
  const f = setup(); const event = await draft(f); await rejects(f.commerce.activate(f.uid, event), 402);
  const o = await order(f); await f.commerce.applyPayment(payment(f, o));
  await Promise.all(Array.from({ length: 6 }, () => f.commerce.activate(f.uid, event)));
  assert.equal((await f.commerce.billing(f.uid)).balance, 0);
  const saved = (await db.collection('events').doc(event).get()).data(); assert.equal(saved.status, 'active'); assert.equal(saved.limits.photoLimit, 800); assert.equal(saved.creditOrderId, o.id);
  assert.equal((await db.collection('creditLedger').doc(`activate_${event}`).get()).data().delta, -1);
});

test('two events racing for one credit cannot overdraw the wallet', async () => {
  const f = setup(); const o = await order(f); await f.commerce.applyPayment(payment(f, o));
  const events = await Promise.all([draft(f), draft(f)]); const results = await Promise.allSettled(events.map(id => f.commerce.activate(f.uid, id)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.status, 402);
  assert.equal((await f.commerce.billing(f.uid)).balance, 0);
});

test('activation retains purchased conditions after catalog changes and respects event dates', async () => {
  const f = setup(); const o = await order(f, 'pack-3'); await f.commerce.applyPayment(payment(f, o)); f.config.terms.receptionHours = 99;
  const past = await draft(f, { startsAt: new Date(f.now() - 48 * 3600000).toISOString() }); await rejects(f.commerce.activate(f.uid, past), 400);
  const future = await draft(f, { startsAt: new Date(f.now() + 3600000).toISOString() }); await f.commerce.activate(f.uid, future);
  const saved = (await db.collection('events').doc(future).get()).data(); assert.equal(saved.limits.receptionHours, 24); assert.equal(S.receptionOpen(saved, f.now()), false);
  assert.equal(S.receptionOpen(saved, f.now() + 2 * 3600000), true); assert.equal(S.receptionOpen(saved, f.now() + 25 * 3600000), false);
  assert.equal((await f.commerce.billing(f.uid)).balance, 2);
});

test('refund removes only unused credits and a replay never restores them', async () => {
  const f = setup(); const o = await order(f, 'pack-3'); const p = payment(f, o); await f.commerce.applyPayment(p);
  await f.commerce.activate(f.uid, await draft(f)); f.advance(1000);
  const reversed = { ...p, status: 'refunded', date_last_updated: new Date(f.now()).toISOString() };
  await f.commerce.applyPayment(reversed); await f.commerce.applyPayment(reversed); await f.commerce.applyPayment(p);
  assert.equal((await f.commerce.billing(f.uid)).balance, 0); assert.equal((await f.commerce.ownOrder(f.uid, o.id)).status, 'refunded');
  assert.equal((await db.collection('creditLedger').doc(`reverse_${o.id}`).get()).data().delta, -2);
  // Repeated callbacks must not change the original consumed-credit count.
  assert.equal((await db.collection('billingIncidents').doc(`reversal_${p.id}`).get()).data().consumedCredits, 1);
});

test('partial refunds enter review and chargebacks revoke unused credits', async () => {
  for (const extra of [{ transaction_amount_refunded: 1, status: 'approved' }, { status: 'charged_back' }]) {
    const f = setup(); const o = await order(f); const p = payment(f, o); await f.commerce.applyPayment(p); f.advance(1000);
    await f.commerce.applyPayment({ ...p, ...extra, date_last_updated: new Date(f.now()).toISOString() }); assert.equal((await f.commerce.billing(f.uid)).balance, 0);
    assert.ok(['review', 'charged_back'].includes((await f.commerce.ownOrder(f.uid, o.id)).status));
  }
});

test('webhook rejects forged signatures and mismatched body IDs, and fetches authoritative payment data', async () => {
  const reports = [];
  const f = setup({ reportWebhook: record => reports.push(record) }); const o = await order(f); const p = payment(f, o); f.payments.set(p.id, p);
  const ts = String(f.now()); const requestId = randomUUID(); const signature = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:${p.id};request-id:${requestId};ts:${ts};`).digest('hex');
  const req = { query: { 'data.id': p.id, type: 'payment' }, headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` }, body: { type: 'payment', data: { id: p.id }, status: 'rejected', transaction_amount: 0.01 } };
  await rejects(f.commerce.webhook({ ...req, headers: { ...req.headers, 'x-signature': `ts=${ts},v1=forged` } }), 401);
  await rejects(f.commerce.webhook({ ...req, body: { data: { id: '9' } } }), 400);
  assert.equal((await f.commerce.billing(f.uid)).balance, 0); await f.commerce.webhook(req); await f.commerce.webhook(req); assert.equal((await f.commerce.billing(f.uid)).balance, 1);
  assert.deepEqual(reports.map(({ stage, status, outcome, signatureVerified }) => ({ stage, status, outcome, signatureVerified })), [
    { stage: 'signature', status: 401, outcome: 'failed', signatureVerified: false },
    { stage: 'envelope', status: 400, outcome: 'failed', signatureVerified: false },
    { stage: 'complete', status: 200, outcome: 'credited', signatureVerified: true },
    { stage: 'complete', status: 200, outcome: 'processed', signatureVerified: true }
  ]);
  for (const record of reports) assert.deepEqual(Object.keys(record).sort(), ['event', 'format', 'outcome', 'requestIdPresent', 'signaturePresent', 'signatureVerified', 'stage', 'status'].sort());
  for (const privateValue of [p.id, o.id, requestId, signature, env.MERCADO_PAGO_WEBHOOK_SECRET]) assert.ok(!JSON.stringify(reports).includes(privateValue));
  const brokenLogging = createCommerce({ db, config: f.config, provider: f.provider, reportWebhook: () => { throw new Error('logger unavailable'); } });
  assert.deepEqual(await brokenLogging.webhook(req), { received: true });
  await rejects(brokenLogging.webhook({ ...req, headers: {} }), 401);
  assert.equal(await f.commerce.balance(f.uid), 1);
});

test('webhook diagnostics distinguish unsigned legacy calls from provider outages without trusting payloads', async () => {
  const reports = [];
  const f = setup({ reportWebhook: record => reports.push(record) });
  await rejects(f.commerce.webhook({ query: { topic: 'payment', id: '123' }, headers: {}, body: { secret: 'do-not-log' } }), 400);
  assert.equal(reports[0].format, 'legacy_ipn'); assert.equal(reports[0].signatureVerified, false);
  const id = '123', ts = String(f.now()), requestId = randomUUID();
  const signature = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  const provider = { payment: async () => { throw new S.HttpError(503, 'private-provider-response'); } };
  const unavailable = createCommerce({ db, config: f.config, provider, reportWebhook: record => reports.push(record) });
  await rejects(unavailable.webhook({ query: { 'data.id': id, type: 'payment' }, headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` } }), 503);
  assert.equal(reports[1].stage, 'lookup'); assert.equal(reports[1].status, 503); assert.equal(reports[1].signatureVerified, true);
  assert.ok(!JSON.stringify(reports).includes('do-not-log')); assert.ok(!JSON.stringify(reports).includes('private-provider-response'));
});

test('pausing new purchases preserves signed confirmations and recovery of pending payments', async () => {
  for (const enabled of [undefined, '', 'false', 'yes']) {
    const config = configuration({ ...env, PAYMENTS_CHECKOUT_ENABLED: enabled });
    assert.equal(config.checkoutEnabled, false); assert.equal(config.providerReady, true);
  }
  const f = setup(); const o = await order(f); const p = payment(f, o); f.payments.set(p.id, p);
  const paused = createCommerce({ db, config: configuration({ ...env, PAYMENTS_CHECKOUT_ENABLED: 'false' }), provider: f.provider });
  assert.equal(paused.catalog().checkoutEnabled, false);
  await rejects(paused.createOrder(f.uid, { id: randomUUID(), planId: 'evento-1' }), 503);
  const ts = String(f.now()), requestId = randomUUID();
  const signature = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:${p.id};request-id:${requestId};ts:${ts};`).digest('hex');
  const req = { query: { 'data.id': p.id, type: 'payment' }, headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` }, body: { data: { id: p.id } } };
  await rejects(paused.webhook({ ...req, headers: {} }), 401);
  await paused.webhook(req); assert.equal(await paused.balance(f.uid), 1);
  const second = await order(f), secondPayment = payment(f, second); f.payments.set(secondPayment.id, secondPayment);
  await paused.refresh(f.uid, second.id); assert.equal(await paused.balance(f.uid), 2);
  assert.equal(configuration({}, true).checkoutEnabled, true);
});

test('payment simulation is possible only in the local emulator', async () => {
  const f = setup(); const o = await order(f); await rejects(f.commerce.simulate(f.uid, o.id, 'approved'), 404);
  const local = setup({ emulator: true, config: configuration({}, true) }); const simulated = await order(local);
  await rejects(local.commerce.simulate('foreign', simulated.id, 'approved'), 404);
  await local.commerce.simulate(local.uid, simulated.id, 'approved'); assert.equal((await local.commerce.billing(local.uid)).balance, 1);
});

test('sandbox checkout can be limited to a server-verified admin while public and live sales stay paused', async () => {
  const config = configuration({ ...env, PAYMENTS_CHECKOUT_ENABLED: 'false', PAYMENTS_SANDBOX_ADMIN: 'true' });
  const f = setup({ config });
  assert.equal(f.commerce.catalog().checkoutEnabled, false); assert.equal(f.commerce.catalog(true).mode, 'sandbox');
  assert.equal((await f.commerce.billing(f.uid, true)).mode, 'sandbox');
  assert.equal((await f.commerce.billing(f.uid)).mode, 'disabled');
  const input = { id: randomUUID(), planId: 'evento-1', admin: true, testAdmin: true };
  await rejects(f.commerce.createOrder(f.uid, input), 503);
  const created = await f.commerce.createOrder(f.uid, input, true); assert.equal(created.mode, 'sandbox');
  const live = createCommerce({ db, config: configuration({ ...env, PAYMENTS_MODE: 'live', PAYMENTS_CHECKOUT_ENABLED: 'false', PAYMENTS_SANDBOX_ADMIN: 'true' }), provider: f.provider });
  assert.equal(live.catalog(true).checkoutEnabled, false);
  await rejects(live.createOrder(f.uid, { id: randomUUID(), planId: 'evento-1' }, true), 503);
});

test('sandbox credits and activated events cannot be reused after switching to live', async () => {
  const f = setup(); const o = await order(f, 'pack-3'); await f.commerce.applyPayment(payment(f, o));
  const active = await draft(f); await f.commerce.activate(f.uid, active);
  const live = createCommerce({ db, config: configuration({ ...env, PAYMENTS_MODE: 'live', MERCADO_PAGO_LIVE_ACCESS_TOKEN: 'APP_USR-live-fixture', MERCADO_PAGO_LIVE_WEBHOOK_SECRET: 'live-fixture-secret', MERCADO_PAGO_LIVE_COLLECTOR_ID: '123456' }), provider: f.provider });
  assert.equal(await live.balance(f.uid), 0); assert.equal(await f.commerce.balance(f.uid), 2);
  await rejects(live.activate(f.uid, await draft(f)), 402); await rejects(live.activate(f.uid, active), 409);
  await rejects(live.createOrder(f.uid, { id: o.id, planId: 'pack-3' }), 409);
  assert.equal((await live.ownOrder(f.uid, o.id)).mode, 'sandbox');
});

test('live signed approvals and refunds keep a single ledger and never change sandbox balance', async () => {
  const liveEnv = { ...env, PAYMENTS_MODE: 'live', MERCADO_PAGO_LIVE_ACCESS_TOKEN: 'APP_USR-live-fixture', MERCADO_PAGO_LIVE_WEBHOOK_SECRET: 'live-fixture-secret', MERCADO_PAGO_LIVE_COLLECTOR_ID: '123456' };
  const f = setup({ config: configuration(liveEnv), reportWebhook: () => {} });
  const o = await order(f), p = payment(f, o, { live_mode: true }); f.payments.set(p.id, p);
  const ts = String(f.now()), requestId = randomUUID();
  const signed = secret => ({ query: { 'data.id': p.id, type: 'payment' }, body: { type: 'payment', data: { id: p.id } },
    headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${p.id};request-id:${requestId};ts:${ts};`).digest('hex')}` } });
  await rejects(f.commerce.webhook(signed(env.MERCADO_PAGO_WEBHOOK_SECRET)), 401);
  await Promise.all(Array.from({ length: 4 }, () => f.commerce.webhook(signed(liveEnv.MERCADO_PAGO_LIVE_WEBHOOK_SECRET))));
  assert.equal(await f.commerce.balance(f.uid), 1);
  assert.equal((await db.collection('creditLedger').where('orderId', '==', o.id).get()).size, 1);
  assert.equal((await db.collection('mailOutbox').where('entityId', '==', o.id).get()).size, 1);
  const sandbox = createCommerce({ db, config: configuration(env), provider: f.provider });
  assert.equal(await sandbox.balance(f.uid), 0);
  f.advance(1000); f.payments.set(p.id, { ...p, status: 'refunded', transaction_amount_refunded: o.priceCents / 100, date_last_updated: new Date(f.now()).toISOString() });
  await f.commerce.webhook(signed(liveEnv.MERCADO_PAGO_LIVE_WEBHOOK_SECRET));
  await f.commerce.webhook(signed(liveEnv.MERCADO_PAGO_LIVE_WEBHOOK_SECRET));
  assert.equal(await f.commerce.balance(f.uid), 0); assert.equal(await sandbox.balance(f.uid), 0);
  assert.equal((await f.commerce.ownOrder(f.uid, o.id)).status, 'refunded');
  assert.equal((await db.collection('creditLedger').doc(`reverse_${o.id}`).get()).data().delta, -1);
});

test('reconciliation recovers a missed notification and maintenance closes expired events', async () => {
  const f = setup(); const o = await order(f); const p = payment(f, o); f.payments.set(p.id, p);
  await f.commerce.refresh(f.uid, o.id); assert.equal((await f.commerce.billing(f.uid)).balance, 1);
  const event = await draft(f); await f.commerce.activate(f.uid, event); f.advance(2 * 86400000);
  await f.commerce.maintenance(); assert.equal((await db.collection('events').doc(event).get()).data().status, 'closed');
  assert.equal((await f.commerce.billing(f.uid)).balance, 0);
});

test('new order quota does not charge retries of an existing order', async () => {
  const f = setup(); const first = await order(f);
  for (let i = 1; i < 20; i++) await order(f);
  await rejects(order(f), 429); assert.equal((await f.commerce.createOrder(f.uid, { id: first.id, planId: first.planId })).id, first.id);
});
