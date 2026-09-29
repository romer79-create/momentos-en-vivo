import { ProjectionQueue } from './projection-state.mjs';

export async function runProjection({ stage, status, el, empty, request, eventPath }) {
  const queue = new ProjectionQueue();
  const cache = new Map();
  let index = 0, signature = '', frameVersion = 0, frameUrls = [], loading = false, disposed = false;
  let spotlight = null, spotlightUrl = '', spotlightPhoto = null, spotlightLoading = false;
  let timer, startedAt = 0, remaining = 6000, feedVersion = null;
  const revoke = urls => urls.forEach(url => URL.revokeObjectURL(url));
  async function image(photo) {
    const blob = cache.get(photo.id) || await request(eventPath(`/photos/${photo.id}/image`), { guest: true, blob: true });
    if (disposed || !queue.photos.some(p => p.id === photo.id)) throw new Error('La foto ya no está disponible.');
    cache.delete(photo.id); cache.set(photo.id, blob);
    while (cache.size > 8) cache.delete(cache.keys().next().value);
    return blob;
  }
  function removeSpotlight() {
    clearTimeout(timer); timer = null;
    spotlight?.remove(); spotlight = null; spotlightPhoto = null;
    if (spotlightUrl) URL.revokeObjectURL(spotlightUrl); spotlightUrl = '';
    stage.classList.remove('is-spotlighting');
  }
  async function showCarousel() {
    const photos = queue.carousel();
    const selected = photos.length ? Array.from({ length: Math.min(3, photos.length) }, (_, offset) => photos[(index + offset) % photos.length]) : [];
    const nextSignature = JSON.stringify(selected);
    if (signature === nextSignature) return;
    const version = ++frameVersion; const urls = []; let kept = false;
    try {
      const settled = await Promise.allSettled(selected.map(async photo => {
        const blob = await image(photo); const url = URL.createObjectURL(blob); urls.push(url);
        const img = el('img', { src: url, alt: 'Foto aprobada del evento' }); await img.decode();
        return el('figure', { class: 'live-frame', 'data-photo-id': photo.id }, img, photo.message ? el('figcaption', { class: 'caption' }, photo.message) : null);
      }));
      if (version !== frameVersion || disposed) return;
      const failed = settled.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
      const frames = settled.map(result => result.value);
      for (const old of stage.querySelectorAll(':scope > .live-frame, :scope > .empty')) old.remove();
      revoke(frameUrls); frameUrls = urls; kept = true; signature = nextSignature;
      stage.dataset.count = String(selected.length);
      stage.prepend(...(frames.length ? frames : [empty('Los próximos recuerdos están por llegar.')]));
    } catch (error) {
      if (version === frameVersion && !disposed) { status.textContent = error.message; if ([403, 404].includes(error.status)) clearDisplay(); }
    } finally { if (!kept) revoke(urls); }
  }
  function armTimer() {
    if (!spotlight || document.hidden || disposed) return;
    startedAt = performance.now();
    timer = setTimeout(async () => {
      const photo = queue.current; queue.finish(); removeSpotlight();
      index = Math.max(0, queue.carousel().findIndex(p => p.id === photo?.id));
      await showCarousel(); await nextSpotlight();
    }, remaining);
  }
  async function nextSpotlight() {
    if (spotlight || spotlightLoading || document.hidden || disposed) return;
    const photo = queue.next(); if (!photo) return;
    spotlightLoading = true; let url = '';
    try {
      const blob = await image(photo); url = URL.createObjectURL(blob);
      const img = el('img', { src: url, alt: 'Nueva foto aprobada del evento' }); await img.decode();
      if (disposed || document.hidden || queue.current !== photo) return;
      spotlight = el('div', { class: 'photo-spotlight', 'data-photo-id': photo.id, 'aria-live': 'polite' },
        el('p', { class: 'spotlight-label' }, el('span', { 'aria-hidden': true }, '✦'), ' Un nuevo momento'),
        el('figure', { class: 'spotlight-frame' }, img, photo.message ? el('figcaption', {}, photo.message) : null));
      spotlightUrl = url; url = ''; spotlightPhoto = photo;
      stage.append(spotlight); stage.classList.add('is-spotlighting'); remaining = 6000; armTimer();
    } catch (error) {
      status.textContent = error.message;
      if ([403, 404].includes(error.status)) { queue.current = null; removeSpotlight(); }
      // Transient failures retain the queue item for the next successful poll.
    } finally { if (url) URL.revokeObjectURL(url); spotlightLoading = false; }
  }
  function clearDisplay() {
    ++frameVersion; queue.clear(); cache.clear(); removeSpotlight(); feedVersion = null;
    revoke(frameUrls); frameUrls = []; signature = ''; stage.dataset.count = '0';
    stage.replaceChildren(empty('Actualizando recuerdos…'));
  }
  async function poll() {
    if (loading || disposed) return; loading = true;
    try {
      const result = await request(eventPath(`/photos${feedVersion === null ? '' : `?version=${feedVersion}`}`), { guest: true }); if (disposed) return;
      status.textContent = '● En vivo';
      if (result.unchanged) { await showCarousel(); await nextSpotlight(); return; }
      const { photos } = result; feedVersion = result.version;
      queue.sync(photos);
      const allowed = new Set(photos.map(photo => photo.id));
      for (const id of cache.keys()) if (!allowed.has(id)) cache.delete(id);
      // Remove rejected photos immediately on refresh, including any spotlight.
      if (spotlightPhoto && queue.current !== spotlightPhoto) removeSpotlight();
      for (const frame of stage.querySelectorAll('.live-frame')) if (!allowed.has(frame.dataset.photoId)) { frame.remove(); signature = ''; }
      await showCarousel(); await nextSpotlight();
    } catch (error) { status.textContent = error.message; if ([401, 403, 404].includes(error.status)) clearDisplay(); }
    finally { loading = false; }
  }
  const visibility = async () => {
    if (document.hidden) {
      if (timer) { clearTimeout(timer); timer = null; remaining = Math.max(0, remaining - (performance.now() - startedAt)); }
    } else { await poll(); if (!timer) armTimer(); }
  };
  document.addEventListener('visibilitychange', visibility);
  await poll();
  const refresh = setInterval(() => { if (!document.hidden) poll(); }, 4000);
  const carousel = setInterval(() => { if (!document.hidden && !queue.current && queue.carousel().length) { index++; showCarousel(); } }, 7000);
  window.addEventListener('pagehide', () => {
    disposed = true; ++frameVersion; clearInterval(refresh); clearInterval(carousel); removeSpotlight(); revoke(frameUrls); cache.clear(); document.removeEventListener('visibilitychange', visibility);
  }, { once: true });
}
