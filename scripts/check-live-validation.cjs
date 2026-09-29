'use strict';
require('./secret-log-redaction.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { checkSandboxOrder } = require('./check-sandbox-order.cjs');
async function checkLiveValidation() {
  const record = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../output/releases/live-validation-order-20260929.json'), 'utf8'));
  const order = await checkSandboxOrder(record.orderId, { mode: 'live' });
  if (!order.validation || order.priceCents !== 10000) throw new Error('LIVE_VALIDATION_REQUIRED');
  return order;
}
if (require.main === module) checkLiveValidation().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'LIVE_VALIDATION_CHECK_FAILED' })); process.exitCode = 1;
});
module.exports = { checkLiveValidation };
