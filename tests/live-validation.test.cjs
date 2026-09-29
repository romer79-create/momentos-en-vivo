'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareValidation } = require('../scripts/prepare-live-validation.cjs');
const id = '11111111-1111-4111-8111-111111111111';
const config = { mode: 'live', checkoutEnabled: false, providerReady: true, terms: { receptionHours: 48, downloadDays: 30, creditMonths: 12 } };
function fixture(initial) {
  let data = initial, calls = 0, creates = 0;
  const ref = { get: async () => ({ data: () => data }), create: async value => { assert.equal(data, undefined); creates++; data = value; }, update: async value => { data = { ...data, ...value }; } };
  return { options: { db: { collection: name => { assert.equal(name, 'orders'); return { doc: value => { assert.equal(value, id); return ref; } }; } }, ownerId: 'verified-owner', config, id,
    provider: { checkout: async order => { calls++; assert.equal(order.priceCents, 10000); assert.equal(order.validation, true); return { checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=validation', preferenceId: 'validation' }; } } }, data: () => data, calls: () => calls, creates: () => creates };
}
test('private validation prepares one ARS 100 order and retries reuse its checkout without changing the public catalog', async () => {
  const f = fixture(); const first = await prepareValidation(f.options), next = await prepareValidation(f.options);
  assert.deepEqual(first, next); assert.equal(f.calls(), 1); assert.equal(f.creates(), 1);
  assert.equal(first.paymentCreated, false); assert.equal(first.amountARS, 100); assert.equal(f.data().mode, 'live');
  assert.equal(f.data().ownerId, 'verified-owner'); assert.equal(f.data().status, 'pending'); assert.deepEqual(f.data().terms, config.terms);
});
test('validation refuses public checkout, sandbox mode or missing credentials before touching the database', async () => {
  for (const change of [{ checkoutEnabled: true }, { mode: 'sandbox' }, { providerReady: false }]) {
    const f = fixture(); await assert.rejects(prepareValidation({ ...f.options, config: { ...config, ...change } }), /SETUP_REQUIRED/);
    assert.equal(f.creates(), 0); assert.equal(f.calls(), 0);
  }
});
test('an existing order must belong to the owner and exactly match this validation; completed orders are never paid again', async () => {
  const f = fixture(); await prepareValidation(f.options);
  for (const change of [{ ownerId: 'other' }, { validation: false }, { priceCents: 6500000 }, { mode: 'sandbox' }, { credits: 3 }, { status: 'approved' }]) {
    const other = fixture({ ...f.data(), ...change }); await assert.rejects(prepareValidation(other.options)); assert.equal(other.calls(), 0);
  }
});
