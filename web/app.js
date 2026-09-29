import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { createDesign } from './themes';
import { randomId, copyText, localEmulator } from './browser-support';
import { moderationSettings } from './event-settings';
import { setupSteps, reviewActivation } from './event-setup';
import { albumDownload } from './album-download';
import { runProjection } from './projection';
import { mountAssistant, nextStep } from './event-assistant';

const main = document.querySelector('#app');
const nav = document.querySelector('#navigation');
const page = document.body.dataset.page;
const eventId = new URLSearchParams(location.search).get('event') || '';
const eventKey = location.hash.slice(1);
let auth, check, account, noticeTimer;
let guideContext = {};
const updateGuide = context => { guideContext = context; };
const design = createDesign({ main, el, button, field, request, eventPath, eventId, notice, save, updateGuide });
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function notice(message, error = false) {
  const node = document.querySelector('#notice'); node.textContent = message; node.className = `visible${error ? ' error' : ''}`;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.className = ''; }, 6500);
}
function button(label, action, css = '') {
  return el('button', { type: 'button', class: css, onClick: async e => {
    const target = e.currentTarget; target.disabled = true;
    try { await action(); } catch (error) { notice(error.message || 'No pudimos completar la operación.', true); }
    finally { target.disabled = false; }
  } }, label);
}
function field(label, input) { return el('label', { class: 'field' }, label, input); }
function intro(kicker, title, description) { return el('div', { class: 'intro' }, el('div', {}, el('p', { class: 'eyebrow' }, kicker), el('h1', {}, title), el('p', { class: 'muted' }, description))); }
function empty(text) { return el('div', { class: 'empty' }, text); }
async function request(path, { method = 'GET', data, guest = false, blob = false } = {}) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (guest) { headers['X-Event-Key'] = eventKey; if (check && method === 'POST') headers['X-Firebase-AppCheck'] = (await getToken(check)).token; }
  else if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  let response;
  try { response = await fetch(`/api${path}`, { method, headers, body: data ? JSON.stringify(data) : undefined, cache: 'no-store', signal: AbortSignal.timeout(90000) }); }
  catch { throw new Error('Sin conexión. Tus cambios no se confirmaron; intentá otra vez.'); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})); const error = new Error(payload.error || 'No pudimos completar la operación.'); error.status = response.status; throw error;
  }
  return blob ? response.blob() : response.json();
}
function eventPath(suffix = '') { return `/events/${encodeURIComponent(eventId)}${suffix}`; }
function linkFor(event, projection = false) { return `${location.origin}/${projection ? 'proyeccion' : 'home'}.html?event=${encodeURIComponent(event.id)}#${projection ? event.projectionKey : event.guestKey}`; }
function save(blob, name) {
  const url = URL.createObjectURL(blob); const anchor = el('a', { href: url, download: name }); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function init() {
  mountAssistant({ el, button, page, getContext: () => guideContext });
  if (page === 'themes') return design.gallery();
  if (page === 'invitation' && new URLSearchParams(location.search).has('demo')) return design.invitation();
  const apiConfig = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(r => { if (!r.ok) throw new Error('El servicio no está disponible.'); return r.json(); }).catch(() => { throw new Error('El servicio está tardando en responder. Volvé a intentar en unos segundos.'); });
  const local = localEmulator(apiConfig, location.hostname);
  const config = local ? { apiKey: 'demo-key', projectId: 'demo-momentos', authDomain: 'localhost' } : await fetch('/__/firebase/init.json').then(r => r.json());
  const app = initializeApp(config); auth = getAuth(app);
  if (local) connectAuthEmulator(auth, apiConfig.authEmulatorSameOrigin === true ? location.origin : 'http://127.0.0.1:9099', { disableWarnings: true });
  if (!local && apiConfig.appCheckSiteKey) check = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(apiConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  await setPersistence(auth, browserSessionPersistence);
  await new Promise(resolve => { const unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); }); });
  // Legacy browser role flags are never used for authorization.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (page === 'login' || page === 'register') return login();
  if (page === 'capture') return capture();
  if (page === 'projection') return projection();
  if (page === 'invitation') return design.invitation();
  if (!auth.currentUser) { location.replace(`/cliente-login.html?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
  if (!auth.currentUser.emailVerified) return verifyEmail();
  account = await request('/me');
  nav.append(el('a', { href: '/cliente-panel.html', 'aria-current': page === 'panel' ? 'page' : null }, 'Mis eventos'), el('a', { href: '/compras.html', 'aria-current': page === 'purchases' ? 'page' : null }, 'Compras'), button('Salir', async () => { await signOut(auth); location.assign('/cliente-login.html'); }, 'secondary'));
  if (page === 'moderator') return moderator();
  if (page === 'purchases') return purchases();
  if (page === 'payment') return payment();
  if (page === 'design') return design.editor();
  return panel();
}
function accountDestination() {
  const next = new URLSearchParams(location.search).get('next');
  if (next) {
    try { const url = new URL(next, location.origin); if (url.origin === location.origin && ['/cliente-panel.html', '/admin.html', '/compras.html', '/pago.html', '/moderador.html', '/diseno.html'].includes(url.pathname)) return url.pathname + url.search; } catch {}
  }
  const plan = new URLSearchParams(location.search).get('plan');
  return ['evento-1', 'pack-3', 'pack-10'].includes(plan) ? `/compras.html?plan=${encodeURIComponent(plan)}` : '/cliente-panel.html';
}
function verifyEmail() {
  main.replaceChildren(el('section', { class: 'card auth' }, el('p', { class: 'eyebrow' }, 'Un paso más'), el('h1', {}, 'Revisá tu correo'), el('p', { class: 'muted' }, 'Abrí el enlace de verificación. Después volvé a ingresar para preparar tu evento y elegir tu compra.'), button('Reenviar verificación', async () => { await sendEmailVerification(auth.currentUser); notice('Te enviamos un nuevo enlace.'); }), el('div', { class: 'actions' }, button('Volver a ingresar', async () => { const destination = ['payment', 'purchases', 'moderator'].includes(page) ? location.pathname + location.search : accountDestination(); await signOut(auth); location.assign(`/cliente-login.html?next=${encodeURIComponent(destination)}`); }, 'secondary'))));
}
function login() {
  const register = page === 'register';
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, maxlength: 254 });
  const password = el('input', { type: 'password', name: 'password', autocomplete: register ? 'new-password' : 'current-password', required: true, minlength: register ? 12 : 1, maxlength: 128 });
  const submit = el('button', { type: 'submit' }, register ? 'Crear mi cuenta' : 'Ingresar');
  const feedback = el('p', { class: 'status', role: 'alert' });
  const form = el('form', { onSubmit: async event => {
    event.preventDefault(); submit.disabled = true; feedback.textContent = '';
    try {
      if (register) { const result = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value); await sendEmailVerification(result.user); verifyEmail(); }
      else { await signInWithEmailAndPassword(auth, email.value.trim(), password.value); location.assign(accountDestination()); }
    } catch (err) { feedback.textContent = err.code === 'auth/too-many-requests' ? 'Esperá unos minutos antes de volver a intentar.' : register ? 'No se pudo crear la cuenta. Revisá el correo y usá una contraseña de al menos 12 caracteres. Si ya tenés cuenta, ingresá o recuperá tu contraseña.' : 'No pudimos ingresar. Revisá tu correo y contraseña.'; }
    finally { submit.disabled = false; }
  } }, field('Correo electrónico', email), field(register ? 'Contraseña · mínimo 12 caracteres' : 'Contraseña', password), submit, feedback);
  main.replaceChildren(el('section', { class: 'card auth' }, el('p', { class: 'eyebrow' }, 'Tu próximo gran momento'), el('h1', {}, register ? 'Empezá por tu cuenta' : 'Qué bueno verte'), el('p', { class: 'muted' }, register ? 'Registrate, verificá tu correo y prepará tu evento. Comprá uno o un paquete y activalo cuando esté listo, sin esperar una habilitación.' : 'Entrá para preparar y acompañar tus eventos.'), form,
    register ? el('a', { href: `/cliente-login.html?next=${encodeURIComponent(accountDestination())}` }, 'Ya tengo una cuenta') : el('div', {}, button('Olvidé mi contraseña', async () => { if (!email.value || !email.checkValidity()) { email.reportValidity(); return; } await sendPasswordResetEmail(auth, email.value.trim()).catch(() => {}); notice('Si existe una cuenta con ese correo, recibirás las instrucciones.'); }, 'secondary'), el('p', {}, '¿Primera vez? ', el('a', { href: `/registro.html?next=${encodeURIComponent(accountDestination())}` }, 'Crear cuenta')))));
}
async function panel() {
  main.replaceChildren(intro('Vamos paso a paso', account.admin ? 'Todos los eventos' : 'Tus eventos, sin vueltas', 'Empezá con nombre, fecha y hora. Te guiamos para elegir el tema, activar tu evento y compartirlo.'));
  const balance = el('section', { class: 'balance-card', 'aria-label': 'Saldo de eventos' });
  const name = el('input', { required: true, maxlength: 100, placeholder: 'Por ejemplo, casamiento de Ana y Juan', name: 'eventName' });
  const date = el('input', { type: 'date', required: true, name: 'eventDate' });
  const startTime = el('input', { type: 'time', required: true, name: 'eventStartTime', value: '00:00' });
  const submit = el('button', { type: 'submit' }, 'Guardar y elegir diseño →');
  const grid = el('div', { class: 'grid' });
  const form = el('form', { class: 'form-row event-form', onSubmit: async e => {
    e.preventDefault(); submit.disabled = true;
    try { const created = await request('/events', { method: 'POST', data: { name: name.value, date: date.value, startTime: startTime.value || '00:00' } }); location.assign(`/diseno.html?event=${encodeURIComponent(created.id)}&setup=1`); }
    catch (err) { notice(err.message, true); } finally { submit.disabled = false; }
  } }, field('Nombre del evento', name), field('Fecha', date), field('Hora de inicio', startTime), submit);
  main.append(balance, el('section', { class: 'card draft-creator', id: 'nuevo-evento' }, el('h2', {}, 'Primero, contanos qué vas a celebrar'), setupSteps(el), el('p', { class: 'muted' }, 'Solo necesitás estos tres datos. Crear el borrador no consume saldo. Después elegís un tema listo para usar. Fecha y hora de Argentina.'), form), grid);
  async function load() {
    const [result, currentAccount] = await Promise.all([request('/events'), request('/me')]); account = currentAccount;
    balance.replaceChildren(balanceContent(account.credits), el('a', { class: 'button secondary', href: '/compras.html' }, 'Comprar eventos'));
    const { events } = result; updateGuide({ events }); grid.replaceChildren();
    if (!events.length) { grid.append(empty('Tu primer evento empieza acá. Guardá un borrador y activalo cuando tengas todo listo.')); return; }
    for (const event of events) {
      const draft = event.status === 'draft';
      const beforeStart = event.startsAt && new Date(event.startsAt).getTime() > Date.now();
      const ended = event.receivesUntil && new Date(event.receivesUntil).getTime() <= Date.now();
      const expired = event.downloadUntil && new Date(event.downloadUntil).getTime() <= Date.now();
      const state = draft ? 'Borrador' : expired ? 'Finalizado' : event.status === 'closed' ? 'Cerrado' : ended ? 'Solo descargas' : beforeStart ? 'Programado' : 'Abierto';
      const eventUrl = `/events/${encodeURIComponent(event.id)}`;
      const card = el('article', { class: `card event-card${draft ? ' draft-card' : ''}` }, el('div', { class: 'event-head' }, el('h2', {}, event.name), el('span', { class: `pill ${draft ? 'draft' : state === 'Abierto' ? '' : 'closed'}` }, state)), el('p', { class: 'muted' }, `${event.date} · ${event.startTime || eventTime(event.startsAt)} h · ${event.photoCount || 0} fotos`));
      card.id = `evento-${event.id}`;
      card.append(nextStep(el, event));
      if (draft) {
        const editName = el('input', { required: true, maxlength: 100, value: event.name });
        const editDate = el('input', { type: 'date', required: true, value: event.date });
        const editTime = el('input', { type: 'time', required: true, value: event.startTime || '00:00' });
        const saveDraft = el('button', { type: 'submit', class: 'secondary' }, 'Guardar borrador');
        const editor = el('details', {}, el('summary', {}, 'Editar borrador'), el('form', { class: 'draft-editor', onSubmit: async e => {
          e.preventDefault(); saveDraft.disabled = true;
          try { await request(eventUrl, { method: 'PATCH', data: { name: editName.value, date: editDate.value, startTime: editTime.value || '00:00' } }); await load(); notice('Borrador actualizado.'); }
          catch (err) { notice(err.message, true); } finally { saveDraft.disabled = false; }
        } }, field('Nombre', editName), field('Fecha del evento', editDate), field('Hora de inicio · Argentina', editTime), saveDraft));
        const clientEvent = account.admin && event.ownerId && event.ownerId !== account.uid;
        const activate = button(clientEvent ? 'Revisar y activar para el cliente' : 'Revisar y activar', () => reviewActivation({ event, el, button, request, notice, dateTime, onActivated: load }));
        activate.disabled = !clientEvent && !(account.credits >= 1);
        card.id = `evento-${event.id}`;
        card.append(setupSteps(el, event.presentation ? 3 : 2), el('p', { class: 'muted' }, event.presentation ? 'Tu diseño está guardado. Revisá las condiciones antes de usar tu saldo.' : 'Elegí un tema o conservá el estilo inicial. Podés seguir editando después de activar.'), editor, el('div', { class: 'actions' }, activate));
        if (activate.disabled) card.append(el('p', { class: 'muted' }, 'Necesitás 1 evento disponible. ', el('a', { href: '/compras.html' }, 'Elegí un evento o un paquete.')));
        if (clientEvent) card.append(el('p', { class: 'privacy' }, 'La activación usa 1 evento del saldo de este cliente.'));
      } else {
        const dates = el('dl', { class: 'event-dates' });
        for (const [label, value] of [['Comienza', event.startsAt], ['Recibe fotos hasta', event.receivesUntil], ['Descargas hasta', event.downloadUntil]]) if (value) dates.append(el('div', {}, el('dt', {}, label), el('dd', {}, dateTime(value))));
        card.append(dates);
        if (beforeStart && !event.photoCount && !ended) {
          const editName = el('input', { required: true, maxlength: 100, value: event.name });
          const editDate = el('input', { type: 'date', required: true, value: event.date });
          const editTime = el('input', { type: 'time', required: true, value: event.startTime || '00:00' });
          const save = el('button', { type: 'submit', class: 'secondary' }, 'Guardar programación');
          card.append(el('details', {}, el('summary', {}, 'Cambiar antes del inicio'), el('form', { class: 'draft-editor', onSubmit: async e => {
            e.preventDefault(); save.disabled = true;
            try { await request(eventUrl, { method: 'PATCH', data: { name: editName.value, date: editDate.value, startTime: editTime.value } }); await load(); notice('Programación actualizada. No se consumió saldo adicional.'); }
            catch (err) { notice(err.message, true); } finally { save.disabled = false; }
          } }, field('Nombre', editName), field('Nueva fecha', editDate), field('Nueva hora · Argentina', editTime), save)));
        }
        if (!expired) card.append(el('div', { class: 'actions' }, el('a', { class: 'button', href: `/moderador.html?event=${encodeURIComponent(event.id)}` }, 'Administrar fotos')));
        if (!ended && !expired && event.status === 'active') {
          card.append(el('div', { class: 'actions' }, button('Ver QR', () => showQR(event), 'secondary')), el('div', { class: 'links' }, button('Copiar enlace para invitados', async () => { if (await copyText(linkFor(event))) notice('Enlace copiado.'); }), button('Abrir proyección ↗', () => window.open(linkFor(event, true), '_blank', 'noopener,noreferrer'))));
          if (beforeStart) card.append(el('p', { class: 'privacy' }, 'Ya podés compartir el QR. La recepción de fotos comienza en el horario programado.'));
        }
        if (!expired) {
          const options = el('div', { class: 'actions' });
          if (!ended) options.append(button(event.status === 'active' ? 'Cerrar recepción y proyección' : 'Reabrir evento', async () => { await request(eventUrl, { method: 'PATCH', data: { status: event.status === 'active' ? 'closed' : 'active' } }); await load(); }, 'secondary'));
          if (!ended) options.append(button('Renovar enlaces', async () => { if (!confirm('La invitación, el QR y el enlace de proyección anteriores dejarán de funcionar. ¿Renovarlos?')) return; await request(eventUrl, { method: 'PATCH', data: { rotateLinks: true } }); await load(); notice('Enlaces renovados. Compartí la nueva invitación y el nuevo QR.'); }, 'secondary'));
          if (options.childElementCount) card.append(el('details', {}, el('summary', {}, 'Opciones del evento'), options));
        }
      }
      if (!expired) card.append(el('div', { class: 'actions' }, el('a', { class: 'button secondary', href: `/diseno.html?event=${encodeURIComponent(event.id)}${draft ? '&setup=1' : ''}` }, draft ? 'Elegir diseño e invitación' : event.presentation?.published ? 'Editar o compartir invitación' : 'Publicar mi invitación')));
      if (!ended && !expired) card.append(el('details', { class: 'event-options' }, el('summary', {}, 'Opciones de publicación · opcional'), moderationSettings({ event, el, button, request, notice, onChange: load })));
      grid.append(card);
    }
  }
  await load();
  const setupId = new URLSearchParams(location.search).get('setup');
  if (setupId) document.getElementById(`evento-${setupId}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
  if (account.admin) {
    const service = el('section', { class: 'card support-card' }, el('h2', {}, 'Estado del servicio'));
    main.append(service);
    try {
      const health = await request('/admin/service-status');
      const modes = { disabled: 'pendiente de configurar', local: 'simulación local', sandbox: 'prueba de Mercado Pago', live: 'activos', preview: 'vista previa local', smtp: 'envío habilitado' };
      service.append(el('p', { class: 'muted' }, `Cobros: ${modes[health.payments]}. Correos: ${modes[health.mail]}. Limpieza automática: ${health.cleanup ? 'habilitada para eventos con política y aviso válido' : 'desactivada'}.`));
      const reasons = { expiry_notice_missing_or_late: 'Aviso de vencimiento ausente o tardío: las fotos se conservaron.', cleanup_failed: 'La limpieza necesita revisión.', delivery_failed: 'Un correo no pudo enviarse después de varios intentos.', album_failed: 'Un álbum necesita revisión.', duplicate_payment: 'Se recibió un pago duplicado.', reconciliation_failed: 'No se pudo verificar una compra.', refunded: 'Hay un reembolso para revisar.', charged_back: 'Hay un contracargo para revisar.', review: 'Una compra necesita revisión.' };
      if (!health.issues.length) service.append(el('p', {}, 'Sin incidencias registradas.'));
      else service.append(el('ul', {}, ...health.issues.map(issue => el('li', {}, reasons[issue.reason] || 'Hay una operación pendiente de revisión.', el('small', {}, ` Referencia: ${issue.eventId || issue.orderId || issue.id}`)))));
    } catch (error) { service.append(el('p', { class: 'status' }, error.message)); }
    const email = el('input', { type: 'email', required: true, name: 'clientEmail' });
    const action = el('select', { required: true, name: 'clientAction', 'aria-label': 'Acción' }, el('option', { value: '', disabled: true, selected: true }, 'Elegí una acción'), el('option', { value: 'disable' }, 'Suspender cliente'), el('option', { value: 'enable' }, 'Reactivar cliente'));
    const send = el('button', { type: 'submit' }, 'Guardar acceso');
    main.append(el('section', { class: 'card support-card' }, el('h2', {}, 'Resolver un problema de acceso'), el('p', { class: 'muted' }, 'Los clientes compran y activan sus eventos por su cuenta. Usá estas opciones solo para suspender o restablecer una cuenta; no agregan eventos a su saldo. La persona deberá volver a ingresar.'), el('form', { class: 'form-row', onSubmit: async e => { e.preventDefault(); send.disabled = true; try { await request('/admin/enable-client', { method: 'POST', data: { email: email.value, enabled: action.value === 'enable' } }); notice('Acceso actualizado.'); } catch (err) { notice(err.message, true); } finally { send.disabled = false; } } }, field('Correo del cliente', email), field('Acción', action), send)));
  }
}
function eventTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : '00:00';
}
function dateTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'A confirmar';
}
function money(priceCents) {
  return Number.isSafeInteger(priceCents) && priceCents >= 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: priceCents % 100 ? 2 : 0 }).format(priceCents / 100) : 'Precio por confirmar';
}
function balanceContent(value) {
  const credits = Number.isSafeInteger(value) ? value : 0;
  return el('div', {}, el('p', { class: 'eyebrow' }, 'Tu saldo'), el('p', { class: 'balance-number', role: 'status' }, credits, el('span', {}, credits === 1 ? ' evento disponible' : ' eventos disponibles')), el('p', { class: 'balance-caption' }, credits < 0 ? 'Hay un ajuste pendiente en tu cuenta. Revisá el historial de compras.' : 'Usás 1 por cada evento que activás.'));
}
function billingNotice(mode) {
  if (mode === 'local') return el('div', { class: 'billing-notice test-notice', role: 'note' }, el('strong', {}, 'Prueba local · no se realizan cobros'), el('p', {}, 'Los precios configurados son de referencia. Podés simular una compra y su resultado sin ingresar datos de pago.'));
  if (mode === 'sandbox') return el('div', { class: 'billing-notice test-notice', role: 'note' }, el('strong', {}, 'Compra de prueba · no se realizan cobros reales'), el('p', {}, 'Este recorrido usa el entorno de prueba de Mercado Pago. Los importes corresponden a una simulación.'));
  if (mode === 'live') return el('div', { class: 'billing-notice', role: 'note' }, el('strong', {}, 'Pagás en pesos argentinos'), el('p', {}, 'Completás el pago en Mercado Pago. Los eventos se acreditan cuando se confirma la compra.'));
  return el('div', { class: 'billing-notice', role: 'note' }, el('strong', {}, 'Las compras todavía no están disponibles'), el('p', {}, 'Mientras tanto, podés preparar y guardar los borradores de tus próximos eventos.'));
}
function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['www.mercadopago.com.ar', 'sandbox.mercadopago.com.ar'].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith('/checkout/')) return url.href;
  } catch {}
  return null;
}
function paymentLink(id) { return `/pago.html?order=${encodeURIComponent(id)}`; }
function continueOrder(order, mode) {
  if (!order.id) throw new Error('No pudimos identificar la compra. Actualizá el historial antes de reintentar.');
  if (mode === 'local' || order.status !== 'pending') { location.assign(paymentLink(order.id)); return; }
  const destination = checkoutUrl(order.checkoutUrl);
  if (!destination) throw new Error('El enlace de pago no está disponible. Revisá el estado de esta compra antes de intentar otra.');
  location.assign(destination);
}
const purchaseAttempts = new Map();
function attemptId(planId) {
  const key = `momentos-purchase:${account.uid}:${planId}`;
  let stored = purchaseAttempts.get(key);
  try { stored ||= sessionStorage.getItem(key); } catch {}
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored || '')) stored = randomId();
  purchaseAttempts.set(key, stored);
  try { sessionStorage.setItem(key, stored); } catch {}
  return stored;
}
function clearAttempt(planId) {
  const key = `momentos-purchase:${account.uid}:${planId}`;
  purchaseAttempts.delete(key); try { sessionStorage.removeItem(key); } catch {}
}
function orderState(status) {
  return ({ pending: ['Pendiente', 'pending'], approved: ['Acreditado', 'approved'], rejected: ['Rechazado', 'rejected'], refunded: ['Reintegrado', 'closed'], charged_back: ['Pago revertido', 'rejected'], review: ['En revisión', 'pending'] })[status] || ['Por confirmar', 'pending'];
}
function orderBadge(order) {
  const [label, css] = orderState(order.status);
  return el('span', { class: `pill payment-status ${css}` }, label);
}
function planTerms(terms = {}) {
  const list = el('ul', { class: 'plan-features' });
  for (const [key, suffix] of [['photoLimit', 'fotos por evento'], ['receptionHours', 'horas para recibir fotos'], ['downloadDays', 'días para descargar las fotos']]) {
    if (Number.isFinite(terms[key]) && terms[key] > 0) list.append(el('li', {}, `${new Intl.NumberFormat('es-AR').format(terms[key])} ${suffix}`));
  }
  list.append(el('li', {}, 'QR, moderación y proyección incluidos'));
  if (terms.creditMonths) list.append(el('li', {}, `${terms.creditMonths} meses desde la acreditación para activar los eventos comprados`));
  if (terms.retentionPolicy) list.append(el('li', {}, 'Eliminación de fotos, imágenes, música y respuestas al vencer el plazo, con aviso previo por correo'));
  return list;
}
async function purchases() {
  main.replaceChildren(intro('Listo para celebrar', 'Un evento o muchos momentos', 'Elegí tu compra, prepará los detalles y activá cada evento cuando esté listo.'));
  const content = el('div', {}); main.append(content);
  async function load() {
    const [catalog, billing] = await Promise.all([request('/catalog'), request('/billing')]);
    account.credits = billing.balance;
    const available = catalog.checkoutEnabled === true && ['local', 'sandbox', 'live'].includes(catalog.mode) && billing.mode === catalog.mode;
    const balance = el('section', { class: 'balance-card' }, balanceContent(billing.balance), el('a', { class: 'button secondary', href: '/cliente-panel.html' }, 'Preparar mi evento'));
    const plans = el('div', { class: 'plans-grid' }); const controls = []; let submitting = false;
    const feedback = el('p', { class: 'status purchase-feedback', role: 'status', 'aria-live': 'polite' });
    for (const plan of catalog.plans || []) {
      const configured = Number.isSafeInteger(plan.priceCents) && plan.priceCents > 0 && !plan.quoteOnly;
      const allowed = available && configured;
      const purchase = el('button', { type: 'button', disabled: !allowed, onClick: async () => {
        if (!allowed || submitting) return;
        submitting = true; controls.forEach(item => { item.node.disabled = true; }); feedback.textContent = 'Preparando tu compra…';
        try {
          const order = await request('/orders', { method: 'POST', data: { planId: plan.id, id: attemptId(plan.id) } });
          // Keep the same identifier until the server has acknowledged this purchase.
          feedback.textContent = 'Compra preparada. Abriendo el pago…'; continueOrder(order, order.mode || catalog.mode); clearAttempt(plan.id);
        } catch (err) { feedback.textContent = `${err.message} Podés reintentar o revisar tu historial antes de iniciar otra compra.`; }
        finally { submitting = false; controls.forEach(item => { item.node.disabled = !item.allowed; }); }
      } }, allowed ? `Elegir ${plan.credits === 1 ? '1 evento' : `${plan.credits} eventos`}` : 'Próximamente');
      controls.push({ node: purchase, allowed });
      const consult = el('a', { class: 'button secondary', href: 'https://wa.me/5493764104660?text=Hola%2C%20Sylar.soluciones.%20Quiero%20consultar%20por%20el%20paquete%20de%2010%20eventos%20de%20Momentos%20en%20Vivo.', target: '_blank', rel: 'noopener noreferrer' }, 'Consultar por 10 eventos ↗');
      const card = el('article', { class: `card plan-card${plan.id === 'pack-3' ? ' featured-plan' : ''}` }, el('p', { class: 'eyebrow' }, plan.credits === 1 ? 'Una celebración' : 'Más momentos por preparar'), el('h2', {}, plan.title), el('p', { class: 'plan-count' }, `${plan.credits} ${plan.credits === 1 ? 'evento' : 'eventos'}`), el('p', { class: 'plan-price' }, plan.quoteOnly ? 'Consultar' : money(configured ? plan.priceCents : null), configured ? el('small', {}, ' ARS') : null), el('p', { class: 'muted plan-payment' }, plan.quoteOnly ? 'Presupuesto según tus necesidades' : 'Pago por única vez'), plan.quoteOnly ? el('p', { class: 'muted' }, 'Contanos qué eventos organizás y te preparamos una propuesta.') : planTerms(catalog.terms), plan.quoteOnly ? consult : purchase);
      const single = catalog.plans.find(p => p.id === 'evento-1');
      if (plan.id === 'pack-3' && single?.priceCents && plan.priceCents === single.priceCents * 3 * .9) card.querySelector('.plan-count').after(el('span', { class: 'pill' }, '10% de descuento'));
      plans.append(card);
    }
    if (!plans.childElementCount) plans.append(empty('Los planes estarán disponibles pronto. Ya podés preparar tu borrador.'));
    const history = el('section', { class: 'purchase-history', 'aria-label': 'Historial de compras' }, el('div', { class: 'section-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Todo en un lugar'), el('h2', {}, 'Tus compras')), button('Actualizar compras', load, 'secondary')));
    const orders = billing.orders || [];
    if (!orders.length) history.append(empty('Todavía no hiciste ninguna compra. Cuando elijas un evento o un paquete, aparecerá acá.'));
    for (const order of orders) {
      const actions = el('div', { class: 'order-actions' }, el('a', { class: 'button secondary', href: paymentLink(order.id) }, 'Ver detalle'));
      if (order.status === 'pending' || order.status === 'review') actions.append(button('Comprobar pago', async () => { const updated = await request(`/orders/${encodeURIComponent(order.id)}/refresh`, { method: 'POST' }); await load(); notice(updated.status === 'approved' ? 'Compra confirmada. Tu saldo está actualizado.' : 'Estado de la compra actualizado.'); }, 'secondary'));
      if (order.status === 'pending' && (billing.mode === 'local' || checkoutUrl(order.checkoutUrl))) actions.append(button('Continuar pago', () => continueOrder(order, order.mode || billing.mode)));
      else if (order.status === 'pending' && available && order.planId) actions.append(button('Reintentar este pago', async () => { const updated = await request('/orders', { method: 'POST', data: { id: order.id, planId: order.planId } }); continueOrder(updated, updated.mode || billing.mode); }));
      history.append(el('article', { class: 'card order-row' }, el('div', { class: 'order-description' }, el('h3', {}, order.planTitle), el('p', { class: 'muted' }, `${dateTime(order.createdAt)} · ${order.credits} ${order.credits === 1 ? 'evento' : 'eventos'}`), order.creditsExpireAt ? el('p', { class: 'muted' }, `Saldo sin activar: válido hasta ${dateTime(order.creditsExpireAt)}.`) : null), el('div', { class: 'order-amount' }, el('strong', {}, money(order.priceCents)), orderBadge(order)), actions));
    }
    const bespoke = el('section', { class: 'bespoke-card' }, el('p', { class: 'eyebrow' }, 'Experiencia a medida · Premium'), el('h2', {}, 'Un universo creado para tu evento'), el('p', {}, '¿Una temática especial? Diseñamos tu invitación y la pantalla a pedido. El diseño a medida se cotiza aparte; acordamos el precio y la entrega antes de comenzar.'), el('a', { href: '/temas.html#a-medida', class: 'button' }, 'Contanos tu idea →'));
    content.replaceChildren(billingNotice(catalog.mode), balance, plans, feedback, bespoke, history);
  }
  await load();
}
async function payment() {
  // Return parameters such as status or payment_id are not proof of payment.
  const id = new URLSearchParams(location.search).get('order');
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    main.replaceChildren(intro('Tus compras', 'Busquemos tu compra', 'Abrí el historial para consultar el estado confirmado de tus pagos.'), el('a', { class: 'button', href: '/compras.html' }, 'Ir a mis compras')); return;
  }
  const path = `/orders/${encodeURIComponent(id)}`;
  let order = await request(path), busy = false, timer, polls = 0;
  const content = el('div', { class: 'payment-layout' });
  main.replaceChildren(intro('Tu compra', 'Cada celebración empieza acá', 'El estado de tu compra se actualiza cuando recibimos su confirmación.'), content);
  function render() {
    const approved = order.status === 'approved';
    const description = ({
      pending: ['Tu pago está pendiente', 'Todavía esperamos la confirmación. Si ya pagaste, no necesitás hacer otra compra.'],
      approved: ['¡Tus eventos están acreditados!', 'Tu compra fue confirmada. Podés volver al panel y activar un evento con tu saldo disponible.'],
      rejected: ['El pago no fue aprobado', 'Esta compra no acreditó eventos. Podés volver a elegir un plan e intentar con otro medio de pago.'],
      refunded: ['El pago fue reintegrado', 'El saldo se ajustó según la devolución de esta compra. Revisá tus eventos disponibles en el panel.'],
      charged_back: ['El pago fue revertido', 'El saldo de esta compra se ajustó. Consultá el detalle del pago en Mercado Pago.'],
      review: ['Estamos revisando esta compra', 'La compra requiere una revisión antes de confirmar su saldo. No necesitás volver a pagar.']
    })[order.status] || ['Estamos comprobando tu compra', 'Volvé a consultar el estado dentro de unos momentos.'];
    const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const actions = el('div', { class: 'actions payment-actions' });
    const controls = [];
    function action(label, task, css = 'secondary') {
      const node = el('button', { type: 'button', class: css, onClick: async () => {
        if (busy) return; busy = true; controls.forEach(control => { control.disabled = true; }); status.textContent = 'Comprobando tu compra…';
        try { order = { ...order, ...await task() }; render(); schedule(); }
        catch (err) { status.textContent = err.message; }
        finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
      } }, label); controls.push(node); return node;
    }
    if (approved) actions.append(el('a', { class: 'button', href: '/cliente-panel.html' }, 'Preparar y activar mi evento'));
    if (order.status === 'pending' || order.status === 'review') actions.append(action('Comprobar pago', () => request(`${path}/refresh`, { method: 'POST' })));
    if (order.status === 'pending' && order.mode !== 'local' && checkoutUrl(order.checkoutUrl)) actions.append(button('Continuar en Mercado Pago', () => continueOrder(order, order.mode)));
    else if (order.status === 'pending' && ['live', 'sandbox'].includes(order.mode) && order.planId) actions.append(action('Preparar el enlace de pago', () => request('/orders', { method: 'POST', data: { id: order.id, planId: order.planId } })));
    actions.append(el('a', { class: 'button secondary', href: '/compras.html' }, 'Ver mis compras'));
    const receipt = el('section', { class: `card payment-card${approved ? ' payment-approved' : ''}` }, orderBadge(order), el('h2', {}, description[0]), el('p', { class: 'muted' }, description[1]), el('dl', { class: 'receipt-details' }, el('div', {}, el('dt', {}, 'Elegiste'), el('dd', {}, order.planTitle)), el('div', {}, el('dt', {}, 'Incluye'), el('dd', {}, `${order.credits} ${order.credits === 1 ? 'evento' : 'eventos'}`)), el('div', {}, el('dt', {}, 'Importe en pesos'), el('dd', {}, money(order.priceCents))), el('div', {}, el('dt', {}, 'Fecha de compra'), el('dd', {}, dateTime(order.createdAt)))), actions, status);
    if (order.creditsExpireAt) receipt.querySelector('dl').append(el('div', {}, el('dt', {}, 'Activá tu saldo antes de'), el('dd', {}, dateTime(order.creditsExpireAt))));
    content.replaceChildren(billingNotice(order.mode), receipt);
    if (order.mode === 'local' && order.status === 'pending') {
      content.append(el('section', { class: 'card simulation-card' }, el('p', { class: 'eyebrow' }, 'Solo para esta prueba local'), el('h2', {}, 'Probá el resultado del pago'), el('p', { class: 'muted' }, 'No se realiza ningún cobro ni se solicitan datos de una tarjeta. Elegí qué resultado querés probar.'), el('div', { class: 'actions' }, ...[['Aprobar pago de prueba', 'approved'], ['Dejar pago pendiente', 'pending'], ['Rechazar pago de prueba', 'rejected']].map(([label, value]) => action(label, () => request(`${path}/simulate`, { method: 'POST', data: { status: value } }), value === 'approved' ? '' : 'secondary')))));
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (order.mode === 'local' || !['pending', 'review'].includes(order.status) || polls >= 18) return;
    timer = setTimeout(async () => {
      if (!document.hidden && !busy) {
        busy = true; polls++;
        try { const next = await request(path); if (JSON.stringify(next) !== JSON.stringify(order)) { order = next; render(); } }
        catch { /* Keep the confirmed state and the manual retry button available. */ }
        finally { busy = false; }
      }
      schedule();
    }, 10000);
  }
  window.addEventListener('pagehide', () => clearTimeout(timer), { once: true });
  render(); schedule();
}
async function showQR(event) {
  if (event.status === 'draft' || !event.guestKey) { notice('Activá el evento antes de compartir su QR.', true); return; }
  const canvas = el('canvas'); const link = linkFor(event);
  const dialog = el('dialog', {}, el('h2', {}, event.name), el('p', { class: 'muted' }, 'Escaneá y compartí una foto. El moderador decide cuáles se proyectan.'), canvas, el('input', { value: link, readonly: true, 'aria-label': 'Enlace para invitados' }), el('div', { class: 'actions' }, button('Descargar QR', () => { canvas.toBlob(blob => save(blob, `qr-${event.id}.png`)); }), button('Cerrar', () => dialog.close(), 'secondary')));
  document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
  await QRCode.toCanvas(canvas, link, { width: 320, margin: 3, errorCorrectionLevel: 'M' }); dialog.showModal();
}
async function capture() {
  if (!eventId || !eventKey) { main.replaceChildren(intro('Compartí tu momento', 'Necesitás el QR del evento', 'Pedile al organizador el enlace actualizado para enviar tus fotos.')); return; }
  const event = await request(eventPath('/public'), { guest: true });
  await design.apply(event);
  if (event.receiving === false) {
    const scheduled = event.startsAt && new Date(event.startsAt).getTime() > Date.now();
    main.replaceChildren(el('section', { class: 'capture' }, intro('Estamos celebrando', event.name, 'Los mejores recuerdos los hacemos entre todos.'), el('div', { class: 'card scheduled-event' }, el('span', { class: 'pill' }, scheduled ? 'Evento programado' : 'Recepción pausada'), el('h2', {}, scheduled ? 'Falta poquito para empezar' : 'Todavía no podemos recibir tu foto'), el('p', { class: 'muted' }, scheduled ? `Podrás enviar tus fotos a partir del ${dateTime(event.startsAt)} h, horario de Argentina. Guardá este enlace para volver cuando empiece.` : 'El evento no está recibiendo fotos en este momento. Consultá al organizador o volvé a comprobar más tarde.'), button('Volver a comprobar', () => location.reload(), 'secondary'))));
    return;
  }
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif', required: true, name: 'photo' });
  const message = el('textarea', { name: 'message', maxlength: 200, placeholder: 'Una dedicatoria, un saludo, un recuerdo…' });
  const preview = el('img', { class: 'preview', alt: 'Vista previa de tu foto', hidden: true });
  const submit = el('button', { type: 'submit', disabled: true }, 'Enviar mi foto');
  const feedback = el('p', { class: 'status', role: 'status' }); let imageBase64 = '', photoId = '', generation = 0;
  file.addEventListener('change', async () => {
    const selected = file.files[0]; const current = ++generation; submit.disabled = true; imageBase64 = ''; preview.hidden = true;
    if (!selected) return;
    feedback.textContent = 'Preparando una versión liviana de tu foto…';
    try { const encoded = await compress(selected); if (generation !== current) return; imageBase64 = encoded; photoId = randomId(); preview.src = encoded; preview.hidden = false; feedback.textContent = 'Lista para enviar.'; submit.disabled = false; }
    catch (err) { feedback.textContent = err.message; }
  });
  const form = el('form', { onSubmit: async e => {
    e.preventDefault(); if (!imageBase64) return; submit.disabled = true; file.disabled = true; message.disabled = true; feedback.textContent = 'Enviando tu foto…';
    try { const result = await request(eventPath('/photos'), { method: 'POST', guest: true, data: { id: photoId, imageBase64, message: message.value } }); form.reset(); preview.hidden = true; preview.removeAttribute('src'); imageBase64 = ''; feedback.textContent = result.status === 'approved' ? '¡Foto publicada! Ya puede aparecer en la pantalla del evento.' : result.status === 'rejected' ? 'Esta foto ya fue recibida y retirada por el organizador.' : '¡Foto recibida! Se mostrará cuando el organizador la apruebe.'; notice('¡Gracias por compartir tu momento!'); }
    catch (err) { feedback.textContent = `${err.message} La foto sigue lista para reintentar.`; }
    finally { submit.disabled = !imageBase64; file.disabled = false; message.disabled = false; }
  } }, field('Elegí o tomá una foto', file), preview, field('Mensaje · opcional, hasta 200 caracteres', message), el('p', { class: 'privacy' }, event.autoApprove ? 'Este evento publica las fotos automáticamente. Al enviar, tu foto y tu mensaje podrán verse en la pantalla sin revisión previa del organizador.' : 'Al enviarla, compartís la foto y el mensaje con el organizador para su posible proyección durante este evento.'), submit, feedback);
  main.replaceChildren(el('section', { class: 'capture' }, intro('Estamos celebrando', event.name, 'Los mejores recuerdos los hacemos entre todos.'), el('div', { class: 'card' }, form)));
}
async function compress(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Elegí una foto de hasta 20 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Tu navegador no pudo abrir esta imagen. Usá JPEG, PNG o WebP.'); }
  try {
    if (bitmap.width * bitmap.height > 50000000) throw new Error('La imagen es demasiado grande. Elegí una versión más pequeña.');
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally { bitmap.close(); }
}
async function moderator() {
  const event = await request(eventPath());
  updateGuide({ event });
  const filter = el('select', { 'aria-label': 'Estado de las fotos' }, el('option', { value: 'pending' }, 'Pendientes'), el('option', { value: 'approved' }, 'Aprobadas'), el('option', { value: 'rejected' }, 'Rechazadas'));
  if (event.autoApprove) filter.value = 'approved';
  const grid = el('div', { class: 'grid' }); const status = el('p', { class: 'status', role: 'status' });
  let photos = [], cursor = '', nextCursor = null, signature = '', busy = false, generation = 0, renderGeneration = 0;
  const urls = new Map(); const next = button('Siguiente página', async () => { cursor = nextCursor; await load(true); }, 'secondary');
  const first = button('Volver al inicio', async () => { cursor = ''; await load(true); }, 'secondary');
  async function load(force = false) {
    if (busy && !force) return; const version = ++generation; busy = true;
    try {
      const result = await request(eventPath(`/photos?status=${filter.value}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)); if (version !== generation) return;
      photos = result.photos; nextCursor = result.nextCursor; next.hidden = !nextCursor; first.hidden = !cursor;
      const nextSignature = JSON.stringify(photos); status.textContent = `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} en esta página · Actualización automática`;
      if (nextSignature === signature && !force) return; signature = nextSignature; const render = ++renderGeneration;
      for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); grid.replaceChildren();
      if (!photos.length) grid.append(empty('Todavía no hay fotos en esta sección.'));
      for (const photo of photos) {
        const img = el('img', { alt: 'Foto del evento', loading: 'lazy' });
        const actions = el('div', { class: 'actions' });
        for (const [label, state] of [['Aprobar', 'approved'], ['Rechazar', 'rejected']]) if (photo.status !== state) actions.append(button(label, async () => { await request(eventPath(`/photos/${photo.id}`), { method: 'PATCH', data: { status: state } }); await load(true); }, state === 'rejected' ? 'danger' : ''));
        const card = el('article', { class: 'card photo' }, img, el('div', { class: 'details' }, el('small', {}, new Date(photo.createdAt).toLocaleString('es-AR')), photo.approvalMode === 'automatic' ? el('span', { class: 'pill' }, 'Publicada automáticamente') : null, el('p', {}, photo.message || 'Sin mensaje'), actions)); grid.append(card);
        const observer = new IntersectionObserver(entries => { if (!entries.some(x => x.isIntersecting)) return; observer.disconnect(); request(eventPath(`/photos/${photo.id}/image`), { blob: true }).then(blob => { if (render !== renderGeneration || !img.isConnected) return; const url = URL.createObjectURL(blob); urls.set(photo.id, url); img.src = url; }).catch(() => { img.alt = 'No se pudo cargar la foto. Actualizá la lista.'; }); }, { rootMargin: '200px' }); observer.observe(img);
      }
    } catch (err) { status.textContent = err.message; if ([401, 403].includes(err.status)) { grid.replaceChildren(); for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); } }
    finally { if (version === generation) busy = false; }
  }
  filter.addEventListener('change', () => { cursor = ''; load(true); });
  const hint = el('p', { class: 'moderation-help' });
  const explain = () => { hint.textContent = event.autoApprove ? 'Las nuevas fotos se publican automáticamente. Para retirar una de la pantalla, buscala en Aprobadas y elegí Rechazar.' : 'En Pendientes, tocá Aprobar para que una foto aparezca en la pantalla. Si no querés mostrarla, elegí Rechazar. Podés cambiar de decisión después.'; };
  explain();
  main.replaceChildren(el('a', { href: '/cliente-panel.html' }, '← Mis eventos'), intro('Las fotos de tu evento', event.name, 'Las nuevas fotos aparecen solas en esta lista. Vos elegís cuáles se comparten.'), hint, el('div', { class: 'toolbar', id: 'fotos' }, filter, button('Actualizar', () => load(true), 'secondary'), button('Descargar esta página (.zip)', async () => {
    if (!photos.length) return; const selected = [...photos]; const zip = new JSZip();
    for (let i = 0; i < selected.length; i++) { notice(`Preparando descarga ${i + 1}/${selected.length}…`); const p = selected[i]; const blob = await request(eventPath(`/photos/${p.id}/image`), { blob: true }); zip.file(`${p.id}.jpg`, await blob.arrayBuffer()); }
    save(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `fotos-${eventId}-${filter.value}.zip`); notice('Descarga preparada.');
  }, 'secondary')), status, grid, el('div', { class: 'actions' }, first, next));
  const album = albumDownload({ eventPath, el, button, request, save }); album.id = 'album';
  main.append(album, el('details', { class: 'event-options' }, el('summary', {}, 'Opciones de publicación · opcional'), moderationSettings({ event, el, button, request, notice, onChange: async enabled => { explain(); filter.value = enabled ? 'approved' : 'pending'; cursor = ''; await load(true); } })));
  await load();
  if (['#album', '#fotos'].includes(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
  setInterval(() => { if (!document.hidden && !cursor) load(); }, 8000);
}
async function projection() {
  if (!eventId || !eventKey) { main.replaceChildren(empty('Abrí la proyección desde el panel del evento.')); return; }
  const event = await request(eventPath('/public'), { guest: true });
  await design.apply(event);
  const stage = el('div', { class: 'stage' }); const status = el('span', { class: 'status' });
  main.replaceChildren(el('div', { class: 'toolbar' }, el('h2', {}, event.name), button('Pantalla completa', () => document.documentElement.requestFullscreen(), 'secondary'), status), stage, design.attribution());
  await runProjection({ stage, status, el, empty, request, eventPath });
}
init().catch(err => { main.replaceChildren(intro('Momentos en Vivo', 'No pudimos abrir este espacio', err.message), el('div', { class: 'actions' }, button('Volver a intentar', () => location.reload()), el('a', { class: 'button secondary', href: '/cliente-login.html' }, 'Ingresar a mi cuenta'))); });
