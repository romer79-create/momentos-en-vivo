const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('../functions/node_modules/sharp');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000'; const email = process.env.TEST_USER_EMAIL || 'cliente@example.test'; const output = path.resolve(process.env.TEST_OUTPUT || 'test-results/themes'); fs.mkdirSync(output, { recursive: true }); const results = [];
const api = async (suffix, token, method = 'GET', body, key) => {
  const res = await fetch(`${base}/api${suffix}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'X-Event-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json(); assert.ok(res.ok, JSON.stringify(data)); return data;
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const errors = []; const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }); const page = await context.newPage(); page.setDefaultTimeout(20000);
  const watch = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (/Content Security Policy|violates the following/.test(message.text())) errors.push(message.text()); }); }; watch(page);
  try {
    for (const file of ['temas', 'diseno', 'invitacion']) { const res = await fetch(`${base}/${file}.html`); assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/); }
    await page.goto(`${base}/temas.html`); await page.getByRole('heading', { name: 'Tu celebración. Tu estilo.' }).waitFor();
    for (const name of ['Champagne', 'Aurora', 'Disco pop', 'Nocturno']) {
      await page.getByRole('button', { name, exact: true }).click(); await page.evaluate(() => document.fonts.ready);
      const card = await page.locator('.phone-preview').boundingBox(); assert.ok(card.width > 300 && card.height < 1200, 'Preview must remain a readable phone-sized card');
      await page.screenshot({ path: path.join(output, `galeria-${name.toLowerCase().replace(' ', '-')}.png`), fullPage: true });
    }
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`); }
    results.push('Cuatro temas, imágenes reales, CSP y galería sin desbordes a 320–1440 px');
    const signed = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba-local-123456', returnSecureToken: true }) }).then(r => r.json()); const token = signed.idToken; assert.ok(token);
    const event = await api('/events', token, 'POST', { name: `Celebración de prueba ${Date.now()}`, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '20:00' }); const eventPath = `/events/${event.id}`;
    await page.goto(`${base}/diseno.html?event=${event.id}`); await page.getByLabel('Correo electrónico', { exact: true }).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill('Prueba-local-123456'); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.getByRole('heading', { name: 'Diseñá tu momento' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Publicar invitación', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Elegir Aurora' }).click(); await page.getByLabel('Nombre del lugar', { exact: true }).fill('Posadas'); await page.getByLabel('Dirección y ciudad', { exact: true }).fill('Salón de prueba, Posadas');
    const literal = '<img src=x onerror=alert(1)> Un recuerdo'; await page.getByLabel('Subtítulo', { exact: true }).fill(literal);
    await page.getByLabel('Foto de portada', { exact: true }).setInputFiles(path.resolve('public/assets/themes/nocturno.webp')); await page.getByText('Imagen guardada en este evento.', { exact: true }).waitFor();
    const backgroundUpload = page.waitForResponse(r => r.url().includes('/theme-assets/background') && r.request().method() === 'POST' && r.status() === 201);
    await page.getByLabel('Fondo personalizado', { exact: true }).setInputFiles(path.resolve('public/assets/themes/aurora.webp')); await backgroundUpload;
    await page.getByLabel('Acento', { exact: true }).fill('#f9a8d4'); await page.getByLabel('Tipografía', { exact: true }).selectOption('modern');
    await page.getByLabel('Ofrecer música al abrir la invitación', { exact: true }).check(); await page.getByLabel('Mostrar cuenta regresiva', { exact: true }).uncheck();
    await page.waitForFunction(() => document.querySelector('.editor-preview .invitation-card')?.dataset.custom === 'true');
    await page.getByRole('button', { name: 'Guardar diseño', exact: true }).click(); await page.getByText('Diseño guardado.', { exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: 'Diseñá tu momento' }).waitFor(); assert.equal(await page.getByLabel('Subtítulo', { exact: true }).inputValue(), literal); assert.equal(await page.locator('img[onerror]').count(), 0);
    const saved = await api(eventPath, token); assert.equal(saved.presentation.themeId, 'aurora'); assert.equal(saved.presentation.custom.accent, '#f9a8d4'); assert.equal(saved.presentation.custom.font, 'modern'); assert.ok(saved.themeAssets.background); results.push('Editor propio: borrador privado, fondo y portada personalizados, colores, tipografía, persistencia y texto seguro');
    assert.equal(saved.presentation.musicEnabled, true); assert.equal(saved.presentation.opening, true); assert.equal(saved.presentation.countdown, false);
    const orderId = randomUUID(); await api('/orders', token, 'POST', { id: orderId, planId: 'evento-1' }); await api(`/orders/${orderId}/simulate`, token, 'POST', { status: 'approved' }); await api(`${eventPath}/activate`, token, 'POST');
    await page.reload(); await page.getByRole('button', { name: 'Publicar invitación', exact: true }).click(); await page.getByText('Diseño guardado e invitación publicada.', { exact: true }).waitFor();
    const url = await page.getByLabel('Enlace de invitación', { exact: true }).inputValue(); assert.ok(url.includes('#'));
    if (!(await page.evaluate(() => Boolean(navigator.clipboard?.writeText)))) {
      await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click(); assert.equal(await page.getByLabel('Enlace para copiar', { exact: true }).inputValue(), url); await page.getByRole('button', { name: 'Listo', exact: true }).click();
      results.push('Enlace de la red local y copia manual disponibles sin HTTPS');
    }
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const guest = await guestContext.newPage(); watch(guest); await guest.goto(url);
    await guest.getByRole('heading', { name: event.name, exact: true }).waitFor(); assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await guest.locator('.invite-sheen').evaluate(node => getComputedStyle(node).animationName), 'none'); assert.equal(await guest.locator('img[onerror]').count(), 0);
    assert.equal(await guest.locator('.invite-countdown').count(), 0); assert.equal(await guest.locator('.invite-sound').getAttribute('aria-pressed'), 'false');
    assert.match(await guest.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href'), /^https:\/\/www.google.com\/maps\/search/);
    await guest.screenshot({ path: path.join(output, 'invitacion-movil.png'), fullPage: true });
    await guest.getByRole('button', { name: 'Confirmar asistencia' }).click(); await guest.getByLabel('Tu nombre y apellido').fill('=Nombre de prueba'); await guest.getByLabel('Personas, incluyéndote').fill('3');
    await guestContext.setOffline(true); await guest.getByRole('button', { name: 'Enviar confirmación', exact: true }).click(); await guest.getByText(/Sin conexión/).waitFor(); await guestContext.setOffline(false);
    await guest.getByRole('button', { name: 'Enviar confirmación', exact: true }).click(); await guest.getByText('¡Gracias! Tu respuesta quedó guardada.').waitFor();
    await guest.getByRole('button', { name: 'Enviar confirmación', exact: true }).click(); await guest.getByText('¡Gracias! Tu respuesta quedó guardada.').waitFor();
    await page.getByRole('button', { name: 'Ver respuestas', exact: true }).click(); await page.getByText('1 respuesta · 3 personas confirmadas').waitFor();
    let downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar lista CSV' }).click(); const csv = await downloading; const csvPath = path.join(output, 'confirmaciones.csv'); await csv.saveAs(csvPath); assert.match(fs.readFileSync(csvPath, 'utf8'), /'=Nombre de prueba/);
    results.push('Invitación móvil: ubicación, movimiento reducido, RSVP sin duplicar y CSV protegido');
    downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar tarjeta PNG' }).click(); const png = await downloading; const pngPath = path.join(output, 'tarjeta.png'); await png.saveAs(pngPath); const meta = await sharp(pngPath).metadata(); assert.equal(meta.width, 1080); assert.ok(meta.height >= 1920);
    results.push('Tarjeta PNG descargable con QR del enlace publicado');
    await page.getByRole('button', { name: 'Preparar video para WhatsApp', exact: true }).click(); await page.getByText(/Vista previa lista/).waitFor();
    await page.getByRole('button', { name: 'Crear video MP4', exact: true }).click(); await page.getByRole('button', { name: 'Descargar MP4', exact: true }).waitFor({ timeout: 40000 });
    downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar MP4', exact: true }).click(); const movie = await downloading; const moviePath = path.join(output, 'invitacion-personalizada.mp4'); await movie.saveAs(moviePath); assert.equal(fs.readFileSync(moviePath).toString('ascii', 4, 8), 'ftyp');
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click(); results.push('Video MP4 con fondo y portada privados, datos propios y QR de la invitación publicada');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); await api(eventPath, token, 'PATCH', { date: today, startTime: '00:00' });
    const imageBase64 = `data:image/webp;base64,${fs.readFileSync('public/assets/themes/aurora.webp').toString('base64')}`; const ids = [];
    for (let i = 0; i < 3; i++) { const id = randomUUID(); ids.push(id); await api(`${eventPath}/photos`, null, 'POST', { id, imageBase64, message: `Recuerdo ${i + 1}` }, event.guestKey); await api(`${eventPath}/photos/${id}`, token, 'PATCH', { status: 'approved' }); }
    const projection = await guestContext.newPage(); await projection.setViewportSize({ width: 1440, height: 1000 }); watch(projection); await projection.goto(`${base}/proyeccion.html?event=${event.id}#${event.projectionKey}`); await projection.locator('.stage[data-count="3"] img').first().waitFor(); assert.equal(await projection.locator('.stage img').count(), 3); assert.equal(await projection.locator('body').getAttribute('data-theme'), 'aurora');
    await projection.screenshot({ path: path.join(output, 'proyeccion-mosaico.png'), fullPage: true });
    await api(`${eventPath}/photos/${ids[1]}`, token, 'PATCH', { status: 'rejected' }); await projection.locator('.stage[data-count="2"]').waitFor({ timeout: 20000 }); assert.equal(await projection.getByText('Recuerdo 2', { exact: true }).count(), 0);
    const capture = await guestContext.newPage(); await capture.goto(`${base}/home.html?event=${event.id}#${event.guestKey}`); await capture.getByRole('button', { name: 'Enviar mi foto' }).waitFor(); assert.equal(await capture.locator('body').getAttribute('data-theme'), 'aurora');
    results.push('Tema compartido en captura y mosaico en vivo; fotos rechazadas retiradas');
    await page.getByRole('button', { name: 'Dejar de publicar la invitación', exact: true }).click(); await page.getByText('Diseño guardado.', { exact: true }).waitFor(); await guest.reload(); await guest.getByText('La invitación no está disponible. Pedí al organizador el enlace actualizado.').waitFor();
    assert.deepEqual(errors, []); results.push('Retiro de invitación y recorrido sin errores de JavaScript o CSP');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: true, results }, null, 2)); console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: false, results, error: error.stack }, null, 2)); process.exitCode = 1; });
