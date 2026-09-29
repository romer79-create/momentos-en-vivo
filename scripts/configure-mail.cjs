'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function normalizeSecret(value) {
  const normalized = String(value).replace(/\s/g, '');
  if (!/^[a-zA-Z0-9]{16}$/.test(normalized)) throw new Error('Usa los 16 caracteres de la contrasena de aplicacion de Google.');
  return normalized;
}

function storeSecret(value, spawnProcess = spawn) {
  const secret = normalizeSecret(value);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [
      '--require', path.join(__dirname, 'secret-log-redaction.cjs'),
      require.resolve('firebase-tools/lib/bin/firebase.js'),
      'functions:secrets:set', 'SMTP_PASSWORD', '--data-file', '-', '--non-interactive',
      '--project', 'momentos-en-vivo', '--account', 'sylar.soluciones@gmail.com',
    ], { cwd: root, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    child.once('error', () => reject(new Error('No se pudo iniciar Firebase. No se habilitaron los correos.')));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('No se pudo guardar el secreto. No se habilitaron los correos.')));
    child.stdin.on('error', () => reject(new Error('Firebase cerro el ingreso. No se confirmo el guardado.')));
    // Never put the secret in command arguments, environment variables or files.
    child.stdin.end(secret);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este archivo en una terminal interactiva para ingresar la clave de forma oculta.');
  const { password } = require('@inquirer/prompts');
  console.log('Momentos en Vivo - correo de Sylar.soluciones');
  console.log('Cuenta: sylar.soluciones@gmail.com. Proyecto: momentos-en-vivo.');
  console.log('Usa una contrasena de aplicacion de Google, no la contrasena principal.');
  console.log('Este paso solo guarda el secreto; no publica ni envia correos.');
  let secret = await password({
    message: 'Pega la contrasena de aplicacion y presiona Enter (ingreso oculto):', mask: '*',
    validate: value => { try { normalizeSecret(value); return true; } catch (error) { return error.message; } },
  });
  try { await storeSecret(secret); }
  finally { secret = ''; }
  console.log('Secreto guardado. Falta comprobar el envio antes de habilitarlo en produccion.');
}

if (require.main === module) main().catch(error => {
  console.error(error.name === 'ExitPromptError' ? 'Operacion cancelada; no se guardo ninguna clave.' : error.message);
  process.exitCode = 1;
});
module.exports = { normalizeSecret, storeSecret };
