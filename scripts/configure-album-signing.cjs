'use strict';
require('./secret-log-redaction.cjs');
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const ensureApi = require('firebase-tools/lib/ensureApiEnabled');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';
const SERVICE = `${PROJECT}@appspot.gserviceaccount.com`;
const ROLE = 'roles/iam.serviceAccountTokenCreator';
const MEMBER = `serviceAccount:${SERVICE}`;
function addSelfSigner(policy) {
  const updated = structuredClone(policy);
  updated.bindings ||= [];
  let binding = updated.bindings.find(b => b.role === ROLE && !b.condition);
  if (binding?.members?.includes(MEMBER)) return { changed: false, policy: updated };
  if (!binding) { binding = { role: ROLE, members: [] }; updated.bindings.push(binding); }
  binding.members.push(MEMBER);
  return { changed: true, policy: updated };
}
async function configure({ apply = false } = {}) {
  const account = auth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  auth.setActiveAccount(options, account); await requireAuth(options);
  const iam = new Client({ urlPrefix: 'https://iam.googleapis.com', apiVersion: 'v1', auth: true });
  const resource = `projects/${PROJECT}/serviceAccounts/${SERVICE}`;
  const read = async () => (await iam.post(`${resource}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } })).body;
  const change = addSelfSigner(await read());
  if (apply) {
    await ensureApi.ensure(PROJECT, 'iamcredentials.googleapis.com', 'album-signing');
    // Preserve etag, existing members, conditions and audit configuration.
    // Grant only to the function identity on itself, never project-wide.
    if (change.changed) await iam.post(`${resource}:setIamPolicy`, { policy: change.policy });
    if (addSelfSigner(await read()).changed) throw new Error('POLICY_NOT_CONFIRMED');
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', resource, member: MEMBER, role: ROLE, changed: change.changed, confirmed: apply }));
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--apply')) { console.error('Uso: node scripts/configure-album-signing.cjs [--apply]'); process.exitCode = 1; }
  else configure({ apply: args[0] === '--apply' }).catch(error => {
    console.error(JSON.stringify({ status: 'failed', code: /^[A-Z_]{1,48}$/.test(error.message || '') ? error.message : 'CONFIGURATION_FAILED', httpStatus: Number(error.status) || undefined })); process.exitCode = 1;
  });
}
module.exports = { addSelfSigner };
