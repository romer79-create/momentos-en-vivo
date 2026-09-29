'use strict';
const { createHash } = require('node:crypto');
const { WebhookSignatureValidator } = require('mercadopago');
const S = require('./security');
const { enqueue, POLICY } = require('./notifications');
const SITE = 'https://momentos-en-vivo.web.app';
const day = 86400000;
const products = require('./offers.json');
const approvedTerms = require('./event-terms.json');
const positive = (value, max) => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= max ? Number(value) : null;
function creditExpiry(at, months = 12) {
  const date = new Date(at), dayOfMonth = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(dayOfMonth, last)); return date.getTime();
}
function paymentSecrets(mode) {
  if (mode === 'live') return ['MERCADO_PAGO_LIVE_ACCESS_TOKEN', 'MERCADO_PAGO_LIVE_WEBHOOK_SECRET'];
  return mode === 'sandbox' ? ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET'] : [];
}
function configuration(env = process.env, emulator = false) {
  const mode = emulator ? 'local' : ['sandbox', 'live'].includes(env.PAYMENTS_MODE) ? env.PAYMENTS_MODE : 'disabled';
  const configured = (key, fallback, max) => env[key] === undefined || env[key] === '' ? fallback : positive(env[key], max);
  const terms = { photoLimit: configured('EVENT_PHOTO_LIMIT', approvedTerms.photoLimit, 3000), receptionHours: configured('EVENT_RECEPTION_HOURS', approvedTerms.receptionHours, 168), downloadDays: configured('EVENT_DOWNLOAD_DAYS', approvedTerms.downloadDays, 365), creditMonths: approvedTerms.creditMonths, retentionPolicy: POLICY };
  const priceKeys = { 'evento-1': 'PRICE_EVENT_1_CENTS', 'pack-3': 'PRICE_PACK_3_CENTS' };
  const plans = products.map(p => ({ ...p, priceCents: p.quoteOnly ? null : configured(priceKeys[p.id], p.priceCents, 1000000000) }));
  const [tokenKey, webhookKey] = paymentSecrets(mode);
  const accessToken = env[tokenKey] || ''; const webhookSecret = env[webhookKey] || '';
  const collectorId = env[mode === 'live' ? 'MERCADO_PAGO_LIVE_COLLECTOR_ID' : 'MERCADO_PAGO_COLLECTOR_ID'] || '';
  const ready = mode === 'local' || (mode !== 'disabled' && accessToken && webhookSecret && /^\d+$/.test(collectorId) && Object.values(terms).every(Boolean));
  return { mode, terms, plans, accessToken, webhookSecret, collectorId: mode === 'local' ? 'local' : collectorId, sandboxBuyerId: env.MERCADO_PAGO_TEST_BUYER_ID || '', providerReady: Boolean(ready) && mode !== 'local', checkoutEnabled: Boolean(ready) && (mode === 'local' || env.PAYMENTS_CHECKOUT_ENABLED === 'true'), sandboxAdminCheckout: mode === 'sandbox' && env.PAYMENTS_SANDBOX_ADMIN === 'true', site: SITE };
}
function safeCheckoutUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.port && ['www.mercadopago.com.ar', 'sandbox.mercadopago.com.ar'].includes(url.hostname) && !url.username && !url.password && url.pathname.startsWith('/checkout/') ? url.href : null; } catch { return null; }
}
function gateway(config, fetchFn = fetch) {
  const verifiedSandboxPayments = new WeakSet();
  let sellerVerification;
  async function call(path, options = {}) {
    let response;
    try { response = await fetchFn(`https://api.mercadopago.com${path}`, { ...options, headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json', ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
    catch { throw new S.HttpError(503, 'Mercado Pago está tardando en responder. Revisá tu compra antes de volver a pagar.'); }
    if (!response.ok) throw new S.HttpError(503, 'No pudimos consultar Mercado Pago. Tu compra quedó guardada para reintentar.');
    return response.json();
  }
  const testProfile = (profile, id) => String(profile?.id) === String(id) && profile?.site_id === 'MLA' && profile?.country_id === 'AR' && profile?.tags?.includes('test_user') === true;
  async function verifySeller() {
    if (!sellerVerification) sellerVerification = (async () => {
      const seller = await call('/users/me');
      S.requireValue(String(seller.id) === config.collectorId && seller.site_id === 'MLA' && seller.country_id === 'AR' && Array.isArray(seller.tags), 409, 'La cuenta vendedora no coincide con la configuración.');
      S.requireValue(config.mode === 'sandbox' ? testProfile(seller, config.collectorId) : config.mode === 'live' && !seller.tags.includes('test_user'), 409, 'La cuenta vendedora no corresponde al modo de cobro.');
    })().catch(error => { sellerVerification = null; throw error; });
    await sellerVerification;
  }
  return {
    async checkout(order) {
      await verifySeller();
      S.requireValue(config.mode !== 'sandbox' || (/^\d+$/.test(config.sandboxBuyerId) && config.sandboxBuyerId !== config.collectorId), 503, 'Falta configurar el comprador de prueba.');
      const result = await call('/checkout/preferences', { method: 'POST', headers: { 'X-Idempotency-Key': order.id }, body: JSON.stringify({
        external_reference: order.id, items: [{ id: order.planId, title: `Momentos en Vivo · ${order.planTitle}`, quantity: 1, currency_id: 'ARS', unit_price: order.priceCents / 100 }],
        back_urls: { success: `${config.site}/pago.html?order=${order.id}`, pending: `${config.site}/pago.html?order=${order.id}`, failure: `${config.site}/pago.html?order=${order.id}` },
        auto_return: 'approved', notification_url: `${config.site}/api/payments/webhook`, expires: true, expiration_date_to: new Date(Date.now() + day).toISOString(),
        metadata: { application: 'momentos-en-vivo', order_id: order.id }
      }) });
      // Current test accounts use the same entry point, with their test identity checked above.
      const checkoutUrl = safeCheckoutUrl(result.init_point);
      S.requireValue(checkoutUrl && result.id, 503, 'No pudimos preparar el enlace de pago. Intentá nuevamente.');
      return { checkoutUrl, preferenceId: String(result.id) };
    },
    async payment(id) {
      await verifySeller();
      const payment = await call(`/v1/payments/${encodeURIComponent(id)}`);
      S.requireValue(String(payment.id) === String(id) && String(payment.collector_id) === config.collectorId, 409, 'El pago no corresponde a esta cuenta vendedora.');
      if (config.mode === 'sandbox' && payment.live_mode === true) {
        // live_mode can be true for test-user purchases through init_point. Verify the
        // seller via /users/me and require the buyer explicitly selected in the test panel.
        // Public buyer profiles omit test tags, so never infer mode from names or metadata.
        const buyerId = String(payment.payer?.id || '');
        S.requireValue(/^\d+$/.test(buyerId) && buyerId !== config.collectorId && buyerId === config.sandboxBuyerId, 409, 'El pago no corresponde al comprador de prueba configurado.');
        verifiedSandboxPayments.add(payment);
      }
      return payment;
    },
    isSandboxPayment: payment => verifiedSandboxPayments.has(payment),
    async search(order) { const data = await call(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc&limit=20`); return data.results || []; }
  };
}
function publicOrder(doc, mode) {
  const o = doc.data ? doc.data() : doc;
  return { id: doc.id || o.id, planId: o.planId, planTitle: o.planTitle, credits: o.credits, priceCents: o.priceCents, currency: o.currency, status: o.status, createdAt: o.createdAt, checkoutUrl: o.checkoutUrl || null, creditedAt: o.creditedAt || null, creditsExpireAt: o.creditsExpireAt || null, terms: o.terms, mode: o.mode || mode };
}
function createCommerce({ db, emulator = false, config = configuration(process.env, emulator), provider = gateway(config), now = () => Date.now(), reportWebhook = record => console.info(JSON.stringify(record)) }) {
  const billingMode = config.mode === 'disabled' ? 'live' : config.mode;
  const walletFor = uid => db.collection('wallets').doc(createHash('sha256').update(`${billingMode}:${uid}`).digest('hex'));
  const expiredLots = uid => db.collection('creditLots').where('ownerId', '==', uid).where('mode', '==', billingMode).where('available', '==', true).where('expiresAt', '<=', now()).orderBy('expiresAt').limit(100);
  async function expireCredits(uid) {
    const count = await db.runTransaction(async tx => {
      const lots = await tx.get(expiredLots(uid)); if (lots.empty) return 0;
      const walletRef = walletFor(uid), wallet = await tx.get(walletRef); let removed = 0;
      for (const lot of lots.docs) {
        const remaining = lot.data().remaining; removed += remaining;
        tx.update(lot.ref, { remaining: 0, available: false, expiredCredits: remaining, expiredAt: new Date(now()).toISOString() });
        tx.create(db.collection('creditLedger').doc(`expire_${lot.id}`), { ownerId: uid, orderId: lot.id, delta: -remaining, reason: 'expiry', createdAt: new Date(now()).toISOString() });
      }
      tx.set(walletRef, { balance: Math.max(0, (wallet.data()?.balance || 0) - removed) }, { merge: true }); return lots.size;
    });
    if (count === 100) S.requireValue((await expiredLots(uid).limit(1).get()).empty, 503, 'Estamos actualizando tu saldo. Volvé a consultar en unos segundos.');
  }
  const balance = async uid => { await expireCredits(uid); return (await walletFor(uid).get()).data()?.balance || 0; };
  const canCheckout = testAdmin => config.checkoutEnabled || (testAdmin === true && config.mode === 'sandbox' && config.providerReady && config.sandboxAdminCheckout === true);
  const catalog = (testAdmin = false) => ({ mode: canCheckout(testAdmin) ? config.mode : 'disabled', checkoutEnabled: canCheckout(testAdmin), plans: config.plans, terms: config.terms });
  const orderRef = id => db.collection('orders').doc(S.identifier(id));
  async function ownOrder(uid, id) { const doc = await orderRef(id).get(); S.requireValue(doc.exists && doc.data().ownerId === uid, 404, 'Compra no disponible.'); return { id: doc.id, ...doc.data() }; }
  async function billing(uid, testAdmin = false) {
    await expireCredits(uid);
    const [wallet, orders] = await Promise.all([walletFor(uid).get(), db.collection('orders').where('ownerId', '==', uid).orderBy('createdAt', 'desc').limit(50).get()]);
    return { balance: wallet.data()?.balance || 0, mode: catalog(testAdmin).mode, orders: orders.docs.map(d => publicOrder(d, catalog(testAdmin).mode)) };
  }
  async function createOrder(uid, data, testAdmin = false) {
    S.requireValue(canCheckout(testAdmin), 503, 'Las compras todavía no están disponibles. Podés preparar tu evento como borrador.');
    S.requireValue(data && typeof data === 'object', 400, 'Ingresá una compra válida.');
    S.requireValue(typeof data.id === 'string' && /^[a-f0-9-]{36}$/.test(data.id), 400, 'Identificador de compra inválido.');
    const plan = config.plans.find(p => p.id === data.planId); S.requireValue(plan?.priceCents, 400, 'Este plan todavía no está disponible.');
    const ref = orderRef(data.id); const at = now();
    await db.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) { S.requireValue(existing.data().ownerId === uid && existing.data().planId === plan.id && existing.data().mode === config.mode, 409, 'No se pudo recuperar esa compra.'); return; }
      const quota = db.collection('billingLimits').doc(createHash('sha256').update(`${uid}:${Math.floor(at / day)}`).digest('hex')); const snap = await tx.get(quota);
      S.requireValue((snap.data()?.count || 0) < 20, 429, 'Tenés muchas compras iniciadas. Revisalas antes de crear otra.');
      tx.set(quota, { count: (snap.data()?.count || 0) + 1, expiresAt: new Date(at + 2 * day) });
      tx.create(ref, { ownerId: uid, planId: plan.id, planTitle: plan.title, credits: plan.credits, priceCents: plan.priceCents, currency: plan.currency, terms: config.terms, status: 'pending', createdAt: new Date(at).toISOString(), mode: config.mode, nextCheckAt: at + 600000, checkoutLeaseUntil: 0 });
    });
    let order = await ownOrder(uid, data.id);
    if (config.mode === 'local' || order.status !== 'pending' || order.checkoutUrl) return publicOrder(order, config.mode);
    let createCheckout = false;
    await db.runTransaction(async tx => { createCheckout = false; const doc = await tx.get(ref); if (doc.data().checkoutUrl || doc.data().status !== 'pending') return; S.requireValue((doc.data().checkoutLeaseUntil || 0) <= now(), 409, 'Estamos preparando esta compra. Reintentá en unos segundos.'); createCheckout = true; tx.update(ref, { checkoutLeaseUntil: now() + 30000 }); });
    if (!createCheckout) return publicOrder(await ownOrder(uid, data.id), config.mode);
    try { const checkout = await provider.checkout(order); await ref.update({ ...checkout, checkoutLeaseUntil: 0 }); }
    catch (error) { await ref.update({ checkoutLeaseUntil: 0 }).catch(() => {}); throw error; }
    return publicOrder(await ownOrder(uid, data.id), config.mode);
  }
  async function applyPayment(payment) {
    // An account can receive unrelated payments; only our UUID references apply.
    if (typeof payment.external_reference !== 'string' || !/^[a-f0-9-]{36}$/.test(payment.external_reference)) return { ignored: true };
    const id = S.identifier(String(payment.id)); const reference = S.identifier(payment.external_reference);
    const ref = orderRef(reference); const payRef = db.collection('payments').doc(`mp_${id}`);
    const stamp = Date.parse(payment.date_last_updated || payment.date_created); S.requireValue(Number.isFinite(stamp), 400, 'Fecha de pago inválida.');
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return { ignored: true };
      const order = snap.data();
      const matchesMode = payment.live_mode === (config.mode === 'live') || (config.mode === 'sandbox' && payment.live_mode === true && provider.isSandboxPayment?.(payment) === true);
      S.requireValue(order.mode === config.mode && String(payment.collector_id) === config.collectorId && matchesMode && payment.currency_id === 'ARS' && Number.isFinite(Number(payment.transaction_amount)) && Math.round(Number(payment.transaction_amount) * 100) === order.priceCents, 409, 'El pago no coincide con la compra.');
      const walletRef = walletFor(order.ownerId); const lotRef = db.collection('creditLots').doc(snap.id);
      const [previous, wallet, lot] = await Promise.all([tx.get(payRef), tx.get(walletRef), tx.get(lotRef)]);
      S.requireValue(!previous.exists || previous.data().orderId === snap.id, 409, 'Ese pago ya corresponde a otra compra.');
      if (previous.exists && previous.data().providerUpdatedAt > stamp) return { stale: true };
      const balance = wallet.data()?.balance || 0; const remaining = lot.data()?.remaining || 0;
      const reversed = ['refunded', 'charged_back'].includes(payment.status) || Number(payment.transaction_amount_refunded || 0) > 0;
      const terminal = ['refunded', 'charged_back', 'review'].includes(order.status);
      const paid = payment.status === 'approved' && !reversed;
      const record = { orderId: snap.id, ownerId: order.ownerId, status: payment.status, mode: order.mode, providerLiveMode: payment.live_mode, verifiedSandboxAccounts: config.mode === 'sandbox' && provider.isSandboxPayment?.(payment) === true, providerUpdatedAt: stamp, checkedAt: new Date(now()).toISOString() };
      tx.set(payRef, record);
      if (reversed && (!order.creditedPaymentId || order.creditedPaymentId === id)) {
        const status = ['refunded', 'charged_back'].includes(payment.status) ? payment.status : 'review';
        if (remaining) { tx.update(lotRef, { remaining: 0, available: false }); tx.set(walletRef, { balance: Math.max(0, balance - remaining) }, { merge: true }); tx.set(db.collection('creditLedger').doc(`reverse_${snap.id}`), { ownerId: order.ownerId, orderId: snap.id, delta: -remaining, reason: status, createdAt: new Date(now()).toISOString() }); }
        tx.update(ref, { status, nextCheckAt: null });
        if (!terminal && (order.creditedPaymentId || status === 'review')) tx.set(db.collection('billingIncidents').doc(`reversal_${id}`), { ownerId: order.ownerId, orderId: snap.id, reason: status, consumedCredits: order.creditedPaymentId ? order.credits - remaining - (lot.data()?.expiredCredits || 0) : 0, createdAt: new Date(now()).toISOString(), resolved: false });
        return { status };
      }
      if (paid && !terminal && !order.creditedPaymentId) {
        tx.set(walletRef, { balance: balance + order.credits }, { merge: true });
        const expiresAt = order.terms.creditMonths ? creditExpiry(now(), order.terms.creditMonths) : null;
        tx.create(lotRef, { ownerId: order.ownerId, mode: billingMode, remaining: order.credits, available: true, terms: order.terms, createdAt: order.createdAt, orderId: snap.id, ...(expiresAt ? { expiresAt } : {}) });
        tx.create(db.collection('creditLedger').doc(`purchase_${snap.id}`), { ownerId: order.ownerId, orderId: snap.id, delta: order.credits, reason: 'purchase', createdAt: new Date(now()).toISOString() });
        tx.update(ref, { status: 'approved', creditedPaymentId: id, creditedAt: new Date(now()).toISOString(), creditsExpireAt: expiresAt ? new Date(expiresAt).toISOString() : null, nextCheckAt: now() + day });
        enqueue(tx, db, 'purchase', snap.id, order.ownerId, '', now());
        return { credited: order.credits };
      }
      if (paid && order.creditedPaymentId && order.creditedPaymentId !== id) tx.set(db.collection('billingIncidents').doc(`duplicate_${id}`), { ownerId: order.ownerId, orderId: snap.id, reason: 'duplicate_payment', createdAt: new Date(now()).toISOString(), resolved: false });
      if (!terminal && !order.creditedPaymentId) tx.update(ref, { status: ['rejected', 'cancelled'].includes(payment.status) ? 'rejected' : 'pending', nextCheckAt: now() + 3600000 });
      return { duplicate: true };
    });
  }
  async function simulate(uid, id, status) {
    S.requireValue(emulator && config.mode === 'local', 404, 'Operación no disponible.');
    S.requireValue(['approved', 'pending', 'rejected'].includes(status), 400, 'Estado inválido.'); const order = await ownOrder(uid, id);
    await applyPayment({ id: `local-${id}`, external_reference: id, collector_id: 'local', live_mode: false, currency_id: 'ARS', transaction_amount: order.priceCents / 100, status, date_last_updated: new Date(now()).toISOString() });
    return publicOrder(await ownOrder(uid, id), config.mode);
  }
  async function refresh(uid, id, scheduled = false) {
    const order = await ownOrder(uid, id); if (!config.providerReady || order.mode !== config.mode || ['refunded', 'charged_back', 'review'].includes(order.status)) return publicOrder(order, catalog().mode);
    let run = false;
    await db.runTransaction(async tx => { run = false; const doc = await tx.get(orderRef(id)); if ((doc.data().lastCheckAt || 0) + 15000 > now()) return; run = true; tx.update(doc.ref, { lastCheckAt: now(), nextCheckAt: now() + (order.status === 'approved' ? day : 3600000) }); });
    if (run) {
      try { for (const payment of await provider.search(order)) { if (String(payment.external_reference) === id) await applyPayment(await provider.payment(String(payment.id))); } }
      catch (err) { if (!scheduled) throw err; await db.collection('billingIncidents').doc(`reconcile_${id}`).set({ ownerId: uid, orderId: id, reason: 'reconciliation_failed', createdAt: new Date(now()).toISOString(), resolved: false }); }
    }
    return publicOrder(await ownOrder(uid, id), config.mode);
  }
  async function webhook(req) {
    let stage = 'configuration', signatureVerified = false;
    const report = (status, outcome) => {
      // Only fixed categories and booleans: never log bodies, identifiers, headers or secrets.
      const record = { event: 'payment_webhook', stage, status, outcome, signatureVerified,
        signaturePresent: Boolean(req.headers?.['x-signature']), requestIdPresent: Boolean(req.headers?.['x-request-id']),
        format: req.query?.topic === 'payment' ? 'legacy_ipn' : (req.query?.type || req.body?.type) === 'payment' ? 'payment' : 'other' };
      try { reportWebhook(record); } catch { /* Diagnostics must not change payment handling. */ }
    };
    try {
      S.requireValue(config.providerReady, 503, 'Cobros no configurados.');
      stage = 'envelope';
      const id = req.query['data.id'];
      S.requireValue(typeof id === 'string' && /^\d+$/.test(id) && (req.query.type || req.body?.type) === 'payment', 400, 'Notificación inválida.');
      if (req.body?.data?.id != null) S.requireValue(String(req.body.data.id) === id, 400, 'Notificación inconsistente.');
      stage = 'signature';
      try { WebhookSignatureValidator.validate({ xSignature: req.headers['x-signature'], xRequestId: req.headers['x-request-id'], dataId: id, secret: config.webhookSecret }); }
      catch { throw new S.HttpError(401, 'Firma inválida.'); }
      signatureVerified = true; stage = 'lookup';
      const payment = await provider.payment(id);
      stage = 'apply';
      const result = await applyPayment(payment);
      stage = 'complete';
      report(200, result.credited ? 'credited' : result.ignored ? 'ignored' : result.stale ? 'stale' : 'processed');
      return { received: true };
    } catch (error) {
      report([400, 401, 409, 503].includes(error.status) ? error.status : 500, 'failed');
      throw error;
    }
  }
  const availableLots = ownerId => db.collection('creditLots').where('ownerId', '==', ownerId).where('mode', '==', billingMode).where('available', '==', true).orderBy('createdAt', 'asc').limit(1);
  async function prepareActivation(uid, id, admin) {
    const event = (await db.collection('events').doc(S.identifier(id)).get()).data();
    S.requireValue(event && (event.ownerId === uid || admin), 404, 'Evento no disponible.'); await expireCredits(event.ownerId);
  }
  function activationQuote(event, lot) {
    const data = lot.data(); const start = Date.parse(event.startsAt); const until = start + data.terms.receptionHours * 3600000;
    S.requireValue(!data.expiresAt || data.expiresAt > now(), 409, 'El saldo de esta compra venció. Actualizá el panel.');
    S.requireValue(data.remaining > 0 && Number.isFinite(start) && until > now(), 400, 'La fecha ya pasó o el saldo cambió. Revisá el evento antes de activar.');
    const details = { name: event.name || 'Tu evento', startsAt: event.startsAt, themeVersion: event.themeVersion || 0, autoApprove: event.autoApprove === true, orderId: lot.id, limits: data.terms, receivesUntil: new Date(until).toISOString(), downloadUntil: new Date(until + data.terms.downloadDays * day).toISOString() };
    return { ...details, reviewToken: createHash('sha256').update(JSON.stringify(details)).digest('hex') };
  }
  async function previewActivation(uid, id, admin = false) {
    await prepareActivation(uid, id, admin);
    return db.runTransaction(async tx => {
      const snap = await tx.get(db.collection('events').doc(S.identifier(id))); const event = snap.data();
      S.requireValue(event && (event.ownerId === uid || admin), 404, 'Evento no disponible.');
      S.requireValue(event.status === 'draft' && !event.activatedAt, 409, 'Este evento ya no es un borrador. Actualizá tu panel.');
      const wallet = await tx.get(walletFor(event.ownerId));
      S.requireValue((wallet.data()?.balance || 0) > 0, 402, 'Necesitás comprar un evento para activarlo.');
      const lots = await tx.get(availableLots(event.ownerId));
      S.requireValue(!lots.empty, 409, 'No pudimos verificar tu saldo. Contactá a soporte.');
      return { ...activationQuote(event, lots.docs[0]), creditsAfter: wallet.data().balance - 1 };
    });
  }
  async function activate(uid, id, admin = false, reviewToken) {
    await prepareActivation(uid, id, admin);
    const eventRef = db.collection('events').doc(S.identifier(id));
    return db.runTransaction(async tx => {
      const snap = await tx.get(eventRef); const event = snap.data(); S.requireValue(event && (event.ownerId === uid || admin), 404, 'Evento no disponible.');
      if (event.activatedAt) { S.requireValue(event.billingMode === billingMode, 409, 'Este evento pertenece a otro ambiente. Prepará un nuevo borrador.'); return { ok: true, alreadyActivated: true }; }
      S.requireValue(event.status === 'draft', 409, 'El evento no está listo para activar.');
      const walletRef = walletFor(event.ownerId); const wallet = await tx.get(walletRef);
      S.requireValue((wallet.data()?.balance || 0) > 0, 402, 'Necesitás comprar un evento para activarlo.');
      const lots = await tx.get(availableLots(event.ownerId));
      S.requireValue(!lots.empty, 409, 'No pudimos verificar tu saldo. Contactá a soporte.');
      const lot = lots.docs[0]; const data = lot.data(); const quote = activationQuote(event, lot);
      S.requireValue(reviewToken === undefined || reviewToken === quote.reviewToken, 409, 'Los datos o las condiciones cambiaron. Volvé a revisar antes de activar.');
      tx.update(lot.ref, { remaining: data.remaining - 1, available: data.remaining > 1 });
      tx.update(walletRef, { balance: wallet.data().balance - 1 });
      tx.create(db.collection('creditLedger').doc(`activate_${id}`), { ownerId: event.ownerId, eventId: id, orderId: lot.id, delta: -1, reason: 'activation', createdAt: new Date(now()).toISOString() });
      tx.update(eventRef, { status: 'active', billingMode, activatedAt: new Date(now()).toISOString(), automationVersion: 'self-service-v1', purgePending: data.terms.retentionPolicy === POLICY, cleanupCheckAt: Date.parse(quote.downloadUntil), creditOrderId: lot.id, limits: data.terms, receivesUntil: quote.receivesUntil, downloadUntil: quote.downloadUntil });
      return { ok: true, alreadyActivated: false };
    });
  }
  async function maintenance() {
    const expired = await db.collection('creditLots').where('mode', '==', billingMode).where('available', '==', true).where('expiresAt', '<=', now()).orderBy('expiresAt').limit(25).get();
    for (const uid of new Set(expired.docs.map(d => d.data().ownerId))) await expireCredits(uid);
    if (config.providerReady) {
      const due = await db.collection('orders').where('mode', '==', config.mode).where('nextCheckAt', '>', 0).where('nextCheckAt', '<=', now()).orderBy('nextCheckAt').limit(25).get();
      for (const order of due.docs) await refresh(order.data().ownerId, order.id, true);
    }
    const events = await db.collection('events').where('status', '==', 'active').where('receivesUntil', '<=', new Date(now()).toISOString()).limit(100).get();
    const batch = db.batch(); for (const event of events.docs) batch.update(event.ref, { status: 'closed' }); if (!events.empty) await batch.commit();
  }
  return { catalog, billingMode, balance, billing, createOrder, ownOrder: async (uid, id) => publicOrder(await ownOrder(uid, id), catalog().mode), applyPayment, simulate, refresh, webhook, previewActivation, activate, maintenance };
}
module.exports = { createCommerce, configuration, paymentSecrets, safeCheckoutUrl, publicOrder, creditExpiry, gateway };
