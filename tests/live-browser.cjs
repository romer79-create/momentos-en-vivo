const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000';
const email = process.env.TEST_USER_EMAIL || 'cliente@example.test';
const output = path.resolve(process.env.TEST_OUTPUT || 'test-results/live'); fs.mkdirSync(output, { recursive: true });
const results = [];
async function api(suffix, token, method = 'GET', body, key) {
  const res = await fetch(`${base}/api${suffix}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'X-Event-Key': key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json(); assert.ok(res.ok, JSON.stringify(data)); return data;
}
(async () => {
  assert.equal((await api('/config')).emulator, true, 'Never run this suite against production');
  const signed = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba-local-123456', returnSecureToken: true }) }).then(res => res.json()); const token = signed.idToken; assert.ok(token);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const event = await api('/events', token, 'POST', { name: 'Un nuevo momento · prueba visual', date: today, startTime: '00:00' }); const eventPath = `/events/${event.id}`;
  const order = randomUUID(); await api('/orders', token, 'POST', { id: order, planId: 'evento-1' }); await api(`/orders/${order}/simulate`, token, 'POST', { status: 'approved' }); await api(`${eventPath}/activate`, token, 'POST');
  const upload = async (message, asset = 'champagne') => api(`${eventPath}/photos`, null, 'POST', { id: randomUUID(), imageBase64: `data:image/webp;base64,${fs.readFileSync(`public/assets/themes/${asset}-wide.webp`).toString('base64')}`, message }, event.guestKey);
  const moderate = (id, status) => api(`${eventPath}/photos/${id}`, token, 'PATCH', { status });
  for (let i = 0; i < 3; i++) { const photo = await upload(`Recuerdo inicial ${i + 1}`, ['champagne', 'aurora', 'nocturno'][i]); await moderate(photo.id, 'approved'); }
  const pending = await upload('Pendiente anterior');
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const errors = []; const watch = page => { page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); page.on('console', msg => { if (/Content Security Policy|violates the following/.test(msg.text())) errors.push(msg.text()); }); };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage(); watch(page);
  try {
    await page.goto(`${base}/moderador.html?event=${event.id}`); await page.getByLabel('Correo electrónico', { exact: true }).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill('Prueba-local-123456'); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.getByRole('button', { name: 'Configurar publicación automática' }).click(); const activate = page.getByRole('button', { name: 'Activar publicación automática', exact: true }); assert.equal(await activate.isDisabled(), true);
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
    await page.screenshot({ path: path.join(output, 'consentimiento-movil.png'), fullPage: true });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal((await api(eventPath, token)).autoApprove, false);
    await page.getByRole('button', { name: 'Configurar publicación automática' }).click(); await page.getByRole('checkbox').check(); await activate.click(); await page.getByText('Activo · publicación automática', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Estado de las fotos').inputValue(), 'approved');
    assert.ok((await api(`${eventPath}/photos?status=pending`, token)).photos.some(photo => photo.id === pending.id));
    await page.screenshot({ path: path.join(output, 'moderacion-automatica-movil.png'), fullPage: true });
    results.push('Consentimiento explícito en celular, cancelación sin cambios, solo nuevas fotos y filtro de aprobadas');

    const projectionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const projection = await projectionContext.newPage(); watch(projection);
    await projection.goto(`${base}/proyeccion.html?event=${event.id}#${event.projectionKey}`); await projection.waitForFunction(() => document.querySelectorAll('.live-frame img').length === 3); assert.equal(await projection.locator('.photo-spotlight').count(), 0);
    const captureContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const capture = await captureContext.newPage(); watch(capture);
    await capture.goto(`${base}/home.html?event=${event.id}#${event.guestKey}`); await capture.getByText(/Este evento publica las fotos automáticamente/).waitFor();
    await capture.getByLabel('Elegí o tomá una foto').setInputFiles(path.resolve('public/assets/themes/aurora.webp')); await capture.getByLabel('Mensaje · opcional, hasta 200 caracteres').fill('Nuestro nuevo recuerdo');
    const received = capture.waitForResponse(res => res.url().endsWith(`${eventPath}/photos`) && res.request().method() === 'POST'); await capture.getByRole('button', { name: 'Enviar mi foto' }).click(); const sent = await (await received).json();
    await capture.getByText('¡Foto publicada! Ya puede aparecer en la pantalla del evento.').waitFor();
    const spotlight = projection.locator(`.photo-spotlight[data-photo-id="${sent.id}"]`); await spotlight.waitFor();
    assert.equal(await projection.locator(`.live-frame[data-photo-id="${sent.id}"]`).count(), 0);
    await projection.waitForFunction(() => getComputedStyle(document.querySelector('.live-frame')).filter.includes('blur(9px)'));
    assert.equal(await projection.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, 'Projection must fit the screen vertically');
    await projection.screenshot({ path: path.join(output, 'foto-destacada.png'), fullPage: true });
    await spotlight.waitFor({ state: 'detached', timeout: 10000 }); await projection.locator(`.live-frame[data-photo-id="${sent.id}"]`).waitFor();
    results.push('Foto enviada desde el celular: destacada durante seis segundos, fondo difuminado e incorporación al carrusel');

    const first = await upload('Primera de la tanda'); const second = await upload('Segunda de la tanda', 'disco-pop');
    await projection.locator(`.photo-spotlight[data-photo-id="${first.id}"]`).waitFor(); await projection.locator(`.photo-spotlight[data-photo-id="${second.id}"]`).waitFor({ timeout: 15000 });
    await moderate(second.id, 'rejected'); await projection.locator(`.photo-spotlight[data-photo-id="${second.id}"]`).waitFor({ state: 'detached', timeout: 7000 }); assert.equal(await projection.getByText('Segunda de la tanda', { exact: true }).count(), 0);
    results.push('Llegadas en cola sin superposición y retiro de una foto durante su presentación');

    await page.getByRole('button', { name: 'Volver a revisión manual' }).click(); await page.getByText('Desactivado · revisión manual', { exact: true }).waitFor();
    // The already-open capture page still advertised automatic mode. Its feedback
    // must use the server decision after the owner changes that setting.
    await capture.getByLabel('Elegí o tomá una foto').setInputFiles(path.resolve('public/assets/themes/nocturno.webp'));
    await capture.getByRole('button', { name: 'Enviar mi foto' }).click(); await capture.getByText('¡Foto recibida! Se mostrará cuando el organizador la apruebe.').waitFor();
    await projection.emulateMedia({ reducedMotion: 'reduce' }); await moderate(pending.id, 'approved'); const manual = projection.locator(`.photo-spotlight[data-photo-id="${pending.id}"]`); await manual.waitFor(); assert.equal(await manual.evaluate(node => getComputedStyle(node).animationName), 'none');
    await projection.setViewportSize({ width: 390, height: 844 }); assert.equal(await projection.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false); await projection.screenshot({ path: path.join(output, 'destacada-movil.png'), fullPage: true });
    results.push('Vuelta a revisión manual, respuesta correcta con página antigua, destaque de aprobación manual y movimiento reducido');
    assert.deepEqual(errors, []); results.push('Sin errores de JavaScript ni violaciones de CSP');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: true, results }, null, 2)); console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: false, results, error: error.stack }, null, 2)); process.exitCode = 1; });
