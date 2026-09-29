// Static, loopback-only preview. It cannot reach or change production accounts/events.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  if (req.headers.host !== '127.0.0.1:5053' || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
  let target;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:5053').pathname);
    target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  } catch { res.writeHead(400); res.end(); return; }
  if (!target.startsWith(root + path.sep) || !mime[path.extname(target)]) { res.writeHead(404); res.end(); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.listen(5053, '127.0.0.1', () => console.log('Static preview: http://127.0.0.1:5053/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
