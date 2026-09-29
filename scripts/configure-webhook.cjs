'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { requirePaymentsDisabled } = require('./configure-payments.cjs');
const { storeProjectSecret } = require('./store-project-secret.cjs');
const envFile = path.resolve(__dirname, '../functions/.env.momentos-en-vivo');

function normalizeWebhookSecret(value) {
  const secret = String(value).trim();
  if (!/^[\x21-\x7e]{16,512}$/.test(secret) || /^(APP_USR|TEST)-/.test(secret)) {
    throw new Error('Pega la clave secreta de Webhooks completa, no el Access Token ni la Public Key.');
  }
  return secret;
}

async function configureWebhook(value, { readConfig = () => fs.readFileSync(envFile, 'utf8'), store = storeProjectSecret } = {}) {
  requirePaymentsDisabled(readConfig());
  await store('MERCADO_PAGO_WEBHOOK_SECRET', normalizeWebhookSecret(value));
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este archivo en una terminal interactiva. La clave se ingresa oculta.');
  requirePaymentsDisabled(fs.readFileSync(envFile, 'utf8'));
  const { password } = require('@inquirer/prompts');
  console.log('Momentos en Vivo - notificaciones de Mercado Pago');
  console.log('Usa la clave secreta generada al guardar Webhooks en la aplicacion Momentos en Vivo.');
  console.log('Este paso guarda la clave; no publica, no hace pagos y no habilita cobros.');
  let secret = await password({ message: 'Pega la clave secreta de Webhooks (ingreso oculto):', mask: '*',
    validate: value => { try { normalizeWebhookSecret(value); return true; } catch (error) { return error.message; } },
  });
  try { await configureWebhook(secret); }
  finally { secret = ''; }
  console.log('Clave de Webhooks guardada. Falta publicar el receptor y probar una notificacion real.');
}
if (require.main === module) main().catch(error => {
  console.error(error.name === 'ExitPromptError' ? 'Operacion cancelada; no se guardo ninguna clave.' : error.message);
  process.exitCode = 1;
});
module.exports = { normalizeWebhookSecret, configureWebhook };
