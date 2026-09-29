// Only preloaded by the one-off secret setup process. Keep status/error metadata,
// but never record request/response bodies (which can contain a secret in base64).
const { Client } = require('firebase-tools/lib/apiv2');
const request = Client.prototype.logRequest;
const response = Client.prototype.logResponse;
Client.prototype.logRequest = function (options) {
  return request.call(this, { ...options, skipLog: { ...options.skipLog, body: true } });
};
Client.prototype.logResponse = function (res, body, options) {
  return response.call(this, res, body, { ...options, skipLog: { ...options.skipLog, resBody: true } });
};
