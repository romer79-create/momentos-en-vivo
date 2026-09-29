const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000';
const output = path.resolve(process.env.TEST_OUTPUT || 'test-results/invitation-motion'); fs.mkdirSync(output, { recursive: true });
const results = [];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage(); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (/Content Security Policy|violates the following/.test(message.text())) errors.push(message.text()); });
  try {
    for (const theme of (process.env.TEST_THEMES || Object.keys(require('../functions/themes.json')).join(',')).split(',')) {
      await page.goto(`${base}/invitacion.html?demo=${theme}`);
      await page.getByRole('button', { name: 'Abrir invitación', exact: true }).waitFor();
      assert.equal(await page.locator('.invitation-card').evaluate(node => node.inert), true);
      await page.screenshot({ path: path.join(output, `${theme}-sobre.png`), fullPage: true });
      await page.getByRole('button', { name: 'Abrir invitación', exact: true }).click(); await page.locator('.invitation-experience[data-open=true]').waitFor();
      assert.equal(await page.locator('.invitation-card').evaluate(node => node.inert), false); assert.equal(await page.locator('.invite-countdown strong').count(), 3);
      assert.equal(await page.locator('.invite-sound').getAttribute('aria-pressed'), 'false'); await page.locator('.invite-sound').click(); assert.equal(await page.locator('.invite-sound').getAttribute('aria-pressed'), 'true'); await page.locator('.invite-sound').click(); assert.equal(await page.locator('.invite-sound').getAttribute('aria-pressed'), 'false');
      for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} width ${width}`); }
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForFunction(() => getComputedStyle(document.querySelector('.invite-actions')).opacity === '1'); await page.screenshot({ path: path.join(output, `${theme}-abierta.png`), fullPage: true });
      await page.getByRole('button', { name: 'Confirmar asistencia' }).click(); await page.getByText('Esta es una muestra. En tu evento, la respuesta se guarda para el organizador.').waitFor();
      await page.getByRole('button', { name: 'Ver video', exact: true }).click(); await page.getByText(/Vista previa lista/).waitFor();
      if (theme === 'champagne') {
        await page.getByRole('button', { name: 'Crear video MP4', exact: true }).click(); await page.getByRole('button', { name: 'Cancelar creación' }).click(); await page.getByText(/Creación cancelada/).waitFor(); assert.equal(await page.getByRole('button', { name: 'Descargar MP4' }).count(), 0);
      }
      await page.getByRole('button', { name: 'Crear video MP4', exact: true }).click(); await page.getByRole('button', { name: 'Descargar MP4', exact: true }).waitFor({ timeout: 40000 });
      await page.screenshot({ path: path.join(output, `${theme}-video-listo.png`), fullPage: true });
      const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar MP4', exact: true }).click(); const video = await download; const file = path.join(output, `${theme}.mp4`); await video.saveAs(file);
      const bytes = fs.readFileSync(file); assert.equal(bytes.toString('ascii', 4, 8), 'ftyp'); assert.ok(bytes.includes(Buffer.from('avc1')) || bytes.includes(Buffer.from('avc3')), 'Video must use H264'); assert.ok(bytes.includes(Buffer.from('mp4a')), 'Video must include AAC music'); assert.ok(bytes.length > 10000 && bytes.length < 15 * 1048576);
      // Decode the actual downloaded MP4 in a separate, isolated page, and inspect
      // several frames. No CSP changes to the application and no external upload.
      const media = await context.newPage();
      await media.setContent('<video muted controls style="max-width:360px;width:100%"></video>');
      await media.evaluate(data => { const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)); document.querySelector('video').src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })); }, bytes.toString('base64'));
      await media.waitForFunction(() => document.querySelector('video').readyState >= 2);
      const metadata = await media.locator('video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })); assert.equal(metadata.width, 720); assert.equal(metadata.height, 1280); assert.ok(metadata.duration >= 15 && metadata.duration < 19, JSON.stringify(metadata));
      for (const time of [3, 8, 14]) {
        await media.locator('video').evaluate((video, time) => new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time; }), time);
        await media.locator('video').screenshot({ path: path.join(output, `${theme}-escena-${time}.png`) });
      }
      await media.close(); await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
      results.push(`${theme}: apertura, sonido optativo, cuenta regresiva, móvil y MP4 H264/AAC de 16 segundos verificado`); console.log(results.at(-1));
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`${base}/invitacion.html?demo=aurora`); await page.locator('.invitation-experience[data-open=true]').waitFor(); assert.equal(await page.getByRole('button', { name: 'Abrir invitación' }).count(), 0); assert.equal(await page.locator('.invite-particles').evaluate(node => getComputedStyle(node).display), 'none'); results.push('Movimiento reducido: acceso directo a la invitación y partículas desactivadas');
    await page.goto(`${base}/invitacion.html?demo=invalid`); await page.getByText('Elegí uno de los temas de muestra del catálogo.').waitFor(); results.push('Muestras limitadas a temas conocidos y sin escrituras de datos');
    assert.deepEqual(errors, []); results.push('Sin errores de JavaScript ni violaciones de CSP');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: true, results }, null, 2)); console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: false, results, error: error.stack }, null, 2)); process.exitCode = 1; });
