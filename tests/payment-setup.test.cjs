'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { normalizeToken, requirePaymentsDisabled, verifyTestAccount, storeTestToken, configureTestToken } = require('../scripts/configure-payments.cjs');
const token = 'APP_USR-fixture_12345678901234567890';
const profile = { id: 12345678, tags: ['normal', 'test_user'], site_id: 'MLA', country_id: 'AR', email: 'private-fixture@example.test' };
const response = body => async () => ({ ok: true, json: async () => body });

test('test token is sent only to the official account endpoint and only safe metadata is returned', async () => {
  const account = await verifyTestAccount(` ${token}\n`, async (url, options) => {
    assert.equal(url, 'https://api.mercadopago.com/users/me');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return { ok: true, json: async () => profile };
  });
  assert.deepEqual(account, { collectorId: '12345678', country: 'AR', test: true });
  assert.throws(() => normalizeToken('not a token'), /Access Token/);
});

test('real, foreign and malformed accounts are rejected before any secret is stored', async () => {
  for (const body of [{ ...profile, tags: ['normal'] }, { ...profile, country_id: 'BR', site_id: 'MLB' }, { ...profile, id: 1.5 }, null]) {
    let stored = false;
    await assert.rejects(configureTestToken(token, {
      readConfig: () => 'PAYMENTS_MODE=disabled', verify: value => verifyTestAccount(value, response(body)),
      store: async () => { stored = true; },
    }));
    assert.equal(stored, false);
  }
});

test('network, authorization and bad JSON errors never expose provider payloads or tokens', async () => {
  for (const fetchFn of [async () => { throw new Error(token); }, async () => ({ ok: false, json: async () => ({ token }) }), async () => ({ ok: true, json: async () => { throw new Error(token); } })]) {
    await assert.rejects(verifyTestAccount(token, fetchFn), error => !error.message.includes(token) && /No se guardo/.test(error.message));
  }
});

test('enabled or changed payment configuration prevents credential replacement', async () => {
  for (const mode of ['live', 'sandbox', 'unknown', '"live"']) assert.throws(() => requirePaymentsDisabled(`PAYMENTS_MODE=${mode}`), /habilitados/);
  requirePaymentsDisabled('# no active payments\nMAIL_MODE=smtp\n');
  let reads = 0, stored = false;
  await assert.rejects(configureTestToken(token, {
    readConfig: () => ++reads === 1 ? 'PAYMENTS_MODE=disabled' : 'PAYMENTS_MODE=live',
    verify: async () => profile, store: async () => { stored = true; },
  }), /habilitados/);
  assert.equal(stored, false);
});

test('validated test token is stored once through stdin without a deploy or token in arguments', async () => {
  let received = '', stores = 0;
  const account = await configureTestToken(token, {
    readConfig: () => 'PAYMENTS_MODE=disabled', verify: value => verifyTestAccount(value, response(profile)),
    store: value => storeTestToken(value, (executable, args, options) => {
      stores++;
      assert.equal(executable, process.execPath); assert.ok(!JSON.stringify({ args, options }).includes(token));
      assert.ok(args.includes('MERCADO_PAGO_ACCESS_TOKEN')); assert.ok(args.includes('--non-interactive'));
      assert.ok(!args.includes('--force')); assert.ok(!args.includes('deploy'));
      assert.ok(args.some(arg => arg.endsWith('secret-log-redaction.cjs')));
      assert.deepEqual(options.stdio, ['pipe', 'inherit', 'inherit']);
      const child = new EventEmitter();
      child.stdin = new Writable({ write(chunk, encoding, done) { received += chunk.toString(); done(); } });
      child.stdin.once('finish', () => child.emit('close', 0)); return child;
    }),
  });
  assert.equal(stores, 1); assert.equal(received, token); assert.equal(account.test, true);
});

test('failed Firebase storage never reports success', async () => {
  await assert.rejects(storeTestToken(token, () => {
    const child = new EventEmitter(); child.stdin = new Writable({ write(chunk, encoding, done) { done(); } });
    child.stdin.once('finish', () => child.emit('close', 1)); return child;
  }), /no confirmo/);
});

test('credential comparison returns only equality and never exposes secret-read errors', async () => {
  const { compareTestToken } = require('../scripts/compare-payments.cjs');
  let reads = 0;
  assert.deepEqual(await compareTestToken(` ${token} `, async () => { reads++; return token; }), { sameCredential: true, readOnly: true });
  assert.deepEqual(await compareTestToken(`${token}different`, async () => { reads++; return token; }), { sameCredential: false, readOnly: true });
  assert.equal(reads, 2);
  await assert.rejects(compareTestToken('not-a-token', async () => { reads++; return token; }));
  assert.equal(reads, 2);
  await assert.rejects(compareTestToken(token, async () => { throw new Error(`private ${token}`); }), error => error.message === 'COMPARE_FAILED');
});
