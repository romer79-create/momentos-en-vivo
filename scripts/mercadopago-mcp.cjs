'use strict';
// Local MCP transport for the documented Access Token authentication method.
// The credential remains in Secret Manager and process memory, never config.toml.
const ENDPOINT = 'https://mcp.mercadopago.com/mcp';
const PROJECT = 'momentos-en-vivo';
const OWNER = 'sylar.soluciones@gmail.com';
const COLLECTOR = '2954695377';
const SECRET_VERSION = '1'; // Never silently switch to a future production key.
const ALLOWED = new Set([
  'search_documentation', 'quality_checklist', 'quality_evaluation',
  'notifications_history', 'create_test_user', 'add_money_test_user',
]);

function requireTestProfile(profile) {
  if (profile?.test !== true || profile.country !== 'AR' || String(profile.collectorId) !== COLLECTOR) {
    throw new Error('EXPECTED_TEST_ACCOUNT_REQUIRED');
  }
}

function validateCall(name, args = {}) {
  if (!ALLOWED.has(name)) throw new Error('TOOL_NOT_ENABLED');
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.hasOwn(args, 'atz')) {
    throw new Error('INVALID_ARGUMENTS');
  }
  if (name === 'create_test_user' && (args.site_id !== 'MLA' || args.profile !== 'buyer')) {
    throw new Error('ONLY_ARGENTINE_TEST_BUYERS');
  }
  return args;
}

function redact(value, secret) {
  const serialized = JSON.stringify(value);
  const cleaned = secret ? serialized.split(secret).join('[REDACTED]') : serialized;
  return JSON.parse(cleaned.replace(/(?:APP_USR|TEST)-[A-Za-z0-9_-]{20,2000}/g, '[REDACTED]'));
}

function restrictedFetch(input, init, fetchFn = fetch) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== 'https://mcp.mercadopago.com' || url.pathname !== '/mcp' || url.username || url.password) {
    throw new Error('UNEXPECTED_MCP_DESTINATION');
  }
  return fetchFn(input, { ...init, redirect: 'error' });
}

async function connectRemote() {
  require('./secret-log-redaction.cjs');
  const auth = require('firebase-tools/lib/auth');
  const { requireAuth } = require('firebase-tools/lib/requireAuth');
  const secrets = require('firebase-tools/lib/gcp/secretManager');
  const { verifyTestAccount } = require('./configure-payments.cjs');
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const account = auth.findAccountByEmail(OWNER);
  if (!account) throw new Error('OWNER_SESSION_REQUIRED');
  delete process.env.FIREBASE_TOKEN;
  const options = { project: PROJECT, projectId: PROJECT, account: OWNER, nonInteractive: true };
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  const meta = await secrets.getSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', SECRET_VERSION);
  if (meta.state !== 'ENABLED') throw new Error('TEST_SECRET_DISABLED');
  const token = await secrets.accessSecretVersion(PROJECT, 'MERCADO_PAGO_ACCESS_TOKEN', SECRET_VERSION);
  requireTestProfile(await verifyTestAccount(token));
  const client = new Client({ name: 'momentos-mercadopago-pruebas', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
      fetch: restrictedFetch,
    }), { timeout: 25000 });
    const list = await client.listTools();
    return { client, token, tools: list.tools.filter(tool => ALLOWED.has(tool.name)).map(tool => {
      const safe = redact(tool, token);
      if (safe.inputSchema?.properties) delete safe.inputSchema.properties.atz;
      return safe;
    }) };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

async function main() {
  // Reserve stdout for the MCP protocol, including during Firebase startup.
  console.log = console.info = () => {};
  const remote = await connectRemote();
  if (process.argv.includes('--check')) {
    try {
      const result = await remote.client.callTool({ name: 'quality_checklist', arguments: {} });
      if (result.isError) throw new Error('READ_CHECK_FAILED');
      process.stdout.write(JSON.stringify({ connected: true, account: 'Argentina-test',
        tools: remote.tools.map(tool => tool.name), readCheck: 'passed', oauth: false }) + '\n');
    } finally { remote.token = ''; await remote.client.close(); }
    return;
  }
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  const server = new Server({ name: 'mercadopago-pruebas', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: remote.tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      validateCall(params.name, params.arguments);
      const result = await remote.client.callTool({ name: params.name, arguments: params.arguments || {} });
      return redact(result, remote.token);
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'No se pudo completar la operación del MCP de prueba. No se muestran credenciales ni diagnósticos privados.' }] };
    }
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    remote.token = '';
    await Promise.allSettled([remote.client.close(), server.close()]);
  };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  process.stdin.once('end', () => { void close(); });
  await server.connect(new StdioServerTransport());
}

if (require.main === module) main().catch(() => {
  process.stderr.write('MERCADOPAGO_TEST_MCP_UNAVAILABLE: revisar la sesión de Firebase y el secreto de prueba; no se muestran claves.\n');
  process.exitCode = 1;
});
module.exports = { requireTestProfile, validateCall, redact, restrictedFetch };
