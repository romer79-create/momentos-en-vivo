// Only synthetic local data. This script cannot operate against a real project.
const { createRequire } = require('node:module');
const r = createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = r('firebase-admin/app');
const { getAuth } = r('firebase-admin/auth');
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !/^127\.0\.0\.1:/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error('Se requiere el emulador local.');
initializeApp({ projectId: 'demo-momentos' });
(async () => {
  for (const [uid, email, admin] of [['demo-client', 'cliente@example.test', false], ['demo-other', 'otro@example.test', false], ['demo-admin', 'admin@example.test', true]]) {
    await getAuth().createUser({ uid, email, password: 'Prueba-local-123456', emailVerified: true }).catch(e => { if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') throw e; });
    await getAuth().setCustomUserClaims(uid, { admin });
  }
  console.log('Cuentas de prueba locales preparadas.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
