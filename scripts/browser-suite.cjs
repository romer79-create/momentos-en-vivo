const { spawnSync } = require('node:child_process');
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Se requiere el emulador local.');
for (const file of ['scripts/seed-demo.cjs', 'tests/browser.cjs', 'tests/themes-browser.cjs', 'tests/live-browser.cjs', 'tests/invitation-motion-browser.cjs', 'tests/music-browser.cjs']) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
