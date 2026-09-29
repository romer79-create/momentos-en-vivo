// Only event/photo data. Accounts, billing, other buckets and other projects are excluded.
const path = require('node:path');
const r = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp } = r('firebase-admin/app');
const { getFirestore } = r('firebase-admin/firestore');
const { getStorage } = r('firebase-admin/storage');
const collections = ['photos', 'events', 'uploadLimits', 'accountLimits'];
async function resetEvents({ db, bucket, apply = false }) {
  const counts = {};
  for (const name of collections) counts[name] = (await db.collection(name).count().get()).data().count;
  const [files] = await bucket.getFiles({ prefix: 'photos/' });
  const report = { mode: apply ? 'apply' : 'dry-run', documents: counts, photoFiles: files.length };
  if (!apply) return report;
  // Close reception before removing images, so existing guest links stop working.
  const events = await db.collection('events').get();
  for (const doc of events.docs) await doc.ref.update({ status: 'closed' });
  for (const file of files) {
    if (!file.name.startsWith('photos/') || file.name.includes('..')) throw new Error('Ruta de archivo inesperada.');
    await file.delete({ ignoreNotFound: true });
  }
  for (const name of collections) await db.recursiveDelete(db.collection(name));
  return report;
}
async function main() {
  const args = process.argv.slice(2); const local = args.includes('--emulator');
  const projectId = local ? 'demo-momentos' : 'momentos-en-vivo';
  if (local && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new Error('Faltan los emuladores.');
  if (!local && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new Error('No mezcles configuración local con producción.');
  const apply = args.includes('--apply');
  if (apply && !args.includes(`--confirm-project=${projectId}`)) throw new Error('La limpieza requiere confirmar el identificador exacto del proyecto.');
  initializeApp({ projectId, storageBucket: local ? `${projectId}.appspot.com` : 'momentos-en-vivo.firebasestorage.app' });
  console.log(JSON.stringify(await resetEvents({ db: getFirestore(), bucket: getStorage().bucket(), apply }), null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { resetEvents };
