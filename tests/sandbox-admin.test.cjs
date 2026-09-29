'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../functions/app');
const { HttpError } = require('../functions/security');
test('HTTP checkout grants test access only from verified server-side identity, never payload or headers', async () => {
  const ownerEmail = 'owner@example.test';
  const users = { owner: { uid: 'owner', email: ownerEmail, email_verified: true }, client: { uid: 'client', email: 'client@example.test', email_verified: true }, unverified: { uid: 'owner', email: ownerEmail, email_verified: false } };
  const auth = { verifyIdToken: async token => { assert.ok(users[token]); return users[token]; } };
  const commerce = {
    catalog: allowed => ({ checkoutEnabled: allowed }),
    billing: async (uid, allowed) => ({ uid, allowed }),
    createOrder: async (uid, data, allowed) => { if (!allowed) throw new HttpError(503, 'paused'); return { uid, allowed }; },
  };
  const server = createApp({ db: { collection: () => ({}) }, auth, bucket: {}, appCheck: {}, ownerEmail, commerce }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const req = (path, token, method = 'GET') => fetch(url + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', 'x-admin': 'true' }, ...(method === 'POST' ? { body: JSON.stringify({ admin: true, testAdmin: true, email: ownerEmail }) } : {}) });
  try {
    assert.equal((await (await req('/catalog')).json()).checkoutEnabled, false);
    assert.equal((await (await req('/catalog', 'client')).json()).checkoutEnabled, false);
    assert.equal((await (await req('/catalog', 'owner')).json()).checkoutEnabled, true);
    assert.equal((await req('/catalog', 'unverified')).status, 403);
    assert.equal((await req('/orders', 'client', 'POST')).status, 503);
    assert.equal((await req('/orders', 'unverified', 'POST')).status, 403);
    assert.equal((await req('/orders', null, 'POST')).status, 401);
    const owner = await req('/orders', 'owner', 'POST'); assert.equal(owner.status, 201);
    assert.deepEqual(await owner.json(), { uid: 'owner', allowed: true });
    assert.deepEqual(await (await req('/billing', 'client')).json(), { uid: 'client', allowed: false });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
