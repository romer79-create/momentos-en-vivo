'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { normalizeWebhookSecret, configureWebhook } = require('../scripts/configure-webhook.cjs');
const { storeProjectSecret } = require('../scripts/store-project-secret.cjs');
const secret = 'fixture-webhook-signing-key-12345678';

test('webhook setup rejects tokens and malformed keys before storing anything', async () => {
  assert.equal(normalizeWebhookSecret(` ${secret}\n`), secret);
  for (const value of ['', 'short', `APP_USR-${secret}`, `TEST-${secret}`, 'x'.repeat(513), `${secret}\n${secret}`]) {
    let stored = false;
    await assert.rejects(configureWebhook(value, {
      readConfig: () => 'PAYMENTS_MODE=disabled', store: async () => { stored = true; },
    }), /clave secreta/);
    assert.equal(stored, false);
  }
});

test('webhook setup refuses credential replacement while local payments are enabled', async () => {
  for (const mode of ['sandbox', 'live', 'unknown']) {
    let stored = false;
    await assert.rejects(configureWebhook(secret, {
      readConfig: () => `PAYMENTS_MODE=${mode}`, store: async () => { stored = true; },
    }), /habilitados/);
    assert.equal(stored, false);
  }
});

test('webhook key uses only stdin and the fixed project/account, without deployment', async () => {
  let received = '', stores = 0;
  await configureWebhook(` ${secret} `, {
    readConfig: () => 'PAYMENTS_MODE=disabled',
    store: (name, value) => storeProjectSecret(name, value, (executable, args, options) => {
      stores++;
      assert.equal(executable, process.execPath);
      assert.equal(name, 'MERCADO_PAGO_WEBHOOK_SECRET');
      assert.ok(!JSON.stringify({ args, options }).includes(secret));
      assert.equal(args[args.indexOf('--project') + 1], 'momentos-en-vivo');
      assert.equal(args[args.indexOf('--account') + 1], 'sylar.soluciones@gmail.com');
      assert.equal(args[args.indexOf('--data-file') + 1], '-');
      assert.ok(args.includes('--non-interactive'));
      assert.ok(args.some(arg => arg.endsWith('secret-log-redaction.cjs')));
      assert.ok(!args.includes('--force')); assert.ok(!args.includes('deploy'));
      assert.deepEqual(options.stdio, ['pipe', 'inherit', 'inherit']);
      assert.equal(options.windowsHide, true);
      const child = new EventEmitter();
      child.stdin = new Writable({ write(chunk, encoding, done) { received += chunk.toString(); done(); } });
      child.stdin.once('finish', () => child.emit('close', 0));
      return child;
    }),
  });
  assert.equal(stores, 1); assert.equal(received, secret);
});

test('storage rejects unknown secret names and never reports success on child failure', async () => {
  assert.throws(() => storeProjectSecret('UNRELATED_SECRET', secret, () => assert.fail('must not spawn')), /no permitido/);
  for (const failure of ['close', 'error', 'stdin']) {
    await assert.rejects(configureWebhook(secret, {
      readConfig: () => 'PAYMENTS_MODE=disabled',
      store: (name, value) => storeProjectSecret(name, value, () => {
        const child = new EventEmitter();
        child.stdin = new Writable({ write(chunk, encoding, done) { done(); } });
        child.stdin.once('finish', () => {
          if (failure === 'close') child.emit('close', 1);
          else if (failure === 'error') child.emit('error', new Error(secret));
          else child.stdin.emit('error', new Error(secret));
        });
        return child;
      }),
    }), error => !error.message.includes(secret) && /No se|no confirmo/.test(error.message));
  }
});
