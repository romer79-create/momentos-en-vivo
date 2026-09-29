'use strict';
// Read the configured secret only in memory. Default mode verifies SMTP without
// sending a message. --send-test-to-owner requires explicit owner authorization.
require('./secret-log-redaction.cjs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const functionRequire = createRequire(path.join(root, 'functions/package.json'));
const nodemailer = functionRequire('nodemailer');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const manager = require('firebase-tools/lib/gcp/secretManager');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';
const TEST = {
  subject: 'Momentos en Vivo · prueba de correo',
  text: 'Este es un correo de prueba de Momentos en Vivo para confirmar la conexión con Gmail.\n\nNo corresponde a una compra ni a un evento real.\n\nUn proyecto de Sylar.soluciones.',
};

async function checkMail({ sendTest = false } = {}) {
  // Use exactly the owner's existing Firebase session, never another default.
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw Object.assign(new Error(), { code: 'OWNER_SESSION_MISSING' });
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account);
  await requireAuth(options);
  const meta = await manager.getSecretVersion(PROJECT, 'SMTP_PASSWORD', 'latest');
  if (meta.state !== 'ENABLED') throw Object.assign(new Error(), { code: 'SECRET_NOT_ENABLED' });
  console.log(JSON.stringify({ secret: 'SMTP_PASSWORD', state: meta.state, version: meta.versionId }));
  let pass = await manager.accessSecretVersion(PROJECT, 'SMTP_PASSWORD', meta.versionId);
  if (!/^[a-zA-Z0-9]{16}$/.test(pass)) throw Object.assign(new Error(), { code: 'INVALID_APP_PASSWORD_FORMAT' });
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: OWNER, pass }, connectionTimeout: 10000,
    greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  pass = '';
  try {
    await transport.verify();
    console.log(JSON.stringify({ smtp: 'authenticated', account: OWNER, tls: true }));
    if (sendTest) {
      const result = await transport.sendMail({
        from: { name: 'Momentos en Vivo', address: OWNER }, to: OWNER, replyTo: OWNER,
        ...TEST, disableFileAccess: true, disableUrlAccess: true,
      });
      if (!result.accepted?.some(address => String(address).toLowerCase() === OWNER) || result.rejected?.length) {
        throw Object.assign(new Error(), { code: 'TEST_NOT_ACCEPTED' });
      }
      console.log(JSON.stringify({ test: 'accepted_by_gmail', recipient: OWNER, messageId: result.messageId }));
    }
  } finally { transport.close(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--send-test-to-owner')) {
    console.error('Uso: node scripts/check-mail.cjs [--send-test-to-owner]'); process.exitCode = 1;
  } else checkMail({ sendTest: args[0] === '--send-test-to-owner' }).catch(error => {
    // Never print raw provider responses or error objects that may contain auth.
    const code = /^[A-Z_0-9-]{1,48}$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED';
    console.error(JSON.stringify({ status: 'failed', code, httpStatus: Number(error.status) || undefined, smtpStatus: Number(error.responseCode) || undefined }));
    process.exitCode = 1;
  });
}
module.exports = { checkMail, TEST };
