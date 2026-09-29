'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gateway } = require('../functions/commerce');
const config = { mode: 'sandbox', collectorId: '123', sandboxBuyerId: '456', accessToken: 'fixture', site: 'https://momentos-en-vivo.web.app' };
const order = { id: '11111111-1111-4111-8111-111111111111', planId: 'evento-1', planTitle: 'Un evento', priceCents: 6500000 };
function fixture({ settings = {}, seller = {}, payment = {}, preference = {} } = {}) {
  const requests = [];
  const fetchFn = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.mercadopago.com');
    assert.equal(options.redirect, 'error');
    const route = new URL(url).pathname; requests.push(route);
    let data;
    if (route === '/users/me') data = { id: 123, site_id: 'MLA', country_id: 'AR', tags: ['test_user'], ...seller };
    else if (route === '/checkout/preferences') data = { id: 'pref-123', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123', sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123', ...preference };
    else if (route === '/v1/payments/789') data = { id: 789, collector_id: 123, payer: { id: 456 }, live_mode: true, ...payment };
    else throw new Error('Unexpected request');
    return { ok: true, json: async () => data };
  };
  return { provider: gateway({ ...config, ...settings }, fetchFn), requests };
}
test('test-user checkout uses init_point after checking the seller and configured buyer', async () => {
  const f = fixture(), result = await f.provider.checkout(order);
  assert.equal(new URL(result.checkoutUrl).hostname, 'www.mercadopago.com.ar');
  assert.deepEqual(f.requests, ['/users/me', '/checkout/preferences']);
});
test('sandbox refuses real, foreign or mismatched sellers before creating a preference', async () => {
  for (const seller of [{ tags: ['normal'] }, { tags: undefined }, { id: 999 }, { site_id: 'MLB' }, { country_id: 'BR' }]) {
    const f = fixture({ seller }); await assert.rejects(f.provider.checkout(order), e => e.status === 409);
    assert.deepEqual(f.requests, ['/users/me']);
  }
  for (const sandboxBuyerId of ['', '123', 'invalid']) {
    const f = fixture({ settings: { sandboxBuyerId } }); await assert.rejects(f.provider.checkout(order), e => e.status === 503);
    assert.deepEqual(f.requests, ['/users/me']);
  }
});
test('live mode rejects test sellers even when a payment says live_mode true', async () => {
  const f = fixture({ settings: { mode: 'live' } });
  await assert.rejects(f.provider.payment('789'), e => e.status === 409);
  const live = fixture({ settings: { mode: 'live' }, seller: { tags: ['normal'] } });
  const payment = await live.provider.payment('789'); assert.equal(live.provider.isSandboxPayment(payment), false);
});
test('sandbox accepts modern test payments only for the selected buyer and verified seller', async () => {
  const f = fixture(), payment = await f.provider.payment('789');
  assert.equal(payment.live_mode, true); assert.equal(f.provider.isSandboxPayment(payment), true);
  assert.equal(f.provider.isSandboxPayment({ ...payment, sandbox: true }), false);
  assert.equal(fixture().provider.isSandboxPayment(payment), false);
  for (const change of [{ id: 999 }, { collector_id: 999 }, { payer: { id: 999 } }, { payer: { id: 123 } }, { payer: {} }]) {
    await assert.rejects(fixture({ payment: change }).provider.payment('789'), e => e.status === 409);
  }
  await assert.rejects(fixture({ settings: { sandboxBuyerId: '' } }).provider.payment('789'), e => e.status === 409);
});
test('legacy sandbox response stays unchanged; untrusted checkout links are rejected', async () => {
  const f = fixture({ payment: { live_mode: false } }), payment = await f.provider.payment('789');
  assert.equal(payment.live_mode, false); assert.equal(f.provider.isSandboxPayment(payment), false);
  for (const init_point of [null, 'https://evil.example/checkout/v1/redirect', 'http://www.mercadopago.com.ar/checkout/v1/redirect']) {
    await assert.rejects(fixture({ preference: { init_point } }).provider.checkout(order), e => e.status === 503);
  }
});
