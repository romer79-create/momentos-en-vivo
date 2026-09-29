// Temporary LAN gateway. The Firebase emulators remain bound to loopback.
// Only run against the synthetic demo project, never a production server.
const http = require('node:http');
const os = require('node:os');
const net = require('node:net');
const { URL } = require('node:url');
function ipv4(value) { return value.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0); }
function privateAddress(value) { return /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(value); }
function createGateway({ address, netmask, port = 5050, hostingPort = 5000, authPort = 9099 }) {
  const authority = `${address}:${port}`; const origin = `http://${authority}`;
  const authPaths = new Set(['/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', '/identitytoolkit.googleapis.com/v1/accounts:lookup', '/securetoken.googleapis.com/v1/token']);
  const deny = (res, status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
  const server = http.createServer(async (req, res) => {
    const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (req.headers.host !== authority || !net.isIPv4(remote) || (ipv4(remote) & ipv4(netmask)) !== (ipv4(address) & ipv4(netmask))) return deny(res, 403, 'Vista disponible solo en la red local.');
    if (req.headers.origin && req.headers.origin !== origin) return deny(res, 403, 'Origen no permitido.');
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return deny(res, 400, 'Dirección inválida.');
    const url = new URL(req.url, origin);
    if (url.pathname === '/api/config' && req.method === 'GET') {
      try {
        const response = await fetch(`http://127.0.0.1:${hostingPort}/api/config`, { signal: AbortSignal.timeout(20000) });
        const config = await response.json(); if (!response.ok || config.emulator !== true) return deny(res, 503, 'Iniciá los servicios locales de prueba.');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify({ ...config, authEmulatorSameOrigin: true, lanPreview: true }));
      } catch { deny(res, 503, 'La vista local no está disponible.'); }
      return;
    }
    const authRequest = authPaths.has(url.pathname);
    if (authRequest && req.method !== 'POST') return deny(res, 405, 'Método no permitido.');
    if (!authRequest && /^\/(?:emulator|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)(?:\/|$)/.test(url.pathname)) return deny(res, 403, 'Usá las cuentas de prueba existentes.');
    const targetPort = authRequest ? authPort : hostingPort;
    const headers = { ...req.headers, host: `127.0.0.1:${targetPort}`, 'x-forwarded-for': remote };
    delete headers['proxy-authorization']; delete headers['proxy-connection'];
    const upstream = http.request({ hostname: '127.0.0.1', port: targetPort, method: req.method, path: url.pathname + url.search, headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => { if (!res.headersSent) deny(res, 502, 'El servicio local está reiniciándose. Intentá otra vez.'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy()); res.on('close', () => { if (!res.writableEnded) upstream.destroy(); }); req.pipe(upstream);
  });
  server.requestTimeout = 120000; server.headersTimeout = 15000;
  return server;
}
async function start() {
  const address = process.argv[2]; const port = Number(process.argv[3] || 5050);
  const adapter = Object.values(os.networkInterfaces()).flat().find(item => item.family === 'IPv4' && item.address === address && !item.internal);
  if (!adapter || !privateAddress(address) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Indicá la IP privada de esta computadora y un puerto válido.');
  const config = await fetch('http://127.0.0.1:5000/api/config', { signal: AbortSignal.timeout(20000) }).then(r => r.json());
  if (config.emulator !== true) throw new Error('Solo se puede compartir el entorno ficticio de pruebas.');
  const server = createGateway({ address, netmask: adapter.netmask, port });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, address, () => console.log(`Vista local: http://${address}:${port}/ · Misma red · Ctrl+C para cerrar`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createGateway };
