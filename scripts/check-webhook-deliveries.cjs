'use strict';
// Read-only, bounded log inspection. Do not print payloads, headers, IPs or credentials.
require('./secret-log-redaction.cjs');
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { listEntries } = require('firebase-tools/lib/gcp/cloudlogging');
const PROJECT = 'momentos-en-vivo', OWNER = 'sylar.soluciones@gmail.com';
async function check() {
  const account = auth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_MISSING');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  auth.setActiveAccount(options, account); await requireAuth(options);
  const since = new Date(Date.now() - 3 * 3600000).toISOString();
  const result = await listEntries(PROJECT, `resource.type="cloud_function" resource.labels.function_name="api1" timestamp>="${since}"`, 150, 'desc');
  const completions = {}, webhookRequests = [], webhookOutcomes = [];
  for (const entry of result.entries) {
    const code = entry.textPayload?.match(/finished with status code:\s*(\d{3})/)?.[1];
    if (code) completions[code] = (completions[code] || 0) + 1;
    let record = entry.jsonPayload;
    if (!record && entry.textPayload?.startsWith('{')) { try { record = JSON.parse(entry.textPayload); } catch {} }
    if (record?.event === 'payment_webhook' && ['configuration', 'envelope', 'signature', 'lookup', 'apply', 'complete'].includes(record.stage)) {
      webhookOutcomes.push({ at: entry.timestamp, stage: record.stage,
        status: [200, 400, 401, 409, 500, 503].includes(record.status) ? record.status : null,
        outcome: ['credited', 'ignored', 'stale', 'processed', 'failed'].includes(record.outcome) ? record.outcome : null,
        signatureVerified: record.signatureVerified === true, signaturePresent: record.signaturePresent === true,
        requestIdPresent: record.requestIdPresent === true,
        format: ['legacy_ipn', 'payment', 'other'].includes(record.format) ? record.format : null });
    }
    let path;
    try { path = new URL(entry.httpRequest?.requestUrl).pathname; } catch { continue; }
    if (path.endsWith('/payments/webhook')) webhookRequests.push({ at: entry.timestamp, status: entry.httpRequest.status });
  }
  const maintenance = await listEntries(PROJECT, `resource.type="cloud_function" resource.labels.function_name="billingMaintenance" timestamp>="${since}"`, 12, 'desc');
  const maintenanceExecutions = maintenance.entries.flatMap(entry => {
    const match = entry.textPayload?.match(/finished with status(?: code)?:\s*['"]?(ok|error|timeout|\d{3})/);
    return match ? [{ at: entry.timestamp, status: match[1] }] : [];
  });
  return { since, entriesRead: result.entries.length, truncated: Boolean(result.nextPageToken),
    apiResponsesWithoutRouteAttribution: completions, webhookRequests, webhookOutcomes, maintenanceExecutions,
    verifiedSignatureProcessingObserved: webhookOutcomes.some(item => item.signatureVerified && item.stage === 'complete' && item.status === 200),
    authenticProviderDeliveryVerified: false, note: 'HTTP status alone cannot identify a signed provider delivery; signed simulator deliveries also pass signature validation.', readOnly: true };
}
if (require.main === module) check().then(value => console.log(JSON.stringify(value))).catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'WEBHOOK_LOG_CHECK_FAILED' })); process.exitCode = 1;
});
module.exports = { check };
