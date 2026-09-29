'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, 'functions/.env.momentos-en-vivo');

function normalizeToken(value) {
  const token = String(value).trim();
  if (!/^(APP_USR|TEST)-[a-zA-Z0-9_-]{20,2000}$/.test(token)) {
    throw new Error('Copia el Access Token completo desde la pestana Prueba, no la Public Key.');
  }
  return token;
}

function requirePaymentsDisabled(text) {
  const modes = [...text.matchAll(/^\s*PAYMENTS_MODE\s*=\s*([^\r\n#]*)/gm)]
    .map(match => match[1].trim().replace(/^["']|["']$/g, ''));
  if (modes.some(mode => mode && mode !== 'disabled')) {
    throw new Error('La configuracion ya tiene cobros habilitados. No se reemplazo ninguna clave; revisemos el entorno primero.');
  }
}

async function verifyTestAccount(value, fetchFn = fetch) {
  const token = normalizeToken(value);
  let response, profile;
  try {
    response = await fetchFn('https://api.mercadopago.com/users/me', {
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('No se pudo conectar con Mercado Pago. No se guardo el token.'); }
  if (!response.ok) throw new Error('Mercado Pago no acepto la consulta. Revisa que copiaste el Access Token de Prueba. No se guardo.');
  try { profile = await response.json(); }
  catch { throw new Error('Mercado Pago devolvio una respuesta inesperada. No se guardo el token.'); }
  // Both test and live keys can start with APP_USR: the prefix proves no mode.
  if (!Array.isArray(profile?.tags) || !profile.tags.includes('test_user')) {
    throw new Error('No pudimos confirmar que esta sea una cuenta de prueba. No se guardo el token; revisemos la credencial.');
  }
  if (profile.site_id !== 'MLA' || profile.country_id !== 'AR') {
    throw new Error('La cuenta de prueba no corresponde a Argentina. No se guardo el token.');
  }
  if (!Number.isSafeInteger(profile.id) || profile.id <= 0) throw new Error('El identificador de la cuenta no es valido. No se guardo el token.');
  return { collectorId: String(profile.id), country: 'AR', test: true };
}

function storeTestToken(value, spawnProcess = spawn) {
  const token = normalizeToken(value);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [
      '--require', path.join(__dirname, 'secret-log-redaction.cjs'),
      require.resolve('firebase-tools/lib/bin/firebase.js'),
      'functions:secrets:set', 'MERCADO_PAGO_ACCESS_TOKEN', '--data-file', '-', '--non-interactive',
      '--project', 'momentos-en-vivo', '--account', 'sylar.soluciones@gmail.com',
    ], { cwd: root, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    child.once('error', () => reject(new Error('No se pudo iniciar Firebase. Los cobros siguen desactivados.')));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Firebase no confirmo el guardado. Los cobros siguen desactivados.')));
    child.stdin.on('error', () => reject(new Error('Firebase cerro el ingreso. No se confirmo el guardado.')));
    child.stdin.end(token);
  });
}

async function configureTestToken(value, { readConfig = () => fs.readFileSync(envFile, 'utf8'), verify = verifyTestAccount, store = storeTestToken } = {}) {
  requirePaymentsDisabled(readConfig());
  const token = normalizeToken(value), account = await verify(token);
  requirePaymentsDisabled(readConfig());
  await store(token);
  return account;
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este archivo en una terminal interactiva. La clave se ingresa oculta.');
  requirePaymentsDisabled(fs.readFileSync(envFile, 'utf8'));
  const { password } = require('@inquirer/prompts');
  console.log('Momentos en Vivo - Mercado Pago de PRUEBA');
  console.log('Copia Access Token desde Prueba. Este paso consulta la cuenta y guarda la clave en Firebase.');
  console.log('No crea pagos, no publica y no habilita cobros.');
  let token = await password({ message: 'Pega el Access Token de Prueba (ingreso oculto):', mask: '*',
    validate: value => { try { normalizeToken(value); return true; } catch (error) { return error.message; } },
  });
  try {
    console.log('Comprobando la cuenta de prueba en Mercado Pago...');
    const account = await configureTestToken(token);
    console.log(`Cuenta de prueba de Argentina verificada. ID: ${account.collectorId}`);
    console.log('Token de prueba guardado. Los cobros siguen desactivados.');
    console.log('Siguiente paso: configurar las notificaciones de pago (Webhooks).');
  } finally { token = ''; }
}

if (require.main === module) main().catch(error => {
  // Our own messages contain no provider response bodies, profiles or credentials.
  console.error(error.name === 'ExitPromptError' ? 'Operacion cancelada; no se guardo ninguna clave.' : error.message);
  process.exitCode = 1;
});
module.exports = { normalizeToken, requirePaymentsDisabled, verifyTestAccount, storeTestToken, configureTestToken };
