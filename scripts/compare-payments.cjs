'use strict';
// Read-only comparison of the existing sandbox secret; no credential rotation or deployment.
require('./secret-log-redaction.cjs');
const { createHash, timingSafeEqual } = require('node:crypto');
const { normalizeToken } = require('./configure-payments.cjs');

async function compareTestToken(value, readStored) {
  let candidate = normalizeToken(value), stored = '';
  try {
    stored = normalizeToken(await readStored());
    const digest = text => createHash('sha256').update(text).digest();
    return { sameCredential: timingSafeEqual(digest(candidate), digest(stored)), readOnly: true };
  } catch {
    throw new Error('COMPARE_FAILED');
  } finally { candidate = ''; stored = ''; }
}

async function readSandboxSecret() {
  const fs = require('node:fs'), path = require('node:path');
  const env = fs.readFileSync(path.resolve(__dirname, '../functions/.env.momentos-en-vivo'), 'utf8');
  if (!/^PAYMENTS_MODE=sandbox\s*$/m.test(env) || !/^MERCADO_PAGO_COLLECTOR_ID=2954695377\s*$/m.test(env)) throw new Error('SANDBOX_REQUIRED');
  const auth = require('firebase-tools/lib/auth');
  const { requireAuth } = require('firebase-tools/lib/requireAuth');
  const secrets = require('firebase-tools/lib/gcp/secretManager');
  const owner = 'sylar.soluciones@gmail.com', project = 'momentos-en-vivo';
  const account = auth.findAccountByEmail(owner);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project, projectId: project, account: owner, nonInteractive: true };
  auth.setActiveAccount(options, account); await requireAuth(options);
  const version = await secrets.getSecretVersion(project, 'MERCADO_PAGO_ACCESS_TOKEN', '1');
  if (version.state !== 'ENABLED') throw new Error('TEST_SECRET_DISABLED');
  return secrets.accessSecretVersion(project, 'MERCADO_PAGO_ACCESS_TOKEN', '1');
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const { password } = require('@inquirer/prompts');
  console.log('Momentos en Vivo - Comparar credencial de prueba');
  console.log('En la aplicacion 2940830163173, copia el Access Token de PRUEBA.');
  console.log('Solo se compara con la version 1 guardada en Firebase. No modifica claves, pagos ni configuracion.');
  let token = await password({ message: 'Access Token de PRUEBA (ingreso oculto):', mask: '*',
    validate: value => { try { normalizeToken(value); return true; } catch { return 'Copia el Access Token completo desde Prueba.'; } } });
  try {
    const result = await compareTestToken(token, readSandboxSecret);
    console.log(result.sameCredential ? 'COINCIDE: es la misma credencial de prueba guardada.' : 'NO COINCIDE: es una credencial diferente de la guardada.');
    console.log('No se reemplazo ninguna clave ni se realizo ningun pago.');
  } finally { token = ''; }
}

if (require.main === module) main().catch(() => {
  console.error('No se pudo completar la comparacion. No se cambio ninguna clave.'); process.exitCode = 1;
});
module.exports = { compareTestToken };
