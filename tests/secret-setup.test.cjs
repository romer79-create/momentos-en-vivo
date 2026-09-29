const { test } = require('node:test');
const assert = require('node:assert/strict');
const { logger } = require('firebase-tools/lib/logger');
const { Client } = require('firebase-tools/lib/apiv2');
require('../scripts/secret-log-redaction.cjs');
const { normalizeSecret, storeSecret } = require('../scripts/configure-mail.cjs');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');

test('mail setup accepts grouped app passwords and rejects invalid input before starting Firebase', () => {
  assert.equal(normalizeSecret('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.throws(() => storeSecret('', () => assert.fail('must not start')), /16 caracteres/);
  assert.throws(() => storeSecret('short', () => assert.fail('must not start')), /16 caracteres/);
});

test('mail setup sends the secret only through stdin and disables automatic redeployment', async () => {
  const dummy = 'abcdefghijklmnop';
  let received = '';
  await storeSecret(dummy, (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.ok(!JSON.stringify({ args, options }).includes(dummy));
    assert.ok(args.includes('--non-interactive')); assert.ok(!args.includes('--force'));
    assert.ok(args.some(arg => arg.endsWith('secret-log-redaction.cjs')));
    assert.deepEqual(options.stdio, ['pipe', 'inherit', 'inherit']);
    const child = new EventEmitter();
    child.stdin = new Writable({ write(chunk, encoding, done) { received += chunk.toString(); done(); } });
    child.stdin.once('finish', () => child.emit('close', 0));
    return child;
  });
  assert.equal(received, dummy);
});

test('mail setup reports failed storage instead of confirming success', async () => {
  await assert.rejects(storeSecret('abcdefghijklmnop', () => {
    const child = new EventEmitter();
    child.stdin = new Writable({ write(chunk, encoding, done) { done(); } });
    child.stdin.once('finish', () => child.emit('close', 1));
    return child;
  }), /No se pudo guardar/);
});

test('secret setup omits payloads from Firebase diagnostics and retains status', () => {
  const lines = [], original = logger.debug;
  logger.debug = (...args) => lines.push(args.join(' '));
  try {
    const client = new Client({ urlPrefix: 'https://secretmanager.googleapis.com', apiVersion: 'v1' });
    const dummy = 'dummy-for-test-01';
    const encoded = Buffer.from(dummy).toString('base64');
    const options = { path: '/projects/test/secrets/SMTP_PASSWORD:addVersion', method: 'POST', body: { payload: { data: encoded } } };
    client.logRequest(options);
    client.logResponse({ status: 200 }, { payload: { data: encoded }, extra: dummy }, options);
    const output = lines.join('\n');
    assert.ok(!output.includes(dummy)); assert.ok(!output.includes(encoded));
    assert.match(output, /\[status\].*200/);
    assert.equal(lines.filter(line => line.includes('[omitted]')).length, 2);
    assert.equal(options.body.payload.data, encoded, 'redaction must not change the outgoing payload');
  } finally { logger.debug = original; }
});
