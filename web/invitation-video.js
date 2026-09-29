import QRCode from 'qrcode';
import { soundtrack } from './invitation-audio';

const DURATION = 16;
const families = { editorial: '"Cormorant Garamond", Georgia, serif', modern: '"Manrope", sans-serif', bold: '"Manrope", sans-serif' };
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => 1 - (1 - clamp(n)) ** 3;
export function mp4Type(audio = false) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return '';
  const codecs = audio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'] : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1'];
  return codecs.find(type => MediaRecorder.isTypeSupported(type)) || '';
}
async function renderer(canvas, { event, p, assets, colors, url, sample }) {
  await Promise.all([document.fonts.load(`500 72px ${families[colors.font]}`), document.fonts.load('500 28px "Manrope"')]);
  const image = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
  const [background, cover, logo] = await Promise.all([image(assets.background || `/assets/themes/${p.themeId}.webp`), assets.cover ? image(assets.cover) : null, assets.logo ? image(assets.logo) : null]);
  const qr = document.createElement('canvas');
  if (url) await QRCode.toCanvas(qr, url, { width: 220, margin: 3, errorCorrectionLevel: 'M' });
  const c = canvas.getContext('2d', { alpha: false }); canvas.width = 720; canvas.height = 1280;
  const date = new Date(event.startsAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
  const time = new Date(event.startsAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });
  const moving = p.motion !== false;
  function fit(img, x, y, w, h, zoom = 1) {
    const s = Math.max(w / img.width, h / img.height) * zoom; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s); c.restore();
  }
  function rounded(x, y, w, h, radius, fill) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); }
  function rows(text, size, family, maxWidth) {
    c.font = `500 ${size}px ${family}`; const output = []; let row = '';
    for (const word of String(text || '').trim().split(/\s+/)) {
      if (row && c.measureText(`${row} ${word}`).width > maxWidth) { output.push(row); row = ''; }
      for (const character of `${row ? ' ' : ''}${word}`) { if (c.measureText(row + character).width > maxWidth && row) { output.push(row); row = ''; } row += character; }
    }
    if (row) output.push(row); return output;
  }
  function text(value, y, size = 28, { width = 570, family = families.modern, maxLines = 4, color = colors.text, spacing = 1.3 } = {}) {
    let lines = rows(value, size, family, width);
    while (lines.length > maxLines && size > 14) { size -= 2; lines = rows(value, size, family, width); }
    c.font = `500 ${size}px ${family}`; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'top';
    for (const line of lines) { c.fillText(line, 360, y); y += size * spacing; } return y;
  }
  function rule(y) { c.fillStyle = colors.accent; c.fillRect(310, y, 100, 2); }
  function scene(index, elapsed) {
    if (moving) { c.globalAlpha *= ease(elapsed / .85); c.translate(0, 25 * (1 - ease(elapsed / .85))); }
    if (index === 0) {
      if (logo) { const s = Math.min(190 / logo.width, 95 / logo.height); c.drawImage(logo, 360 - logo.width * s / 2, 270, logo.width * s, logo.height * s); }
      text(p.eyebrow.toUpperCase(), logo ? 405 : 350, 23, { maxLines: 2, color: colors.accent });
      const y = text(event.name, 485, colors.font === 'editorial' ? 92 : 72, { family: families[colors.font], maxLines: 3, spacing: 1.04 });
      rule(y + 38); text(p.subtitle, y + 88, 32, { family: families[colors.font], maxLines: 3 });
      text('UNA FECHA PARA RECORDAR', 1045, 18, { color: colors.accent });
    } else if (index === 1) {
      text('RESERVÁ ESTE MOMENTO', 245, 20, { color: colors.accent });
      let y = 355;
      if (cover) { c.save(); c.beginPath(); c.roundRect(120, 320, 480, 290, 18); c.clip(); fit(cover, 120, 320, 480, 290, moving ? 1 + .025 * elapsed / 5 : 1); c.restore(); y = 665; }
      y = text(date, y, 43, { family: families[colors.font], maxLines: 2 });
      y = text(`${time} h · Argentina`, y + 20, 25); rule(y + 35);
      y = text(p.venue || 'Celebremos juntos', y + 85, 34, { family: families[colors.font], maxLines: 3 });
      text(p.address, y + 20, 23, { maxLines: 4 });
    } else {
      text('TE ESPERAMOS', 255, 22, { color: colors.accent });
      const y = text(p.message || 'Los mejores momentos son con vos.', 365, 35, { family: families[colors.font], maxLines: 7, spacing: 1.3 });
      rule(Math.min(y + 45, 730));
      if (url) { rounded(235, 795, 250, 250, 18, '#ffffff'); c.drawImage(qr, 250, 810); }
      text(url ? 'Abrí el enlace que acompaña este video' : 'Tu invitación, lista para compartir', url ? 1075 : 930, 23, { maxLines: 2 });
      text(url ? 'o escaneá el QR para ver los detalles.' : 'Publicala para agregar su enlace y QR.', url ? 1110 : 975, 19, { maxLines: 2 });
    }
  }
  return seconds => {
    const t = Math.min(DURATION - .001, Math.max(0, seconds));
    c.globalAlpha = 1; c.fillStyle = colors.background; c.fillRect(0, 0, 720, 1280); fit(background, 0, 0, 720, 1280, moving ? 1.015 + t / 800 : 1);
    c.globalAlpha = assets.background ? .9 : .73; rounded(38, 205, 644, 980, 26, colors.background); c.globalAlpha = 1;
    for (let i = 0; i < 20; i++) {
      const x = (i * 131 + 35) % 720; const y = ((i * 97 + 1300 - (moving ? t * (12 + i % 4) : 0)) % 1280 + 1280) % 1280;
      c.globalAlpha = .2 + .25 * Math.sin(i + (moving ? t : 0)) ** 2; c.fillStyle = colors.accent; c.beginPath(); c.arc(x, y, p.themeId === 'disco-pop' ? 4 : 2, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    if (p.themeId === 'hechizo') {
      for (let i = 0; i < 8; i++) {
        const x = [72, 155, 260, 465, 560, 645, 36, 680][i]; const y = [200, 65, 180, 70, 155, 220, 480, 470][i] + (moving ? Math.sin(t * 1.1 + i) * 10 : 0);
        c.save(); c.fillStyle = '#efd9a4'; c.fillRect(x, y, 6, 30 + i * 3); c.shadowColor = '#ffc561'; c.shadowBlur = 22; c.beginPath(); c.ellipse(x + 3, y - 8, 4, 9, 0, 0, Math.PI * 2); c.fillStyle = '#fff4cc'; c.fill(); c.restore();
      }
      if (t < 5) text('✦  ANDÉN 9¾  ✦', 890, 24, { family: families.editorial, color: colors.accent });
    }
    const index = t < 5 ? 0 : t < 10 ? 1 : 2; const elapsed = t - [0, 5, 10][index];
    c.save(); scene(index, elapsed); c.restore();
    text(sample ? 'MUESTRA · MOMENTOS EN VIVO' : 'MOMENTOS EN VIVO', 92, 18, { color: colors.text });
    text('Un proyecto de Sylar.soluciones', 1220, 17);
    // A quiet progress line gives the story a clear beginning and end.
    c.globalAlpha = .25; c.fillStyle = colors.accent; c.fillRect(90, 145, 540, 2); c.globalAlpha = 1; c.fillRect(90, 145, 540 * t / DURATION, 2);
  };
}

async function recordVideo(canvas, draw, { music, theme, custom, signal, progress }) {
  const type = mp4Type(music); if (!type) throw new Error('Este navegador no permite crear el MP4. Probá con Chrome o Edge actualizado.');
  const audio = music ? soundtrack(theme, { record: true, custom }) : null;
  let stream, recorder, raf, timeout, stopped = false;
  // Resume from the explicit click; music is sent only to the exported file.
  try {
    if (audio) await audio.start();
    draw(0); stream = canvas.captureStream(24);
    if (audio) for (const track of audio.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000, ...(music ? { audioBitsPerSecond: 128000 } : {}) });
    const chunks = [];
    const blob = await new Promise((resolve, reject) => {
      const abort = () => { stopped = true; if (recorder.state !== 'inactive') recorder.stop(); reject(new Error(signal.reason || 'Creación cancelada.')); };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error('No se pudo crear el video. Probá desde otro navegador.')); };
      recorder.onstop = () => { signal.removeEventListener('abort', abort); if (!stopped) resolve(new Blob(chunks, { type: 'video/mp4' })); };
      recorder.start(1000); const start = performance.now();
      const frame = now => {
        if (stopped || signal.aborted) return;
        const t = (now - start) / 1000; draw(t); progress(Math.min(t / DURATION, 1));
        if (t >= DURATION) { recorder.stop(); return; } raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      timeout = setTimeout(() => { stopped = true; if (recorder.state !== 'inactive') recorder.stop(); reject(new Error('La creación se interrumpió. Mantené esta pestaña visible e intentá otra vez.')); }, 40000);
    });
    if (blob.size < 1000) throw new Error('El video quedó incompleto. Intentá crearlo otra vez.');
    return blob;
  } finally {
    stopped = true; clearTimeout(timeout); cancelAnimationFrame(raf);
    if (recorder?.state !== 'inactive' && recorder) recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); await audio?.close();
  }
}

