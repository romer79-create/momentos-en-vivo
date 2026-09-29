const r = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp } = r('firebase-admin/app');
const { getAuth } = r('firebase-admin/auth');
const [project, email, confirmation] = process.argv.slice(2);
if (!project || !email || confirmation !== `--confirm-project=${project}`) throw new Error('Uso: node scripts/grant-admin.cjs PROJECT EMAIL --confirm-project=PROJECT');
initializeApp({ projectId: project });
(async () => {
  const user = await getAuth().getUserByEmail(email);
  if (!user.emailVerified || user.disabled) throw new Error('La cuenta debe estar activa y tener el correo verificado.');
  await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, admin: true, organizer: true });
  await getAuth().revokeRefreshTokens(user.uid);
  console.log('Administrador habilitado. Debe volver a iniciar sesión.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
