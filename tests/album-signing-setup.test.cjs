'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addSelfSigner } = require('../scripts/configure-album-signing.cjs');
const role = 'roles/iam.serviceAccountTokenCreator';
const member = 'serviceAccount:momentos-en-vivo@appspot.gserviceaccount.com';
test('album signing preserves IAM etag, conditions and unrelated members and adds only self', () => {
  const policy = { version: 3, etag: 'fixture-etag', auditConfigs: [{ service: 'allServices' }], bindings: [
    { role, members: ['user:other@example.test'], condition: { title: 'existing', expression: 'false' } },
    { role: 'roles/viewer', members: ['user:reader@example.test'] },
  ] };
  const copy = structuredClone(policy), result = addSelfSigner(policy);
  assert.deepEqual(policy, copy); assert.equal(result.changed, true);
  assert.equal(result.policy.etag, policy.etag); assert.equal(result.policy.version, 3);
  assert.deepEqual(result.policy.auditConfigs, policy.auditConfigs);
  assert.deepEqual(result.policy.bindings.slice(0, 2), policy.bindings);
  assert.deepEqual(result.policy.bindings[2], { role, members: [member] });
  assert.equal(addSelfSigner(result.policy).changed, false);
});
