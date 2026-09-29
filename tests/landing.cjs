/* Run: node tests/landing.cjs. Uses an ephemeral local port, never Firebase. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const checks = [];
let catalog = { mode: 'disabled', checkoutEnabled: false, plans: [] };
let status = 200;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/catalog') {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(catalog));
    return;
  }
  if (url.pathname === '/home.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html lang="es"><title>Destino del QR</title><p>Prueba de redirección</p></html>');
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(publicRoot, '.' + decodeURIComponent(requested));
  if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  });
});
function check(name) { checks.push(name); console.log('OK ' + name); }
async function navigate(page, url) {
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  else await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#catalog-status[aria-busy="false"]').waitFor();
}
async function noHorizontalOverflow(page) {
  const width = page.viewportSize().width;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollWidth <= width, 'Page overflows horizontally: ' + scrollWidth + 'px at ' + width + 'px viewport');
}
(async () => {
  for (const ext of ['js', 'css']) assert.equal(fs.readFileSync(path.join(root, 'web', 'landing.' + ext), 'utf8'), fs.readFileSync(path.join(publicRoot, 'assets', 'landing.' + ext), 'utf8'));
  check('Source and public assets match');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'momentos-landing-'));
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.BROWSER_EXECUTABLE || (fs.existsSync(edge) ? edge : undefined);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await navigate(page, base);
    await page.getByRole('heading', { name: 'Tu evento, visto por quienes lo viven.' }).waitFor();
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('audio,video,[onclick],script[src*="cdnjs"]').count(), 0);
    assert.equal(await page.locator('.plan-buy:visible').count(), 0);
    assert.equal(await page.getByText('Precio por confirmar', { exact: true }).count(), 3);
    await noHorizontalOverflow(page);
    check('Accessible structure, no autoplay media, disabled catalog has no sale');
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    // A manual route must never project the pending photo.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Enviar foto de prueba' }).click();
    assert.equal(await page.locator('#experiencia').getAttribute('data-state'), 'pending');
    const before = await page.locator('#projection-photo').getAttribute('src');
    const phone = await page.locator('#phone-photo').getAttribute('src');
    assert.notEqual(before, phone);
    assert.match(await page.locator('#approval-label').textContent(), /pendiente/);
    await page.getByRole('button', { name: 'Aprobar foto de prueba' }).click();
    assert.equal(await page.locator('#experiencia').getAttribute('data-state'), 'approved');
    assert.equal(await page.locator('#projection-photo').getAttribute('src'), before);
    await page.getByRole('button', { name: 'Mostrar en la pantalla' }).click();
    assert.equal(await page.locator('#experiencia').getAttribute('data-state'), 'projected');
    assert.equal(await page.locator('#projection-photo').getAttribute('src'), phone);
    assert.match(await page.locator('#demo-announcement').textContent(), /aprobada/);
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
    check('Manual demo: send → pending → approved → displayed; no pending photo appears');
    await page.getByRole('button', { name: 'Probar con otra foto' }).click();
    await page.getByRole('button', { name: 'Reanudar animación' }).click();
    await page.waitForFunction(() => document.querySelector('#experiencia').dataset.state === 'pending', { timeout: 6000 });
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    const transform = await page.locator('.phone').evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(3800);
    assert.equal(await page.locator('#experiencia').getAttribute('data-state'), 'pending');
    assert.equal(await page.locator('.phone').evaluate(el => getComputedStyle(el).transform), transform);
    await page.getByRole('button', { name: 'Reanudar animación' }).click();
    await page.waitForFunction(() => document.querySelector('#experiencia').dataset.state === 'approved', { timeout: 6000 });
    const oldScreen = await page.locator('#projection-photo').getAttribute('src');
    assert.notEqual(oldScreen, await page.locator('#phone-photo').getAttribute('src'));
    await page.waitForFunction(() => document.querySelector('#experiencia').dataset.state === 'projected', { timeout: 6000 });
    assert.equal(await page.locator('#projection-photo').getAttribute('src'), await page.locator('#phone-photo').getAttribute('src'));
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    check('Automatic demo works in order; pause freezes both timer and visual animation');
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.screenshot({ path: path.join(output, 'desktop-full.png'), fullPage: true });
    await page.getByText('¿Una foto se muestra apenas la envían?', { exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details[open]').count(), 1);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('details[open]').count(), 0);
    check('Native FAQ opens and closes with the keyboard');

    const plans = [
      { id: 'single', title: 'Un evento', credits: 1, priceCents: 2450099, currency: 'ARS' },
      { id: 'pack_3', title: 'Tres eventos', credits: 3, priceCents: 6000000, currency: 'ARS' },
      { id: 'pack-10', title: 'Diez eventos', credits: 10, priceCents: null, currency: 'ARS' }
    ];
    catalog = { mode: 'live', checkoutEnabled: true, plans };
    await navigate(page);
    assert.equal(await page.locator('.plan-buy:visible').count(), 2);
    assert.equal(await page.locator('[data-credits="1"] [data-plan-price]').textContent(), new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(24500.99));
    assert.equal(await page.locator('[data-credits="3"] [data-plan-buy]').getAttribute('href'), '/registro.html?plan=pack_3');
    assert.equal(await page.locator('[data-credits="10"] [data-plan-price]').textContent(), 'Precio por confirmar');
    check('Live catalog: configured ARS cents rendered, valid plan forwarded, unpriced plan unavailable');
    for (const mode of ['disabled', 'local', 'sandbox']) {
      catalog = { mode, checkoutEnabled: true, plans };
      await navigate(page);
      assert.equal(await page.locator('.plan-buy:visible').count(), 0, mode);
    }
    catalog = { mode: 'live', checkoutEnabled: false, plans };
    await navigate(page);
    assert.equal(await page.locator('.plan-buy:visible').count(), 0);
    check('Local, sandbox, disabled and checkout-disabled modes never offer a sale');
    catalog = { mode: 'live', checkoutEnabled: true, plans: [
      { id: 'bad', credits: 1, priceCents: '1000', currency: 'ARS', title: '<img src=x onerror=alert(1)>' },
      { id: 'bad2', credits: 3, priceCents: 1000, currency: 'USD' },
      { id: 'https://evil.example/', credits: 10, priceCents: 1000, currency: 'ARS' }
    ] };
    await navigate(page);
    assert.equal(await page.locator('.plan-buy:visible').count(), 0);
    assert.equal(await page.locator('img[onerror]').count(), 0);
    assert.match(await page.locator('[data-credits="1"] h3').textContent(), /<img/);
    assert.equal(await page.locator('[data-credits="1"] [data-plan-price]').textContent(), 'Precio por confirmar');
    assert.equal(await page.locator('[data-credits="3"] [data-plan-price]').textContent(), 'Precio por confirmar');
    status = 503;
    await navigate(page);
    assert.equal(await page.locator('.plan-buy:visible').count(), 0);
    assert.equal(await page.getByText('Precio por confirmar', { exact: true }).count(), 3);
    check('Malformed prices/IDs, untrusted titles and API failure handled without HTML injection or sales');
    status = 200;
    catalog = { mode: 'disabled', checkoutEnabled: false, plans: [] };

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(error.message));
    await navigate(mobile, base);
    assert.equal(await mobile.locator('html').getAttribute('data-motion'), 'paused');
    assert.equal(await mobile.locator('#motion-toggle').isDisabled(), true);
    assert.equal(await mobile.locator('.phone').evaluate(el => getComputedStyle(el).animationName), 'none');
    await noHorizontalOverflow(mobile);
    await mobile.screenshot({ path: path.join(output, 'mobile.png') });
    await mobile.locator('#experiencia').scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: path.join(output, 'mobile-demo.png') });
    await mobile.screenshot({ path: path.join(output, 'mobile-full.png'), fullPage: true });
    await mobile.getByRole('button', { name: 'Enviar foto de prueba' }).click();
    assert.equal(await mobile.locator('#experiencia').getAttribute('data-state'), 'pending');
    await mobile.getByRole('button', { name: 'Aprobar foto de prueba' }).click();
    await mobile.getByRole('button', { name: 'Mostrar en la pantalla' }).click();
    assert.equal(await mobile.locator('#experiencia').getAttribute('data-state'), 'projected');
    await mobile.getByRole('button', { name: 'Menú' }).click();
    assert.equal(await mobile.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
    await mobile.keyboard.press('Escape');
    assert.equal(await mobile.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    await mobile.getByRole('button', { name: 'Menú' }).click();
    await mobile.locator('#main-nav').getByRole('link', { name: 'Planes', exact: true }).click();
    assert.equal(await mobile.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    await noHorizontalOverflow(mobile);
    check('390px mobile, reduced motion, manual demo, menu and Escape work');

    const narrow = await browser.newPage({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
    await navigate(narrow, base);
    await noHorizontalOverflow(narrow);
    for (const width of [640, 768, 900, 1024, 1920]) {
      await narrow.setViewportSize({ width, height: 900 });
      await noHorizontalOverflow(narrow);
    }
    check('No horizontal overflow at 320, 390, 640, 768, 900, 1024, 1440 or 1920px');

    const fallback = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await fallback.route('https://images.unsplash.com/**', route => route.abort());
    await navigate(fallback, base);
    await fallback.locator('#experiencia').scrollIntoViewIfNeeded();
    await fallback.waitForFunction(() => document.querySelector('#phone-photo').hasAttribute('data-failed'));
    await fallback.screenshot({ path: path.join(output, 'fallback.png') });
    await noHorizontalOverflow(fallback);
    check('Remote image failure keeps CSS photo fallback and page layout');
    const plainContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const plain = await plainContext.newPage();
    await plain.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(await plain.locator('#main-nav').isVisible(), true);
    assert.equal(await plain.locator('.plan-buy:visible').count(), 0);
    await noHorizontalOverflow(plain);
    check('Without JavaScript content, navigation and FAQ remain available; purchase stays closed');

    await page.goto(base + '/?event=evento_123&source=qr#private-fragment');
    await page.waitForURL('**/home.html?event=evento_123&source=qr#private-fragment');
    assert.deepEqual(errors, []);
    check('Legacy event redirect preserves query and fragment; no JavaScript errors');
    console.log(JSON.stringify({ ok: true, checks: checks.length, screenshots: output }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

