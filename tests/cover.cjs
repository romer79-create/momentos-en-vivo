/* Standalone homepage regression suite. No Firebase data is changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve('public'); let failure = false;
const catalog = { mode: 'local', checkoutEnabled: true, plans: require('../functions/offers.json') };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/catalog') { res.writeHead(failure ? 503 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(catalog)); return; }
  if (url.pathname === '/home.html') { res.end('<!doctype html><title>Prueba QR</title>Destino del QR'); return; }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
  fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? '' : bytes); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
    await page.goto(base); await page.getByText(/Versión de prueba, sin cobros reales/).waitFor();
    assert.equal(await page.locator('h1').count(), 1); assert.equal(await page.locator('.prototype-bar').count(), 0);
    assert.match(await page.locator('.offer small').first().textContent(), /65.000/); assert.match(await page.locator('.offer small').first().textContent(), /175.500/);
    assert.equal(await page.locator('.theme-card').count(), Object.keys(require('../functions/themes.json')).length);
    await page.getByRole('button', { name: 'Compartir foto de muestra ↗', exact: true }).click();
    assert.equal(await page.locator('.demo').getAttribute('data-state'), 'pending');
    assert.equal(await page.locator('.demo-photo').evaluate(el => getComputedStyle(el).opacity), '0');
    await page.getByRole('button', { name: 'Aprobar foto de muestra ✓', exact: true }).click();
    assert.equal(await page.locator('.demo').getAttribute('data-state'), 'projected');
    assert.deepEqual(writes, []);
    await page.getByRole('button', { name: 'Pausar efectos' }).click(); assert.equal(await page.locator('html').getAttribute('data-motion'), 'paused');
    await page.getByText('¿Qué necesito en el evento?', { exact: true }).press('Enter'); assert.equal(await page.locator('details[open]').count(), 1);
    for (const width of [320, 390, 768, 1440, 1920]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    failure = true; await page.reload(); await page.getByText('No pudimos consultar los precios. Podés revisarlos desde tu cuenta.').waitFor();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: 'reduce' }); const m = await mobile.newPage(); const frames = [];
    m.on('request', r => { if (/frame-\d+\.webp/.test(r.url())) frames.push(r.url()); });
    await m.goto(base); assert.equal(await m.locator('html').getAttribute('data-motion'), 'paused'); assert.deepEqual(frames, []);
    await m.goto(`${base}/?event=legacy-event#private-fragment`); await m.waitForURL('**/home.html?event=legacy-event#private-fragment');
    assert.deepEqual(errors, []); console.log('Portada: demo, catálogo, enlaces, teclado, anchos y movimiento reducido correctos.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
