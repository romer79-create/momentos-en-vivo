'use strict';
// Read-only production inventory. Never print credentials, environment values,
// customer details, photos, function bodies or complete provider responses.
require('./secret-log-redaction.cjs');
const firebaseAuth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const manager = require('firebase-tools/lib/gcp/secretManager');
const v1 = require('firebase-tools/lib/gcp/cloudfunctions');
const v2 = require('firebase-tools/lib/gcp/cloudfunctionsv2');
const hosting = require('firebase-tools/lib/hosting/api');
const appCheck = require('firebase-tools/lib/appcheck/api');
const { Client } = require('firebase-tools/lib/apiv2');
const authApi = require('firebase-tools/lib/gcp/auth');
const scheduler = require('firebase-tools/lib/gcp/cloudscheduler');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';
const errorSummary = error => ({
  status: 'failed',
  code: /^[A-Z_0-9-]{1,48}$/.test(String(error.code || '')) ? error.code : 'CHECK_FAILED',
  httpStatus: Number(error.status) || undefined,
});

async function checkRelease() {
  const account = firebaseAuth.findAccountByEmail(OWNER);
  if (!account) throw Object.assign(new Error(), { code: 'OWNER_SESSION_MISSING' });
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account); await requireAuth(options);
  const checks = [
    ...['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'SMTP_PASSWORD'].map(name => [name, async () => {
      const meta = await manager.getSecretVersion(PROJECT, name, 'latest');
      return { state: meta.state, version: meta.versionId };
    }]),
    ...[[v1, 'v1'], [v2, 'v2']].map(([api, generation]) => [`functions_${generation}`, async () => {
      const result = await api.listAllFunctions(PROJECT);
      return { unreachable: result.unreachable, functions: result.functions.map(fn => ({
        name: fn.name, state: fn.status || fn.state, runtime: fn.runtime || fn.buildConfig?.runtime,
        entryPoint: fn.entryPoint || fn.buildConfig?.entryPoint,
        serviceAccount: fn.serviceAccountEmail || fn.serviceConfig?.serviceAccountEmail,
        secretNames: (fn.secretEnvironmentVariables || fn.serviceConfig?.secretEnvironmentVariables || []).map(s => s.key),
        updateTime: fn.updateTime,
      })) };
    }]),
    ['hosting_live', async () => {
      const channel = await hosting.getChannel(PROJECT, PROJECT, 'live');
      return { exists: Boolean(channel), releaseTime: channel?.release?.releaseTime, version: channel?.release?.version?.name };
    }],
    ['app_check', async () => {
      const config = await appCheck.getProviderConfig('403164580472', '1:403164580472:web:9451616b5c586e4d587b8d', 'recaptcha-enterprise');
      return { configured: Boolean(config.siteKey), tokenTtl: config.tokenTtl };
    }],
    ['firebase_auth', async () => {
      const client = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
      const { body } = await client.get(`/admin/v2/projects/${PROJECT}/config`, { headers: { 'x-goog-user-project': PROJECT } });
      return { emailPasswordEnabled: body.signIn?.email?.enabled === true, canonicalDomainAllowed: body.authorizedDomains?.includes(`${PROJECT}.web.app`) === true };
    }],
    ['owner_account', async () => {
      try {
        const user = await authApi.findUser(PROJECT, OWNER);
        return { exists: true, emailVerified: user.emailVerified === true, disabled: user.disabled === true };
      } catch (error) {
        if (error.message === 'No users found') return { exists: false };
        throw error;
      }
    }],
    ['download_signing_permissions', async () => {
      const serviceAccount = `${PROJECT}@appspot.gserviceaccount.com`;
      const iam = new Client({ urlPrefix: 'https://iam.googleapis.com', apiVersion: 'v1', auth: true });
      const project = new Client({ urlPrefix: 'https://cloudresourcemanager.googleapis.com', apiVersion: 'v1', auth: true });
      const [accountPolicy, projectPolicy] = await Promise.all([
        iam.post(`projects/${PROJECT}/serviceAccounts/${serviceAccount}:getIamPolicy`, {}),
        project.post(`projects/${PROJECT}:getIamPolicy`, {}),
      ]);
      const roles = policy => (policy.body.bindings || []).filter(b => b.members?.includes(`serviceAccount:${serviceAccount}`)).map(b => ({ role: b.role, conditional: Boolean(b.condition) }));
      return { serviceAccountRoles: roles(accountPolicy), projectRoles: roles(projectPolicy) };
    }],
    ['firestore_indexes', async () => {
      const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true, apiVersion: 'v1' });
      const { body } = await client.get(`projects/${PROJECT}/databases/(default)/collectionGroups/-/indexes`);
      const states = {};
      for (const index of body.indexes || []) states[index.state] = (states[index.state] || 0) + 1;
      return { states, hasMore: Boolean(body.nextPageToken) };
    }],
    ['scheduled_jobs', async () => {
      const jobs = await Promise.all(['billingMaintenance', 'albumMaintenance', 'mailMaintenance', 'retentionMaintenance'].map(async id => {
        const result = await scheduler.getJob(`projects/${PROJECT}/locations/us-central1/jobs/firebase-schedule-${id}-us-central1`);
        return { function: id, status: result.status, state: result.body.state, lastAttempt: result.body.lastAttemptTime, lastCode: result.body.status?.code };
      }));
      return { jobs };
    }],
  ];
  const results = await Promise.allSettled(checks.map(async ([check, run]) => ({ check, ...await run() })));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    console.log(JSON.stringify(result.status === 'fulfilled' ? result.value : { check: checks[i][0], ...errorSummary(result.reason) }));
    if (result.status === 'rejected') process.exitCode = 1;
  }
}
if (require.main === module) checkRelease().catch(error => { console.error(JSON.stringify(errorSummary(error))); process.exitCode = 1; });
module.exports = { checkRelease };
