'use strict';
// Prepare ONE owner-only ARS 100 validation order. This script never pays or refunds it.
require('./secret-log-redaction.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const firebaseApi = require('firebase-tools/lib/api');
const authApi = require('firebase-tools/lib/gcp/auth');
const secrets = require('firebase-tools/lib/gcp/secretManager');
const r = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { Firestore } = r('@google-cloud/firestore');
const { configuration, gateway, safeCheckoutUrl } = require('../functions/commerce');
const { verifyLiveAccount } = require('./configure-live-payments.cjs');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com', APPLICATION = '2940830163173';
const recordFile = path.resolve(__dirname, '../output/releases/live-validation-order-20260929.json');

async function prepareValidation({ db, ownerId, config, provider, id, now = Date.now() }) {
  if (config.mode !== 'live' || config.checkoutEnabled || !config.providerReady || !ownerId || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('LIVE_VALIDATION_SETUP_REQUIRED');
  const ref = db.collection('orders').doc(id);
  let order = (await ref.get()).data();
  if (order && (order.ownerId !== ownerId || order.mode !== 'live' || order.validation !== true || order.priceCents !== 10000 || order.credits !== 1)) throw new Error('VALIDATION_ORDER_MISMATCH');
  if (!order) {
    order = { ownerId, mode: 'live', validation: true, planId: 'validacion-conexion', planTitle: 'Validación de conexión · cobro real de $100', priceCents: 10000, currency: 'ARS', credits: 1, terms: config.terms, status: 'pending', createdAt: new Date(now).toISOString(), nextCheckAt: now + 600000, checkoutLeaseUntil: 0 };
    await ref.create(order);
  }
  if (order.status !== 'pending') throw new Error('VALIDATION_ALREADY_PROCESSED');
  if (!order.checkoutUrl) {
    const checkout = await provider.checkout({ id, ...order });
    if (!safeCheckoutUrl(checkout.checkoutUrl) || !checkout.preferenceId) throw new Error('VALIDATION_CHECKOUT_INVALID');
    await ref.update(checkout); order = { ...order, ...checkout };
  }
  return { orderId: id, amountARS: 100, currency: 'ARS', mode: 'live', paymentCreated: false, checkoutUrl: safeCheckoutUrl(order.checkoutUrl), preferenceId: order.preferenceId, returnUrl: `https://${PROJECT}.web.app/pago.html?order=${id}` };
}

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('EMULATOR_CONFIG_PRESENT');
  const parsed = require('firebase-tools/lib/functions/env').parse(fs.readFileSync(path.resolve(__dirname, '../functions/.env.momentos-en-vivo'), 'utf8'));
  if (parsed.errors.length) throw new Error('INVALID_LOCAL_CONFIG');
  const env = parsed.envs;
  if (env.PAYMENTS_MODE !== 'live' || env.PAYMENTS_CHECKOUT_ENABLED !== 'false') throw new Error('LIVE_CHECKOUT_MUST_BE_PAUSED');
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  const owner = await authApi.findUser(PROJECT, OWNER);
  if (!owner.uid || !owner.emailVerified || owner.disabled) throw new Error('VERIFIED_OWNER_REQUIRED');
  let token = '', webhook = '', db;
  try {
    token = await secrets.accessSecretVersion(PROJECT, 'MERCADO_PAGO_LIVE_ACCESS_TOKEN', '1');
    webhook = await secrets.accessSecretVersion(PROJECT, 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET', '1');
    const seller = await verifyLiveAccount(token);
    if (seller.collectorId !== env.MERCADO_PAGO_LIVE_COLLECTOR_ID) throw new Error('LIVE_SELLER_MISMATCH');
    const config = configuration({ ...env, MERCADO_PAGO_LIVE_ACCESS_TOKEN: token, MERCADO_PAGO_LIVE_WEBHOOK_SECRET: webhook });
    const fetchChecked = async (url, args) => {
      const response = await fetch(url, args);
      if (url === 'https://api.mercadopago.com/checkout/preferences' && response.ok) {
        const preference = await response.json();
        if (String(preference.client_id) !== APPLICATION || String(preference.collector_id) !== seller.collectorId) throw new Error('LIVE_APPLICATION_MISMATCH');
        return { ok: true, json: async () => preference };
      }
      return response;
    };
    const credentials = { type: 'authorized_user', client_id: firebaseApi.clientId(), client_secret: firebaseApi.clientSecret(), refresh_token: account.tokens.refresh_token };
    db = new Firestore({ projectId: PROJECT, credentials, preferRest: true });
    let id;
    if (fs.existsSync(recordFile)) id = JSON.parse(fs.readFileSync(recordFile, 'utf8')).orderId;
    else {
      id = randomUUID(); fs.mkdirSync(path.dirname(recordFile), { recursive: true });
      fs.writeFileSync(recordFile, JSON.stringify({ orderId: id, purpose: 'owner-only-live-validation', amountARS: 100 }), { flag: 'wx' });
    }
    const result = await prepareValidation({ db, ownerId: owner.uid, config, provider: gateway(config, fetchChecked), id });
    console.log(JSON.stringify({ ...result, applicationId: APPLICATION, sellerVerifiedReal: true, publicCheckoutEnabled: false }));
  } finally { token = ''; webhook = ''; if (db) await db.terminate(); }
}
if (require.main === module) main().catch(error => {
  const codes = new Set(['INVALID_LOCAL_CONFIG', 'LIVE_CHECKOUT_MUST_BE_PAUSED', 'OWNER_SESSION_MISSING', 'VERIFIED_OWNER_REQUIRED', 'LIVE_SELLER_MISMATCH', 'LIVE_APPLICATION_MISMATCH', 'LIVE_VALIDATION_SETUP_REQUIRED', 'VALIDATION_ORDER_MISMATCH', 'VALIDATION_ALREADY_PROCESSED', 'VALIDATION_CHECKOUT_INVALID']);
  console.error(JSON.stringify({ status: 'failed', code: codes.has(error.message) ? error.message : 'LIVE_VALIDATION_PREPARATION_FAILED', paymentCreated: false })); process.exitCode = 1;
});
module.exports = { prepareValidation };
