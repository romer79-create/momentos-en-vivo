'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const allowed = new Set(['SMTP_PASSWORD', 'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET']);

function storeProjectSecret(name, value, spawnProcess = spawn) {
  if (!allowed.has(name) || typeof value !== 'string' || !value || value.length > 4096) throw new Error('Secreto no permitido.');
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [
      '--require', path.join(__dirname, 'secret-log-redaction.cjs'),
      require.resolve('firebase-tools/lib/bin/firebase.js'),
      'functions:secrets:set', name, '--data-file', '-', '--non-interactive',
      '--project', 'momentos-en-vivo', '--account', 'sylar.soluciones@gmail.com',
    ], { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    child.once('error', () => reject(new Error('No se pudo iniciar Firebase. No se cambio la configuracion del servicio.')));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Firebase no confirmo el guardado. No se habilitaron servicios.')));
    child.stdin.on('error', () => reject(new Error('Firebase cerro el ingreso. No se confirmo el guardado.')));
    // Never put the secret in arguments, environment variables or files.
    child.stdin.end(value);
  });
}
module.exports = { storeProjectSecret };
