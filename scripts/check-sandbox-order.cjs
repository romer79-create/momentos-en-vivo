'use strict';
// Read-only verification of one sandbox order owned by the configured proprietor.
require('./secret-log-redaction.cjs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const r = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { Firestore } = r('@google-cloud/firestore');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const firebaseApi = require('firebase-tools/lib/api');
const authApi = require('firebase-tools/lib/gcp/auth');
const { messageId } = require('../functions/notifications');
const { safeCheckoutUrl } = require('../functions/commerce');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';

async function checkSandboxOrder(id) {
  if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('ORDER_ID_REQUIRED');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('EMULATOR_CONFIG_PRESENT');
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  const owner = await authApi.findUser(PROJECT, OWNER);
  const credentials = { type: 'authorized_user', client_id: firebaseApi.clientId(), client_secret: firebaseApi.clientSecret(), refresh_token: account.tokens.refresh_token };
  const db = new Firestore({ projectId: PROJECT, credentials, preferRest: true });
  try {
    const order = (await db.collection('orders').doc(id).get()).data();
    if (!owner.uid || !order || order.mode !== 'sandbox' || order.ownerId !== owner.uid) throw new Error('OWNER_SANDBOX_ORDER_REQUIRED');
    const walletId = createHash('sha256').update(`sandbox:${order.ownerId}`).digest('hex');
    const [wallet, lot, ledger, mail, payments, incidents] = await Promise.all([
      db.collection('wallets').doc(walletId).get(),
      db.collection('creditLots').doc(id).get(),
      db.collection('creditLedger').doc(`purchase_${id}`).get(),
      db.collection('mailOutbox').doc(messageId('purchase', id)).get(),
      db.collection('payments').where('orderId', '==', id).select('status', 'mode', 'providerLiveMode', 'verifiedSandboxAccounts', 'checkedAt', 'providerUpdatedAt').get(),
      db.collection('billingIncidents').where('orderId', '==', id).select('reason', 'resolved').get(),
    ]);
    return { orderId: id, mode: order.mode, plan: order.planId, status: order.status,
      priceCents: order.priceCents, currency: order.currency, credits: order.credits,
      checkoutPrepared: Boolean(order.preferenceId && order.checkoutUrl),
      checkoutHost: order.checkoutUrl ? new URL(order.checkoutUrl).hostname : null,
      checkoutUrl: order.checkoutUrl ? safeCheckoutUrl(order.checkoutUrl) : null,
      preferenceId: order.preferenceId || null, paymentId: order.creditedPaymentId || null,
      lastRefreshAt: order.lastCheckAt ? new Date(order.lastCheckAt).toISOString() : null,
      balance: wallet.data()?.balance || 0, creditedUnits: ledger.data()?.delta || 0,
      remainingUnits: lot.data()?.remaining || 0, creditsExpireAt: order.creditsExpireAt || null,
      paymentRecords: payments.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      purchaseEmail: mail.exists ? { state: mail.data().state, attempts: mail.data().attempts } : null,
      incidents: incidents.docs.map(doc => doc.data()), readOnly: true };
  } finally { await db.terminate(); }
}
if (require.main === module) checkSandboxOrder(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => {
  const code = /^[A-Z_]{1,48}$/.test(error.message || '') ? error.message : 'SANDBOX_ORDER_CHECK_FAILED';
  console.error(JSON.stringify({ status: 'failed', code })); process.exitCode = 1;
});
module.exports = { checkSandboxOrder };
