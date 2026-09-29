// Isolated local preview: none of these files are in the Firebase hosting folder.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../local-preview/sylar3d');
require('esbuild').buildSync({ entryPoints: [path.join(root, 'guide-preview.js')], bundle: true, outfile: path.join(root, 'guide.bundle.js'), minify: true, target: ['es2020'] });
require('esbuild').buildSync({ entryPoints: [path.join(root, 'momentos-help.js')], bundle: true, outfile: path.join(root, 'momentos-help.bundle.js'), minify: true, target: ['es2020'] });
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/preview.css', ['preview.css', 'text/css; charset=utf-8']],
  ['/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
  ['/sylar-package.js', ['../../web/sylar/vendor/sylar-assistant.js', 'text/javascript; charset=utf-8']],
  ['/sylar-integration.css', ['../../web/sylar/sylar-integration.css', 'text/css; charset=utf-8']],
  ['/sylar-assistant.js', ['sylar-assistant.js', 'text/javascript; charset=utf-8']],
  ['/three.min.js', ['three.min.js', 'text/javascript; charset=utf-8']],
  ['/guide.bundle.js', ['guide.bundle.js', 'text/javascript; charset=utf-8']],
  ['/momentos-help.bundle.js', ['momentos-help.bundle.js', 'text/javascript; charset=utf-8']],
  ['/guide.css', ['../../web/assistant.css', 'text/css; charset=utf-8']],
]);
const server = http.createServer((req, res) => {
  if (req.headers.host !== '127.0.0.1:5052') { res.writeHead(403); res.end('Solo disponible en 127.0.0.1:5052.'); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const pathname = new URL(req.url, 'http://127.0.0.1:5052').pathname;
  if (pathname === '/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ available: fs.existsSync(path.join(root, '../../web/sylar/vendor/sylar-assistant.js')) })); return; }
  const route = routes.get(pathname);
  if (!route) { res.writeHead(404); res.end('No encontrado.'); return; }
  fs.readFile(path.join(root, route[0]), (error, data) => {
    if (error) { res.writeHead(404); res.end('Archivo local no disponible.'); return; }
    res.setHeader('Content-Type', route[1]); res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'El puerto 5052 ya está en uso.' : error.message); process.exitCode = 1; });
server.listen(5052, '127.0.0.1', () => console.log('Prueba local: http://127.0.0.1:5052/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
