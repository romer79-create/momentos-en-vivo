'use strict';
// Read-only diagnostic: credentials remain in memory; only selected checkout metadata is printed.
require('./secret-log-redaction.cjs');
const secrets = require('firebase-tools/lib/gcp/secretManager');
const { checkSandboxOrder } = require('./check-sandbox-order.cjs');
const { verifyTestAccount } = require('./configure-payments.cjs');
const { safeCheckoutUrl } = require('../functions/commerce');
const PROJECT = 'momentos-en-vivo', SELLER = '2954695377';

async function checkSandboxPreference(id) {
  const order = await checkSandboxOrder(id);
  if (!order.preferenceId?.startsWith(`${SELLER}-`)) throw new Error('TEST_PREFERENCE_REQUIRED');
  const meta = await secrets.getSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', '1');
  if (meta.state !== 'ENABLED') throw new Error('TEST_SECRET_DISABLED');
  let token = await secrets.accessSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', '1');
  try {
    const account = await verifyTestAccount(token);
    if (account.collectorId !== SELLER) throw new Error('TEST_SELLER_MISMATCH');
    const get = async route => {
      const response = await fetch(`https://api.mercadopago.com${route}`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('PROVIDER_READ_FAILED');
      return response.json();
    };
    const preference = await get(`/checkout/preferences/${encodeURIComponent(order.preferenceId)}`);
    const total = preference.items?.reduce((sum, item) => sum + Math.round(Number(item.unit_price) * 100) * item.quantity, 0);
    if (preference.id !== order.preferenceId || String(preference.collector_id) !== SELLER || preference.external_reference !== id || total !== order.priceCents || !preference.items?.every(item => item.currency_id === 'ARS')) throw new Error('PREFERENCE_MISMATCH');
    const checkout = key => {
      const link = safeCheckoutUrl(preference[key]);
      if (!link || new URL(link).searchParams.get('pref_id') !== preference.id) throw new Error('PREFERENCE_LINK_MISMATCH');
      return link;
    };
    const payments = await get(`/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc&limit=20`);
    const details = [];
    for (const entry of payments.results || []) {
      if (!/^\d+$/.test(String(entry.id))) throw new Error('PAYMENT_ID_INVALID');
      const payment = await get(`/v1/payments/${entry.id}`);
      if (payment.external_reference !== id || String(payment.collector_id) !== SELLER || !/^\d+$/.test(String(payment.payer?.id))) throw new Error('PAYMENT_MISMATCH');
      const buyer = await get(`/users/${payment.payer.id}`);
      details.push({ id: payment.id, status: payment.status, liveMode: payment.live_mode,
        applicationId: payment.application_id == null ? null : String(payment.application_id),
        amountARS: payment.transaction_amount, currency: payment.currency_id,
        buyerMatchesSelectedTestUser: String(buyer.id) === '2954695331',
        buyerHasPublicTestTag: buyer.tags?.includes('test_user') === true, buyerTestTagAvailable: Array.isArray(buyer.tags), buyerSite: buyer.site_id,
        officialTestVisa: payment.card?.first_six_digits === '450995' && payment.card?.last_four_digits === '3704',
        metadataKeys: Object.keys(payment.metadata || {}), operationType: payment.operation_type,
      });
    }
    return { orderId: id, preferenceId: preference.id, sellerVerifiedTest: true,
      applicationId: preference.client_id == null ? null : String(preference.client_id),
      expectedWebhook: preference.notification_url === 'https://momentos-en-vivo.web.app/api/payments/webhook',
      amountARS: total / 100, expired: preference.preference_expired,
      expiresAt: preference.expiration_date_to, initPoint: checkout('init_point'), sandboxInitPoint: checkout('sandbox_init_point'),
      paymentCount: payments.paging?.total ?? payments.results?.length,
      payments: details, readOnly: true };
  } finally { token = ''; }
}
if (require.main === module) checkSandboxPreference(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'SANDBOX_PREFERENCE_CHECK_FAILED' })); process.exitCode = 1;
});
module.exports = { checkSandboxPreference };
