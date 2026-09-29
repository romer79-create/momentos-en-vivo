'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireTestProfile, validateCall, redact, restrictedFetch } = require('../scripts/mercadopago-mcp.cjs');

test('MCP accepts only the configured Argentine test identity', () => {
  const profile = { test: true, country: 'AR', collectorId: '2954695377' };
  assert.doesNotThrow(() => requireTestProfile(profile));
  for (const change of [{ test: false }, { country: 'BR' }, { collectorId: '7' }]) {
    assert.throws(() => requireTestProfile({ ...profile, ...change }));
  }
});

test('MCP rejects credential/application access, webhook writes and caller-supplied authorization', () => {
  for (const name of ['get_credentials', 'create_application', 'application_list', 'save_webhook']) {
    assert.throws(() => validateCall(name, {}));
  }
  assert.throws(() => validateCall('quality_checklist', { atz: 'override' }));
  assert.throws(() => validateCall('quality_checklist', []));
  assert.doesNotThrow(() => validateCall('quality_checklist', {}));
  assert.throws(() => validateCall('create_test_user', { site_id: 'MLA', profile: 'seller' }));
  assert.throws(() => validateCall('create_test_user', { site_id: 'MLB', profile: 'buyer' }));
  assert.doesNotThrow(() => validateCall('create_test_user', { site_id: 'MLA', profile: 'buyer' }));
});

test('MCP removes the actual secret and token-shaped values from nested results', () => {
  const secret = 'private-value';
  const value = { content: [{ text: `Error: ${secret}; APP_USR-${'x'.repeat(30)}` }], nested: { credential: secret } };
  const output = redact(value, secret);
  assert.equal(output.nested.credential, '[REDACTED]');
  assert.equal(output.content[0].text, 'Error: [REDACTED]; [REDACTED]');
  assert.equal(value.nested.credential, secret);
});

test('MCP never follows redirects or sends requests outside its official endpoint', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => { calls++; assert.equal(options.redirect, 'error'); return 'ok'; };
  for (const url of ['http://mcp.mercadopago.com/mcp', 'https://example.com/mcp', 'https://mcp.mercadopago.com/other', 'https://user@ mcp.mercadopago.com/mcp']) {
    assert.throws(() => restrictedFetch(url, {}, fakeFetch));
  }
  assert.equal(calls, 0);
  assert.equal(await restrictedFetch('https://mcp.mercadopago.com/mcp', { redirect: 'follow' }, fakeFetch), 'ok');
  assert.equal(calls, 1);
});