export async function videoDialog({ event, p, assets, colors, url, sample = false, el, button, save, notice }) {
  const canvas = el('canvas', { class: 'invite-video-canvas', 'aria-label': 'Vista previa del video de invitación' });
  const status = el('p', { class: 'status', role: 'status' }, 'Preparando la vista previa…');
  const progress = el('progress', { class: 'invite-video-progress', max: 1, value: 0, 'aria-label': 'Progreso del video' });
  const ready = el('div', { class: 'video-share-ready', hidden: true });
  let draw, previewFrame, previewAudio, recording, controller, disposed = false, result;
  const music = el('input', { type: 'checkbox', checked: p.musicEnabled });
  const replay = button('Reproducir vista previa', () => preview(), 'secondary'); replay.disabled = true;
  const create = button('Crear video MP4', async () => {
    if (!draw || recording || !url) return;
    cancelAnimationFrame(previewFrame); previewAudio?.close(); previewAudio = null; controller = new AbortController(); recording = true; music.disabled = true; replay.disabled = true; ready.hidden = true;
    status.textContent = 'Creando tu video… Mantené esta pestaña visible.';
    try {
      result = await recordVideo(canvas, draw, { music: music.checked, theme: p.themeId, custom: p.musicSource === 'custom' ? assets.music : null, signal: controller.signal, progress: value => { progress.value = value; } });
      if (disposed) return;
      status.textContent = `Video listo · 16 segundos · ${(result.size / 1048576).toFixed(1)} MB`;
      ready.replaceChildren(button('Descargar MP4', () => save(result, `invitacion-${event.id}.mp4`)), el('p', { class: 'privacy' }, 'Adjuntá este video en WhatsApp y acompañalo con el enlace de la invitación. El video incluye su QR.'));
      ready.hidden = false; notice('Video listo para descargar.');
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { recording = false; music.disabled = false; replay.disabled = false; }
  }); create.disabled = true;
  const close = button('Cerrar', () => dialog.close(), 'secondary');
  const cancel = button('Cancelar creación', () => controller?.abort('Creación cancelada. Podés volver a intentarlo.'), 'secondary');
  const dialog = el('dialog', { class: 'invite-video-dialog', 'aria-labelledby': 'video-title' }, el('p', { class: 'eyebrow' }, 'Para compartir por WhatsApp'), el('h2', { id: 'video-title' }, 'Tu invitación en movimiento'), el('p', { class: 'muted' }, 'Tres escenas, el mismo tema y todos los datos de tu celebración.'), canvas, progress, status, el('label', { class: 'check-field' }, music, p.musicSource === 'custom' ? 'Incluir mi música' : 'Incluir música instrumental'), el('div', { class: 'actions' }, replay, create), ready, el('div', { class: 'actions' }, cancel, close));
  const visibility = () => { if (document.hidden) { controller?.abort('Se pausó la pestaña. Volvé a crear el video manteniéndola visible.'); cancelAnimationFrame(previewFrame); previewAudio?.close(); previewAudio = null; } };
  document.addEventListener('visibilitychange', visibility);
  dialog.addEventListener('close', () => { disposed = true; controller?.abort(); cancelAnimationFrame(previewFrame); previewAudio?.close(); document.removeEventListener('visibilitychange', visibility); dialog.remove(); });
  document.body.append(dialog); dialog.showModal();
  async function preview() {
    if (!draw || recording || disposed) return;
    cancelAnimationFrame(previewFrame); previewAudio?.close(); previewAudio = null;
    if (music.checked) { const track = soundtrack(p.themeId, { custom: p.musicSource === 'custom' ? assets.music : null }); previewAudio = track; try { await track.start(); } catch (error) { await track.close(); throw error; } }
    if (disposed) { previewAudio?.close(); return; }
    const start = performance.now();
    const frame = now => { if (disposed || recording) return; const time = Math.min((now - start) / 1000, DURATION); draw(time); progress.value = time / DURATION; if (time < DURATION) previewFrame = requestAnimationFrame(frame); else { previewAudio?.close(); previewAudio = null; } };
    previewFrame = requestAnimationFrame(frame);
  }
  music.addEventListener('change', () => { create.disabled = !url || !mp4Type(music.checked); if (create.disabled && url) status.textContent = 'Este navegador no permite crear el MP4 con esta opción de sonido.'; });
  try {
    draw = await renderer(canvas, { event, p, assets, colors, url, sample }); if (disposed) return;
    draw(2); replay.disabled = false; create.disabled = !url || !mp4Type(music.checked);
    status.textContent = !url ? 'Guardá y publicá la invitación para descargar su video con enlace y QR.' : create.disabled ? 'Este navegador no permite crear MP4. Probá con Chrome o Edge actualizado.' : 'Vista previa lista · Vertical 720 × 1280 · 16 segundos';
  } catch (error) { if (!disposed) status.textContent = `No pudimos preparar el video. ${error.message}`; }
}
