'use strict';
require('./secret-log-redaction.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeWebhookSecret } = require('./configure-webhook.cjs');
const { storeProjectSecret } = require('./store-project-secret.cjs');
const envFile = path.resolve(__dirname, '../functions/.env.momentos-en-vivo');

function normalizeLiveToken(value) {
  const token = String(value).trim();
  if (!/^APP_USR-[a-zA-Z0-9_-]{20,2000}$/.test(token)) {
    throw new Error('Copia el Access Token completo de Productivas, no la Public Key ni la clave de Webhooks.');
  }
  return token;
}

function requireLiveSetupPaused(text) {
  const values = key => [...text.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*([^\\r\\n#]*)`, 'gm'))]
    .map(match => match[1].trim().replace(/^["']|["']$/g, ''));
  const modes = values('PAYMENTS_MODE'), checkout = values('PAYMENTS_CHECKOUT_ENABLED');
  if (modes.length !== 1 || !['disabled', 'sandbox'].includes(modes[0]) || checkout.length !== 1 || checkout[0] !== 'false') {
    throw new Error('Este asistente solo prepara claves nuevas con las ventas desactivadas y sin reemplazar una integracion productiva. No se guardo ninguna clave.');
  }
}

async function verifyLiveAccount(value, fetchFn = fetch) {
  const token = normalizeLiveToken(value);
  let response, profile;
  try {
    response = await fetchFn('https://api.mercadopago.com/users/me', {
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('No se pudo conectar con Mercado Pago. No se guardo el token.'); }
  if (!response.ok) throw new Error('Mercado Pago no acepto la credencial productiva. No se guardo el token.');
  try { profile = await response.json(); }
  catch { throw new Error('Mercado Pago devolvio una respuesta inesperada. No se guardo el token.'); }
  if (!Array.isArray(profile?.tags) || profile.tags.includes('test_user')) {
    throw new Error('No pudimos confirmar una cuenta vendedora real. No se guardo el token.');
  }
  if (profile.site_id !== 'MLA' || profile.country_id !== 'AR') {
    throw new Error('La cuenta vendedora no corresponde a Argentina. No se guardo el token.');
  }
  if (!Number.isSafeInteger(profile.id) || profile.id <= 0) throw new Error('El identificador de la cuenta no es valido. No se guardo el token.');
  return { collectorId: String(profile.id), country: 'AR', test: false };
}

async function configureLiveCredentials(tokenValue, webhookValue, {
  readConfig = () => fs.readFileSync(envFile, 'utf8'), verify = verifyLiveAccount, store = storeProjectSecret,
} = {}) {
  requireLiveSetupPaused(readConfig());
  const token = normalizeLiveToken(tokenValue), webhook = normalizeWebhookSecret(webhookValue);
  const account = await verify(token);
  requireLiveSetupPaused(readConfig());
  try {
    await store('MERCADO_PAGO_LIVE_ACCESS_TOKEN', token);
    requireLiveSetupPaused(readConfig());
    await store('MERCADO_PAGO_LIVE_WEBHOOK_SECRET', webhook);
  } catch {
    throw new Error('No se confirmo el guardado de las dos claves productivas. Los cobros siguen desactivados; revisemos antes de publicar. Las claves de prueba se conservaron.');
  }
  return account;
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este archivo en una terminal interactiva. Las claves se ingresan ocultas.');
  requireLiveSetupPaused(fs.readFileSync(envFile, 'utf8'));
  const { password } = require('@inquirer/prompts');
  console.log('Momentos en Vivo - preparar Mercado Pago PRODUCTIVO');
  console.log('Usa tu aplicacion Momentos en Vivo (2940830163173): Access Token de Productivas y clave secreta de Webhooks.');
  console.log('Consulta la cuenta real y guarda dos claves nuevas en Firebase. Conserva las claves de prueba.');
  console.log('No hace pagos, no publica y no habilita ventas. No pegues las claves en el chat.');
  let token = '', webhook = '';
  try {
    token = await password({ message: 'Access Token de PRODUCTIVAS (ingreso oculto):', mask: '*',
      validate: value => { try { normalizeLiveToken(value); return true; } catch (error) { return error.message; } },
    });
    webhook = await password({ message: 'Clave secreta de WEBHOOKS (ingreso oculto):', mask: '*',
      validate: value => { try { normalizeWebhookSecret(value); return true; } catch (error) { return error.message; } },
    });
    const account = await configureLiveCredentials(token, webhook);
    console.log(JSON.stringify({ status: 'LIVE_SECRETS_STORED', ...account, checkoutEnabled: false }));
    console.log('Claves productivas guardadas. Falta verificar las notificaciones y publicar el cambio de modo.');
  } finally { token = ''; webhook = ''; }
}
if (require.main === module) main().catch(error => {
  console.error(error.name === 'ExitPromptError' ? 'Operacion cancelada; no se habilitaron ventas.' : error.message);
  process.exitCode = 1;
});
module.exports = { normalizeLiveToken, requireLiveSetupPaused, verifyLiveAccount, configureLiveCredentials };
