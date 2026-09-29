'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { configuration, paymentSecrets } = require('../functions/commerce');
const { normalizeLiveToken, requireLiveSetupPaused, verifyLiveAccount, configureLiveCredentials } = require('../scripts/configure-live-payments.cjs');
const { storeProjectSecret } = require('../scripts/store-project-secret.cjs');
const token = 'APP_USR-live_fixture_12345678901234567890';
const webhook = 'live-fixture-webhook-signing-key-12345678';
const config = 'PAYMENTS_MODE=sandbox\nPAYMENTS_CHECKOUT_ENABLED=false\n';
const profile = { id: 98765432, site_id: 'MLA', country_id: 'AR', tags: ['normal'], email: 'private@example.test' };
const response = body => async () => ({ ok: true, json: async () => body });

test('live and sandbox use separate credentials, seller IDs and function bindings with no fallback', () => {
  const env = { PAYMENTS_MODE: 'live', PAYMENTS_CHECKOUT_ENABLED: 'true', MERCADO_PAGO_ACCESS_TOKEN: 'test-key', MERCADO_PAGO_WEBHOOK_SECRET: 'test-secret', MERCADO_PAGO_COLLECTOR_ID: '123', MERCADO_PAGO_LIVE_ACCESS_TOKEN: token, MERCADO_PAGO_LIVE_WEBHOOK_SECRET: webhook, MERCADO_PAGO_LIVE_COLLECTOR_ID: '98765432' };
  const live = configuration(env); assert.equal(live.accessToken, token); assert.equal(live.webhookSecret, webhook);
  assert.equal(live.collectorId, '98765432'); assert.equal(live.checkoutEnabled, true); assert.equal(live.sandboxAdminCheckout, false);
  const sandbox = configuration({ ...env, PAYMENTS_MODE: 'sandbox' });
  assert.equal(sandbox.accessToken, 'test-key'); assert.equal(sandbox.webhookSecret, 'test-secret'); assert.equal(sandbox.collectorId, '123');
  for (const key of ['MERCADO_PAGO_LIVE_ACCESS_TOKEN', 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET', 'MERCADO_PAGO_LIVE_COLLECTOR_ID']) {
    const missing = configuration({ ...env, [key]: '' }); assert.equal(missing.providerReady, false); assert.equal(missing.checkoutEnabled, false);
  }
  assert.deepEqual(paymentSecrets('live'), ['MERCADO_PAGO_LIVE_ACCESS_TOKEN', 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET']);
  assert.deepEqual(paymentSecrets('sandbox'), ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET']);
  assert.deepEqual(paymentSecrets('disabled'), []); assert.deepEqual(paymentSecrets('local'), []);
});

test('production setup refuses active sales, ambiguous configuration and existing live deployment', () => {
  requireLiveSetupPaused(config);
  requireLiveSetupPaused('PAYMENTS_MODE="disabled"\nPAYMENTS_CHECKOUT_ENABLED="false"');
  for (const text of [config.replace('false', 'true'), config.replace('sandbox', 'live'), config.replace('sandbox', 'unknown'), config + 'PAYMENTS_MODE=live', config + 'PAYMENTS_CHECKOUT_ENABLED=true', 'PAYMENTS_MODE=sandbox']) {
    assert.throws(() => requireLiveSetupPaused(text), /ventas desactivadas/);
  }
});

test('only the official HTTPS endpoint receives a production token; returned metadata omits private profile', async () => {
  const account = await verifyLiveAccount(` ${token}\n`, async (url, options) => {
    assert.equal(url, 'https://api.mercadopago.com/users/me'); assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return { ok: true, json: async () => profile };
  });
  assert.deepEqual(account, { collectorId: '98765432', country: 'AR', test: false });
  for (const value of ['TEST-fixture_12345678901234567890', webhook, 'invalid']) assert.throws(() => normalizeLiveToken(value), /Productivas/);
});

test('test, foreign and malformed sellers never reach credential storage', async () => {
  for (const body of [{ ...profile, tags: ['test_user'] }, { ...profile, tags: undefined }, { ...profile, country_id: 'BR' }, { ...profile, site_id: 'MLB' }, { ...profile, id: 1.5 }, null]) {
    let stored = false;
    await assert.rejects(configureLiveCredentials(token, webhook, {
      readConfig: () => config, verify: value => verifyLiveAccount(value, response(body)), store: async () => { stored = true; },
    }));
    assert.equal(stored, false);
  }
});

test('failed lookup, authorization and malformed provider JSON never expose keys or response bodies', async () => {
  for (const fetchFn of [async () => { throw new Error(token); }, async () => ({ ok: false, json: async () => ({ token }) }), async () => ({ ok: true, json: async () => { throw new Error(token); } })]) {
    await assert.rejects(verifyLiveAccount(token, fetchFn), error => !error.message.includes(token) && /No se guardo/.test(error.message));
  }
});

test('both keys must be valid before lookup or storage and a config change stops the operation', async () => {
  let calls = 0;
  await assert.rejects(configureLiveCredentials(token, 'short', { readConfig: () => config, verify: async () => { calls++; }, store: async () => { calls++; } }));
  assert.equal(calls, 0);
  let reads = 0;
  await assert.rejects(configureLiveCredentials(token, webhook, { readConfig: () => ++reads === 1 ? config : config.replace('false', 'true'), verify: async () => profile, store: async () => { calls++; } }));
  assert.equal(calls, 0);
});

test('new production secrets are stored only through stdin in the fixed Firebase project, with test secrets untouched', async () => {
  const names = [], values = [];
  await configureLiveCredentials(token, webhook, { readConfig: () => config, verify: async () => ({ collectorId: '98765432', country: 'AR', test: false }),
    store: (name, value) => storeProjectSecret(name, value, (executable, args, options) => {
      names.push(name); assert.equal(executable, process.execPath);
      assert.ok(!JSON.stringify({ args, options }).includes(token)); assert.ok(!JSON.stringify({ args, options }).includes(webhook));
      assert.equal(args[args.indexOf('--project') + 1], 'momentos-en-vivo'); assert.equal(args[args.indexOf('--account') + 1], 'sylar.soluciones@gmail.com');
      assert.ok(args.includes('--non-interactive')); assert.ok(!args.includes('deploy')); assert.ok(!args.includes('--force'));
      const child = new EventEmitter(); child.stdin = new Writable({ write(chunk, encoding, done) { values.push(chunk.toString()); done(); } });
      child.stdin.once('finish', () => child.emit('close', 0)); return child;
    }),
  });
  assert.deepEqual(names, ['MERCADO_PAGO_LIVE_ACCESS_TOKEN', 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET']); assert.deepEqual(values, [token, webhook]);
});

test('partial secret storage fails closed without exposing the failed value or enabling checkout', async () => {
  let stores = 0;
  await assert.rejects(configureLiveCredentials(token, webhook, { readConfig: () => config, verify: async () => profile,
    store: async () => { if (++stores === 2) throw new Error(webhook); },
  }), error => !error.message.includes(webhook) && /cobros siguen desactivados/.test(error.message));
  assert.equal(stores, 2);
});
