import presets from '../functions/themes.json';
import QRCode from 'qrcode';
import { randomId, copyText } from './browser-support';
import { animatedInvitation } from './invitation-motion';
import { videoDialog } from './invitation-video';
import { prepareMusic, soundtrack } from './invitation-audio';
import { setupSteps } from './event-setup';

export const fonts = { editorial: '"Cormorant Garamond", Georgia, serif', modern: '"Manrope", sans-serif', bold: '"Manrope", sans-serif' };
export function presentation(event = {}) {
  const p = event.presentation || {}; const themeId = Object.hasOwn(presets, p.themeId) ? p.themeId : 'champagne';
  return { themeId, ...presets[themeId], venue: '', address: '', rsvpEnabled: true, motion: true, opening: true, countdown: true, musicEnabled: false, musicSource: 'instrumental', published: false, custom: {}, ...p };
}
export function palette(p) { return { ...presets[p.themeId], ...p.custom }; }
function light(hex) { const c = hex.slice(1).match(/../g).map(v => { const n = parseInt(v, 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
export function themeSurface(node, p, assets = {}) {
  const colors = palette(p); node.dataset.theme = p.themeId; node.dataset.motion = String(p.motion); node.dataset.custom = String(Boolean(assets.background));
  node.classList.add('themed');
  for (const key of ['background', 'text', 'accent']) node.style.setProperty(`--theme-${key}`, colors[key]);
  node.style.setProperty('--theme-button-text', light(colors.accent) > .35 ? '#17111f' : '#ffffff');
  node.style.setProperty('--theme-font', fonts[colors.font]);
  node.dataset.font = colors.font;
  node.style.setProperty('--theme-tint', p.custom?.background ? `${colors.background}bb` : 'transparent');
  node.style.setProperty('--theme-art', `url("${assets.background || `/assets/themes/${p.themeId}.webp`}")`);
  node.style.setProperty('--theme-art-wide', `url("${assets.background || `/assets/themes/${p.themeId}-wide.webp`}")`);
}
const originalExamples = [
  { id: 'champagne', name: 'Lucía & Mateo', date: '2026-11-14', startsAt: '2026-11-14T22:00:00.000Z' },
  { id: 'aurora', name: 'Valentina', date: '2026-11-21', startsAt: '2026-11-22T00:00:00.000Z' },
  { id: 'disco-pop', name: 'Los 30 de Nico', date: '2026-12-05', startsAt: '2026-12-06T01:00:00.000Z' },
  { id: 'nocturno', name: 'Encuentro 2026', date: '2026-11-12', startsAt: '2026-11-12T21:30:00.000Z' }
];
// One registry drives every selector and demo: new models appear automatically.
const exampleEvents = Object.entries(presets).map(([id, preset]) => {
  const sample = preset.sample || originalExamples.find(event => event.id === id) || { name: 'Tu celebración', startsAt: '2026-12-12T00:00:00.000Z' };
  return { ...sample, id, date: sample.date || sample.startsAt.slice(0, 10) };
});
function eventDate(event) { return new Date(event.startsAt || `${event.date}T12:00:00-03:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).replace(/ de /g, ' · '); }
function eventTime(event) { return new Date(event.startsAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }); }

export function createDesign({ main, el, button, field, request, eventPath, eventId, notice, save, updateGuide = () => {} }) {
  const urls = new Map();
  async function loadAssets(event, guest = false) {
    const assets = {};
    await Promise.all(Object.entries(event.themeAssets || {}).map(async ([slot, value]) => {
      const cacheKey = `${event.id}:${slot}:${value.id}`;
      if (!urls.has(cacheKey)) urls.set(cacheKey, URL.createObjectURL(await request(`/events/${encodeURIComponent(event.id)}/theme-assets/${slot}`, { guest, blob: true })));
      assets[slot] = urls.get(cacheKey);
    }));
    if (event.themeMusic) {
      let buffer;
      assets.music = async () => { if (!buffer) buffer = await (await request(`/events/${encodeURIComponent(event.id)}/theme-music`, { guest, blob: true })).arrayBuffer(); return buffer; };
    }
    return assets;
  }
  window.addEventListener('pagehide', () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); });
  function attribution() { return el('p', { class: 'theme-credit' }, 'Un proyecto de ', el('strong', {}, 'Sylar.soluciones')); }
  function experience(event, p, assets, options = {}) {
    const root = animatedInvitation({ card: invitationCard(event, p, assets, options), event, p, assets, el, button, notice });
    themeSurface(root, p, assets); return root;
  }
  function previewOpening(event, p, assets) {
    const root = experience(event, p, assets, { preview: true });
    const dialog = el('dialog', { class: 'invitation-preview-dialog', 'aria-label': 'Vista previa de la invitación animada', onClose: () => { root.dispose(); dialog.remove(); } }, button('Cerrar vista previa', () => dialog.close(), 'preview-dialog-close secondary'), root);
    document.body.append(dialog); dialog.showModal();
  }
  const showVideo = (event, p, assets, url, sample = false) => videoDialog({ event, p, assets, colors: palette(p), url, sample, el, button, save, notice });
  function bespoke(event) {
    const brief = el('textarea', { maxlength: 1200, placeholder: 'Por ejemplo: mis 15 de Harry Potter, con carta de admisión, velas flotantes y tonos dorados…' });
    const contact = el('a', { class: 'button', target: '_blank', rel: 'noopener noreferrer' }, 'Consultar por WhatsApp ↗');
    const update = () => { contact.href = `https://wa.me/5493764104660?text=${encodeURIComponent(`Hola, Sylar.soluciones. Quiero consultar por un diseño a medida de Momentos en Vivo.${event ? `\nEvento: ${event.name}\nFecha: ${eventDate(event)}\nReferencia: ${event.id}` : ''}\nMi idea: ${brief.value || 'Me gustaría conocer las opciones y el presupuesto.'}`)}`; };
    brief.addEventListener('input', update); update();
    return el('section', { class: 'bespoke-card', id: 'a-medida' }, el('p', { class: 'eyebrow' }, 'Experiencia a medida · Premium'), el('h2', {}, '¿Tu idea todavía no está acá?'), el('p', {}, 'Creamos un universo para tu celebración: invitación, animación, colores y pantalla del evento. Contanos la temática que soñás.'), field('Tu idea para el evento', brief), contact, el('p', {}, 'Presupuesto personalizado. Acordamos el alcance, el precio y la fecha de entrega antes de comenzar. La consulta no genera un cobro.'), el('p', { class: 'privacy' }, 'Los nuevos modelos se suman a la colección. Tus fotos, nombres y música siguen siendo propios de tu evento.'));
  }
  function invitationCard(event, p, assets = {}, { preview = false, onRsvp, guestLink } = {}) {
    const content = el('div', { class: 'invite-content' });
    if (assets.logo) content.append(el('img', { src: assets.logo, alt: 'Logo del evento', class: 'invite-logo' }));
    const longTitle = event.name.length > 24 || event.name.split(/\s+/).some(word => word.length > 12);
    content.append(el('p', { class: 'invite-eyebrow' }, p.eyebrow), el('h1', { class: `invite-title${longTitle ? ' is-long' : ''}` }, event.name), el('p', { class: 'invite-subtitle' }, p.subtitle), el('span', { class: 'invite-rule', 'aria-hidden': true }), el('p', { class: 'invite-date' }, eventDate(event)), el('p', { class: 'invite-time' }, `${eventTime(event)} h${p.venue ? ` · ${p.venue}` : ''}`));
    if (p.address) content.append(el('p', { class: 'invite-address' }, p.address));
    content.append(el('p', { class: 'invite-message' }, p.message));
    const actions = el('div', { class: 'invite-actions' });
    if (p.rsvpEnabled && (preview || event.rsvpOpen)) actions.append(button('Confirmar asistencia →', onRsvp || (() => notice('Así se verá el botón para tus invitados.')), 'invite-primary'));
    if (p.address || p.venue) actions.append(el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.venue, p.address].filter(Boolean).join(', '))}`, target: '_blank', rel: 'noopener noreferrer', class: 'button invite-secondary' }, '⌖ Cómo llegar'));
    if (guestLink) actions.append(el('a', { href: guestLink, class: 'invite-photos' }, 'Sumá tus fotos ↗'));
    else if (preview) actions.append(el('span', { class: 'invite-photos' }, 'Sumá tus fotos ↗'));
    else content.append(el('p', { class: 'invite-hint' }, event.receiving ? '' : 'El enlace para sumar fotos aparecerá aquí cuando comience el evento.'));
    content.append(actions);
    const card = el('article', { class: 'invitation-card' }, el('div', { class: 'invite-sheen', 'aria-hidden': true }), content);
    if (assets.cover) card.append(el('img', { src: assets.cover, alt: 'Imagen de portada del evento', class: 'invite-cover' }));
    card.append(attribution()); themeSurface(card, p, assets); return card;
  }
  function projectionPreview(event, p, assets = {}) {
    const samples = el('div', { class: 'projection-samples' });
    // Empty frames describe where real moderated photos will appear; sample art
    // is decorative and never represented as a client's existing gallery.
    for (let i = 0; i < 3; i++) samples.append(el('div', { class: 'sample-frame' }, assets.cover ? el('img', { src: assets.cover, alt: 'Ejemplo con tu portada' }) : el('span', {}, ['Tus momentos', 'Tus personas', 'Tus recuerdos'][i])));
    const node = el('div', { class: 'projection-preview' }, el('p', { class: 'invite-eyebrow' }, 'Así lo vivimos'), el('h2', {}, event.name), samples, el('p', { class: 'projection-footnote' }, 'Acá se mostrarán las fotos que apruebes.'), attribution());
    themeSurface(node, p, assets); return node;
  }
  function gallery() {
    document.body.classList.add('design-gallery');
    main.replaceChildren(el('div', { class: 'design-heading' }, el('p', { class: 'eyebrow' }, 'Un tema, todo tu evento'), el('h1', {}, 'Tu celebración. Tu estilo.'), el('p', { class: 'muted' }, `${exampleEvents.length} mundos para explorar. Una colección que sigue creciendo. Hacelos tuyos con tus imágenes, colores y palabras.`)));
    const tabs = el('div', { class: 'theme-tabs', role: 'group', 'aria-label': 'Temas para explorar' });
    const stage = el('section', { class: 'theme-showcase' });
    const render = index => {
      const event = exampleEvents[index]; const p = presentation({ presentation: { themeId: event.id, venue: 'Posadas' } });
      for (const node of tabs.children) node.setAttribute('aria-pressed', String(node.dataset.id === event.id));
      const pView = projectionPreview(event, p);
      stage.replaceChildren(el('div', { class: 'phone-preview' }, invitationCard(event, p, {}, { preview: true })), el('div', { class: 'showcase-details' }, el('p', { class: 'eyebrow' }, `0${index + 1} / ${presets[event.id].name}`), el('h2', {}, presets[event.id].description), el('p', { class: 'muted' }, 'La invitación, la página para subir fotos y la pantalla del evento comparten el mismo diseño.'), pView, el('a', { href: '/cliente-panel.html', class: 'button' }, 'Personalizar mi evento →')));
      stage.querySelector('.showcase-details').append(el('div', { class: 'actions' }, el('a', { href: `/invitacion.html?demo=${event.id}`, class: 'button secondary' }, 'Probar invitación animada →'), button('Ver video de muestra', () => showVideo(event, { ...p, musicEnabled: true }, {}, `${location.origin}/invitacion.html?demo=${event.id}`, true), 'secondary')));
    };
    exampleEvents.forEach((event, i) => { const b = button(presets[event.id].name, () => render(i), 'theme-tab'); b.dataset.id = event.id; tabs.append(b); });
    main.append(tabs, stage, bespoke(), attribution()); render(Math.max(0, exampleEvents.findIndex(e => e.id === new URLSearchParams(location.search).get('tema'))));
  }
  async function apply(event) {
    const p = presentation(event); const assets = await loadAssets(event, true); themeSurface(document.body, p, assets);
    if (assets.logo) document.querySelector('.topbar').prepend(el('img', { src: assets.logo, class: 'event-header-logo', alt: 'Logo del evento' }));
    document.title = `${event.name} · Momentos en Vivo`;
    return { p, assets };
  }
  async function invitation() {
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo) {
      const example = exampleEvents.find(event => event.id === demo); if (!example) throw new Error('Elegí uno de los temas de muestra del catálogo.');
      const event = { ...example, rsvpOpen: true, receiving: false };
      const p = presentation({ presentation: { themeId: event.id, venue: event.venue || 'Salón de celebraciones', address: event.address || 'Posadas, Misiones', musicEnabled: true } });
      themeSurface(document.body, p); document.title = `${presets[event.id].name} · Invitación de muestra`;
      main.replaceChildren(el('div', { class: 'invitation-demo-bar' }, el('span', {}, `Muestra · ${presets[event.id].name}`), el('a', { href: '/temas.html' }, 'Cambiar tema'), button('Ver video', () => showVideo(event, p, {}, location.href, true), 'secondary')), experience(event, p, {}, { preview: true, onRsvp: () => notice('Esta es una muestra. En tu evento, la respuesta se guarda para el organizador.') }));
      return;
    }
    if (!eventId || !location.hash) throw new Error('Necesitás el enlace de invitación que te compartió el organizador.');
    const event = await request(eventPath('/invitation'), { guest: true }); const { p, assets } = await apply(event);
    const onRsvp = () => {
      const name = el('input', { required: true, maxlength: 80, autocomplete: 'name', name: 'guestName' });
      const choice = el('select', { 'aria-label': 'Asistencia' }, el('option', { value: 'yes' }, 'Sí, voy a estar'), el('option', { value: 'no' }, 'No puedo asistir'));
      const seats = el('input', { type: 'number', min: 1, max: 10, step: 1, value: 1, required: true });
      const status = el('p', { role: 'status', class: 'status' }); const submit = el('button', { type: 'submit' }, 'Enviar confirmación');
      let id = randomId(); const storageKey = `mev-rsvp-${eventId}`;
      try { id = localStorage.getItem(storageKey) || id; localStorage.setItem(storageKey, id); } catch { /* The in-memory ID still makes network retries idempotent. */ }
      choice.addEventListener('change', () => { seats.disabled = choice.value === 'no'; });
      const dialog = el('dialog', { 'aria-labelledby': 'rsvp-title' }, el('h2', { id: 'rsvp-title' }, '¿Nos acompañás?'), el('form', { onSubmit: async e => {
        e.preventDefault(); submit.disabled = true; status.textContent = 'Enviando…';
        try { await request(eventPath('/invitation/rsvp'), { method: 'POST', guest: true, data: { id, name: name.value, attending: choice.value === 'yes', seats: Number(seats.value) || 1 } }); status.textContent = '¡Gracias! Tu respuesta quedó guardada.'; }
        catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
      } }, field('Tu nombre y apellido', name), field('Asistencia', choice), field('Personas, incluyéndote', seats), el('p', { class: 'privacy' }, 'El organizador verá tu nombre, tu respuesta y la cantidad de personas. Podés actualizar tu respuesta desde este dispositivo antes del evento.'), submit, status), button('Cerrar', () => dialog.close(), 'secondary'));
      document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
    };
    main.replaceChildren(experience(event, p, assets, { onRsvp, guestLink: event.guestKey ? `/home.html?event=${encodeURIComponent(event.id)}#${event.guestKey}` : null }));
    if (!event.receiving) main.append(button('Actualizar disponibilidad de fotos', () => location.reload(), 'invite-refresh secondary'));
  }

  async function editor() {
    let event = await request(eventPath()); let p = presentation(event); let assets = await loadAssets(event); let dirty = false; let busy = false; let removeAssets = []; let removeMusic = false;
    const version = () => event.themeVersion || 0;
    const preview = el('div', { class: 'editor-preview' }); const status = el('p', { class: 'status design-status', role: 'status' });
    const controls = el('div', { class: 'design-controls' });
    const title = el('h1', {}, 'Diseñá tu momento');
    const link = el('input', { readonly: true, 'aria-label': 'Enlace de invitación' });
    const share = el('div', { class: 'share-invitation' });
    const permalink = () => `${location.origin}/invitacion.html?event=${encodeURIComponent(event.id)}#${event.invitationKey}`;
    const render = () => {
      updateGuide({ event, dirty });
      preview.replaceChildren(el('p', { class: 'preview-label' }, 'Vista previa · Invitación'), el('div', { class: 'phone-preview' }, invitationCard(event, p, assets, { preview: true })), el('p', { class: 'preview-label' }, 'En la pantalla del evento'), projectionPreview(event, p, assets));
      preview.querySelector('.phone-preview').after(el('div', { class: 'actions' }, button('Probar apertura animada', () => previewOpening(event, p, assets), 'secondary'), button('Ver video de invitación', () => showVideo(event, p, assets, !dirty && event.presentation?.published ? permalink() : ''), 'secondary')));
      status.textContent = dirty ? 'Tenés cambios sin guardar.' : p.published ? 'Invitación publicada. Los cambios guardados se ven en su enlace.' : 'Diseño guardado. La invitación todavía es privada.';
      link.value = event.invitationKey && event.presentation?.published ? permalink() : '';
      share.hidden = !link.value;
    };
    const mark = () => { dirty = true; render(); };
    window.addEventListener('beforeunload', e => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } });
    async function persist(publish = p.published) {
      if (busy) return; busy = true;
      try {
        const result = await request(eventPath('/presentation'), { method: 'PUT', data: { presentation: { ...p, published: publish }, version: version(), removeAssets, removeMusic } });
        event = { ...event, ...result }; p = presentation(event); dirty = false; removeAssets = []; removeMusic = false; renderMusic(); render(); notice(publish ? 'Diseño guardado e invitación publicada.' : 'Diseño guardado.');
      } finally { busy = false; }
    }
    const saveButton = button('Guardar diseño', () => persist(), 'secondary');
    const publish = button('Publicar invitación', () => persist(true));
    publish.disabled = !(event.status === 'active' && event.activatedAt && Date.parse(event.receivesUntil) > Date.now());
    const heading = el('div', { class: 'design-heading' }, el('a', { href: '/cliente-panel.html' }, '← Mis eventos'), el('p', { class: 'eyebrow' }, event.name), title, el('p', { class: 'muted' }, 'Elegí un tema y ya tenés el diseño preparado. Cambiá las palabras si querés. Las fotos, los colores y la música son opcionales.'), el('a', { href: '#vista-previa' }, 'Ver cómo está quedando ↓'));
    preview.id = 'vista-previa';
    if (event.status === 'draft') {
      heading.append(setupSteps(el, 2), el('p', { class: 'privacy' }, 'Podés usar el tema como está o personalizarlo. Guardar el diseño no consume saldo.'), button('Guardar y revisar activación →', async () => {
        if (busy) { notice('Esperá a que termine de guardarse el archivo.'); return; }
        await persist(false); location.assign(`/cliente-panel.html?setup=${encodeURIComponent(event.id)}`);
      }));
    }
    const selectors = el('div', { class: 'theme-selectors' });
    for (const [id, preset] of Object.entries(presets)) {
      const b = button('', () => {
        if (busy) return;
        const previous = presets[p.themeId];
        for (const key of ['eyebrow', 'subtitle', 'message']) if (p[key] === previous[key]) p[key] = preset[key];
        p.themeId = id; p.custom = {}; populate(); mark();
      }, 'theme-choice');
      b.setAttribute('aria-label', `Elegir ${preset.name}`); b.dataset.id = id;
      b.append(el('img', { src: `/assets/themes/${id}.webp`, alt: '', loading: 'lazy' }), el('strong', {}, preset.name), el('span', {}, preset.description)); selectors.append(b);
    }
    const inputs = {};
    const copy = el('section', { class: 'design-section' }, el('h2', {}, '2. Tus palabras'));
    for (const [key, label, max, area] of [['eyebrow', 'Frase de apertura', 60], ['subtitle', 'Subtítulo', 100], ['message', 'Mensaje para tus invitados', 300, true], ['venue', 'Nombre del lugar', 100], ['address', 'Dirección y ciudad', 180]]) {
      const input = el(area ? 'textarea' : 'input', { maxlength: max, name: key }); inputs[key] = input;
      input.addEventListener('input', () => { p[key] = input.value; mark(); }); copy.append(field(label, input));
    }
    const customize = el('section', { class: 'design-section' }, el('h2', {}, '3. Hacelo único'), el('p', { class: 'muted' }, 'Subí un fondo propio, una foto de portada o tu logo. JPEG, PNG o WebP, hasta 5 MB. El logo conserva su transparencia.'));
    const uploadControls = [];
    for (const [slot, label] of [['background', 'Fondo personalizado'], ['cover', 'Foto de portada'], ['logo', 'Logo del evento']]) {
      const input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }); uploadControls.push(input);
      input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file || busy) return;
        if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notice('Elegí JPEG, PNG o WebP de hasta 5 MB.', true); input.value = ''; return; }
        busy = true; uploadControls.forEach(n => { n.disabled = true; }); status.textContent = 'Preparando tu imagen…';
        try {
          const imageBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No pudimos leer el archivo.')); reader.readAsDataURL(file); });
          const result = await request(eventPath(`/theme-assets/${slot}`), { method: 'POST', data: { imageBase64, version: version() } });
          event.themeVersion = result.version; event.themeAssets = { ...event.themeAssets, [slot]: { id: result.id } }; removeAssets = removeAssets.filter(value => value !== slot);
          assets = await loadAssets(event); for (const removed of removeAssets) delete assets[removed]; if (removeMusic) delete assets.music; render(); notice('Imagen guardada en este evento.');
        } catch (error) { notice(error.message, true); } finally { busy = false; input.value = ''; uploadControls.forEach(n => { n.disabled = false; }); }
      });
      customize.append(field(label, input), button(`Quitar ${label.toLowerCase()}`, () => { if (busy) return; delete assets[slot]; if (!removeAssets.includes(slot)) removeAssets.push(slot); mark(); }, 'small secondary'));
    }
    const colors = el('div', { class: 'color-fields' });
    for (const [key, label] of [['background', 'Fondo'], ['text', 'Texto'], ['accent', 'Acento']]) {
      const input = el('input', { type: 'color' }); inputs[key] = input;
      input.addEventListener('input', () => { p.custom[key] = input.value; mark(); }); colors.append(field(label, input));
    }
    const font = el('select', { 'aria-label': 'Tipografía' }, el('option', { value: 'editorial' }, 'Editorial · elegante'), el('option', { value: 'modern' }, 'Moderna · limpia'), el('option', { value: 'bold' }, 'Impacto · protagonista')); inputs.font = font;
    font.addEventListener('change', () => { p.custom.font = font.value; mark(); });
    customize.append(colors, field('Tipografía', font), button('Restablecer colores y tipografía', () => { p.custom = {}; populate(); mark(); }, 'secondary'));
    const options = el('section', { class: 'design-section' }, el('h2', {}, '4. Los últimos detalles'));
    for (const [key, label] of [['rsvpEnabled', 'Pedir confirmación de asistencia'], ['motion', 'Animaciones suaves'], ['opening', 'Apertura con sobre animado'], ['countdown', 'Mostrar cuenta regresiva'], ['musicEnabled', 'Ofrecer música al abrir la invitación']]) {
      const input = el('input', { type: 'checkbox' }); inputs[key] = input;
      input.addEventListener('change', () => { p[key] = input.checked; mark(); }); options.append(el('label', { class: 'check-field' }, input, label));
    }
    const musicSource = el('select', { 'aria-label': 'Música de la invitación' }, el('option', { value: 'instrumental' }, 'Instrumental del tema'), el('option', { value: 'custom' }, 'Mi propia música'));
    const musicFile = el('input', { type: 'file', accept: '.mp3,.m4a,.wav,.ogg,.aac,audio/*' });
    const musicOffset = el('input', { type: 'number', min: 0, step: 1, value: 0 });
    const musicStatus = el('p', { class: 'music-status', role: 'status' }); let audition;
    const stopAudition = () => { audition?.close(); audition = null; };
    window.addEventListener('pagehide', stopAudition); document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudition(); });
    function renderMusic() {
      musicSource.value = p.musicSource; musicSource.querySelector('[value=custom]').disabled = !assets.music;
      musicStatus.textContent = event.themeMusic && !removeMusic ? `${event.themeMusic.name} · ${Math.round(event.themeMusic.duration)} segundos guardados` : 'Sin música propia. Podés usar la instrumental del tema.';
    }
    musicSource.addEventListener('change', () => { stopAudition(); p.musicSource = musicSource.value; mark(); });
    const uploadMusic = button('Guardar fragmento de música', async () => {
      if (busy) return; busy = true; stopAudition(); musicFile.disabled = true; musicOffset.disabled = true;
      musicStatus.textContent = 'Preparando tu música…';
      try {
        const file = musicFile.files[0]; const clip = await prepareMusic(file, Number(musicOffset.value));
        const result = await request(eventPath('/theme-music'), { method: 'POST', data: { audioBase64: clip.audioBase64, name: file.name.slice(0, 80), version: version() } });
        event.themeMusic = result.track; event.themeVersion = result.version; removeMusic = false;
        assets.music = async () => clip.buffer; p.musicSource = 'custom'; p.musicEnabled = true; inputs.musicEnabled.checked = true; musicFile.value = ''; renderMusic(); mark();
        notice('Música preparada. Guardá el diseño para usarla en la invitación y su video.');
      } finally { busy = false; musicFile.disabled = false; musicOffset.disabled = false; renderMusic(); }
    }, 'secondary');
    options.append(el('div', { class: 'music-tools' }, field('Música de la invitación', musicSource), el('p', { class: 'privacy' }, 'Subí audio propio o que tengas permiso para compartir. MP3, M4A, WAV, OGG o AAC, hasta 15 MB. Guardamos hasta 60 segundos desde el inicio que elijas; el video usa los primeros 16 segundos. Los fragmentos cortos se repiten.'), field('Archivo de música', musicFile), field('Empezar desde el segundo', musicOffset), uploadMusic, musicStatus, el('div', { class: 'actions' }, button('Escuchar música elegida', async () => { if (busy) return; stopAudition(); audition = soundtrack(p.themeId, { custom: p.musicSource === 'custom' ? assets.music : null }); try { await audition.start(); } catch (error) { stopAudition(); throw error; } }, 'secondary'), button('Detener música', stopAudition, 'secondary'), button('Quitar música propia', () => { if (busy) return; stopAudition(); removeMusic = true; delete assets.music; p.musicSource = 'instrumental'; renderMusic(); mark(); }, 'secondary')), el('p', { class: 'privacy' }, 'La música del enlace empieza cuando el invitado toca “Activar música”.')));
    share.append(field('Tu invitación para compartir', link), el('div', { class: 'actions' }, button('Copiar enlace', async () => { if (await copyText(link.value)) notice('Enlace copiado. Pegalo en WhatsApp para invitar.'); }, 'secondary'), button('Abrir invitación ↗', () => window.open(link.value, '_blank', 'noopener,noreferrer'), 'secondary'), button('Descargar tarjeta PNG', async () => { if (dirty) { notice('Guardá el diseño antes de descargar la tarjeta.', true); return; } await downloadCard(event, p, assets, link.value); }, 'secondary')), el('p', { class: 'privacy' }, 'La tarjeta es una imagen con QR. El enlace abre la invitación con sus botones, ubicación y confirmación de asistencia.'));
    share.append(button('Preparar video para WhatsApp', () => { if (dirty) { notice('Guardá el diseño antes de preparar el video.', true); return; } return showVideo(event, p, assets, link.value); }, 'secondary'), el('p', { class: 'privacy' }, 'Video vertical de 16 segundos con tu tema, datos y QR. La música se activa al tocar su botón. Para confirmar asistencia o consultar el mapa, compartí también el enlace.'));
    options.append(el('p', { class: 'privacy' }, 'Las respuestas se reciben hasta el inicio del evento. Las animaciones respetan la preferencia de movimiento reducido del dispositivo.'));
    const publishing = el('section', { class: 'design-section', id: 'compartir' }, el('h2', {}, 'Guardá y compartí'), el('div', { class: 'actions' }, saveButton, publish), status);
    if (publish.disabled) publishing.append(el('p', { class: 'notice-inline' }, 'Podés preparar todo ahora. Activá el evento desde Mis eventos para publicar la invitación.'));
    publishing.append(share, el('details', { class: 'event-options' }, el('summary', {}, 'Opciones de la invitación'), button('Dejar de publicar la invitación', () => persist(false), 'secondary')));
    const advanced = el('details', { class: 'design-advanced' }, el('summary', {}, 'Personalizar fotos, colores y música · opcional'), el('p', { class: 'muted' }, 'El tema ya está listo para usar. Cambiá estos detalles solo si querés darle un toque propio.'), customize, options);
    controls.append(el('section', { class: 'design-section' }, el('h2', {}, '1. Elegí tu tema'), selectors), copy, advanced, publishing, bespoke(event));
    const responses = el('section', { class: 'design-section guest-responses' }, el('h2', {}, 'Tus confirmaciones'));
    const list = el('div');
    responses.append(button('Ver respuestas', async () => {
      const data = await request(eventPath('/rsvps'));
      list.replaceChildren(el('p', {}, `${data.responses.length} ${data.responses.length === 1 ? 'respuesta' : 'respuestas'} · ${data.seats} ${data.seats === 1 ? 'persona confirmada' : 'personas confirmadas'}`));
      if (!data.responses.length) { list.append(el('p', { class: 'muted' }, 'Las confirmaciones aparecerán acá.')); return; }
      const table = el('table', { class: 'rsvp-table' }, el('thead', {}, el('tr', {}, ...['Nombre', 'Asiste', 'Personas'].map(value => el('th', {}, value)))));
      const tbody = el('tbody'); for (const r of data.responses) tbody.append(el('tr', {}, el('td', {}, r.name), el('td', {}, r.attending ? 'Sí' : 'No'), el('td', {}, r.seats))); table.append(tbody); list.append(el('div', { class: 'table-scroll' }, table));
      list.append(button('Descargar lista CSV', () => { const cell = value => `"${String(value).replace(/^[=+@\-\s]/, "'$&").replace(/"/g, '""')}"`; const lines = [['Nombre', 'Asiste', 'Personas'], ...data.responses.map(r => [r.name, r.attending ? 'Sí' : 'No', r.seats])]; save(new Blob(['\uFEFF', lines.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'confirmaciones.csv'); }, 'secondary'));
    }, 'secondary'), list); controls.append(responses);
    function populate() {
      const colors = palette(p);
      for (const key of ['eyebrow', 'subtitle', 'message', 'venue', 'address']) inputs[key].value = p[key];
      for (const key of ['background', 'text', 'accent', 'font']) inputs[key].value = colors[key];
      for (const key of ['rsvpEnabled', 'motion', 'opening', 'countdown', 'musicEnabled']) inputs[key].checked = p[key];
      for (const b of selectors.children) b.setAttribute('aria-pressed', String(b.dataset.id === p.themeId));
    }
    main.replaceChildren(heading, el('div', { class: 'design-workspace' }, controls, preview)); populate(); renderMusic(); render();
    if (['#compartir', '#vista-previa'].includes(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function downloadCard(event, p, assets, url) {
    await document.fonts.ready;
    const canvas = el('canvas'); canvas.width = 1080; canvas.height = 1920; const c = canvas.getContext('2d'); const colors = palette(p);
    const image = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const fit = (img, x, y, w, h) => { const scale = Math.max(w / img.width, h / img.height); c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - img.width * scale) / 2, y + (h - img.height * scale) / 2, img.width * scale, img.height * scale); c.restore(); };
    const lines = (text, size, family, maxWidth) => {
      c.font = `${size}px ${family}`; const rows = []; let line = '';
      for (const word of text.split(/\s+/)) { if (c.measureText(`${line} ${word}`).width > maxWidth && line) { rows.push(line); line = ''; } for (const char of word) { if (c.measureText(line + char).width > maxWidth) { rows.push(line); line = ''; } line += char; } line += ' '; }
      if (line.trim()) rows.push(line.trim()); return rows;
    };
    let titleSize = colors.font === 'editorial' ? 110 : 86;
    while (lines(event.name, titleSize, fonts[colors.font], 820).length > 3 && titleSize > 44) titleSize -= 4;
    const blocks = [[p.eyebrow.toUpperCase(), 24], [event.name, titleSize, fonts[colors.font], 1.05], [p.subtitle, 32], [eventDate(event).toUpperCase(), 29], [`${eventTime(event)} h${p.venue ? ` · ${p.venue}` : ''}`, 27], [p.address, 23], [p.message, 27, fonts.modern, 1.5]];
    const contentEnd = 295 + 55 + 35 + 40 + 62 + 35 + blocks.reduce((sum, [value, size, family = fonts.modern, gap = 1.35]) => sum + lines(value, size, family, 820).length * size * gap, 0) + (assets.cover ? 330 : 0);
    const qrTop = Math.max(1500, Math.ceil(contentEnd + 45)); canvas.height = qrTop + 420;
    c.fillStyle = colors.background; c.fillRect(0, 0, canvas.width, canvas.height);
    fit(await image(assets.background || `/assets/themes/${p.themeId}.webp`), 0, 0, canvas.width, canvas.height);
    if (p.custom.background) { c.globalAlpha = .72; c.fillStyle = colors.background; c.fillRect(0, 0, canvas.width, canvas.height); c.globalAlpha = 1; }
    c.globalAlpha = assets.background ? .94 : .65; c.fillStyle = colors.background; c.fillRect(85, 215, 910, canvas.height - 280); c.globalAlpha = 1;
    c.textAlign = 'center'; c.fillStyle = colors.text;
    let y = 295;
    const text = (value, size, family = fonts.modern, gap = 1.35) => { const rows = lines(value, size, family, 820); for (const row of rows) { c.fillText(row.trim(), 540, y); y += size * gap; } return rows.length; };
    if (assets.logo) { const img = await image(assets.logo); const s = Math.min(200 / img.width, 100 / img.height); c.drawImage(img, 540 - img.width * s / 2, 150, img.width * s, img.height * s); }
    text(p.eyebrow.toUpperCase(), 24); y += 55;
    text(event.name, titleSize, fonts[colors.font], 1.05); y += 35; text(p.subtitle, 32); y += 40;
    c.fillStyle = colors.accent; c.fillRect(490, y, 100, 2); y += 62; c.fillStyle = colors.text;
    text(eventDate(event).toUpperCase(), 29); text(`${eventTime(event)} h${p.venue ? ` · ${p.venue}` : ''}`, 27); text(p.address, 23); y += 35;
    text(p.message, 27, fonts.modern, 1.5);
    if (assets.cover) fit(await image(assets.cover), 130, y + 20, 820, 290);
    const qr = el('canvas'); await QRCode.toCanvas(qr, url, { width: 240, margin: 3, errorCorrectionLevel: 'M' }); c.drawImage(qr, 420, qrTop);
    y = qrTop + 290; c.fillStyle = colors.text; text('Escaneá para abrir la invitación', 25); y = qrTop + 360; text('Un proyecto de Sylar.soluciones', 21);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('No pudimos preparar la tarjeta.'); save(blob, `invitacion-${event.id}.png`); notice('Tarjeta lista para compartir.');
  }
  return { editor, gallery, invitation, apply, attribution, loadAssets };
}
