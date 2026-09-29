// Based on sylar-webs-interactivas: position within the scene, never the screen.
export function frameIndex(clientX, left, width, count, reverse = false) {
  if (![clientX, left, width, count].every(Number.isFinite) || width <= 0 || !Number.isInteger(count) || count < 1 || typeof reverse !== 'boolean') throw new TypeError('Secuencia inválida.');
  const index = Math.round(Math.max(0, Math.min(1, (clientX - left) / width)) * (count - 1));
  return reverse ? count - 1 - index : index;
}

export function frameSequence(scene, manifestUrl, allowed) {
  const poster = scene.querySelector('[data-sequence-poster]'); const canvas = scene.querySelector('[data-sequence-canvas]'); const c = canvas.getContext('2d');
  if (!c) return { update() {}, dispose() {} };
  const note = document.getElementById('sequence-note'); const staticNote = note?.textContent || '';
  const cache = new Map(), pending = new Map(), failed = new Set(); const abort = new AbortController();
  let manifest, ready = false, target = 0, shown = -1, raf = 0, disposed = false, visible = false;
  const imageUrl = name => new URL(name, new URL(manifestUrl, location.href)).href;
  const enabled = () => !disposed && visible && !document.hidden && allowed() && manifest?.count > 1;
  async function get(index) {
    if (cache.has(index)) { const value = cache.get(index); cache.delete(index); cache.set(index, value); return value; }
    if (pending.has(index)) return pending.get(index);
    if (failed.has(index)) return null;
    if (pending.size >= 2) { await Promise.race(pending.values()); return index === target && enabled() ? get(index) : null; }
    const job = (async () => {
      const img = new Image(); img.decoding = 'async'; img.src = imageUrl(manifest.files[index]);
      try { await img.decode(); if (disposed) return null; cache.set(index, img); while (cache.size > 6) cache.delete(cache.keys().next().value); return img; }
      catch { failed.add(index); return null; }
      finally { pending.delete(index); }
    })();
    pending.set(index, job); return job;
  }
  function requestDraw() { if (!raf && enabled() && target !== shown) raf = requestAnimationFrame(draw); }
  async function draw() {
    raf = 0; if (!enabled()) return; const index = target; const img = await get(index);
    if (!enabled()) return;
    // Never flash an unloaded frame, and never draw an old request after a new one.
    if (img && index === target) {
      c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false; poster.style.visibility = 'hidden'; shown = index; scene.dataset.frame = String(index);
    }
    if (index !== target) requestDraw();
  }
  function reset() { cancelAnimationFrame(raf); raf = 0; if (note) note.textContent = enabled() ? 'Mové el mouse y cambiá de mirada' : staticNote; if (!enabled()) { canvas.hidden = true; poster.style.visibility = ''; shown = -1; } else requestDraw(); }
  async function setup() {
    if (ready || !visible || document.hidden || !allowed() || disposed) return; ready = true;
    try {
      const response = await fetch(manifestUrl, { signal: abort.signal }); if (!response.ok) return; const data = await response.json();
      if (!Number.isInteger(data.count) || data.count < 1 || data.count > 120 || data.files?.length !== data.count || !data.files.every(name => /^[a-zA-Z0-9_-]+\.(?:webp|png)$/.test(name)) || typeof data.reverseMapping !== 'boolean') return;
      if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 1 || data.height < 1 || data.width * data.height > 1000000) return;
      if (!Number.isInteger(data.posterIndex) || data.posterIndex < 0 || data.posterIndex >= data.count) return;
      manifest = data; target = data.posterIndex;
      canvas.width = data.width; canvas.height = data.height;
      scene.dataset.sequence = data.count > 1 ? 'ready' : 'poster';
      reset();
    } catch { /* The HTML poster and the page remain fully usable. */ }
  }
  const move = event => { if (!enabled() || event.pointerType === 'touch') return; const r = scene.getBoundingClientRect(); target = frameIndex(event.clientX, r.left, r.width, manifest.count, manifest.reverseMapping); requestDraw(); };
  const leave = () => { if (manifest) { target = manifest.posterIndex || 0; requestDraw(); } };
  scene.addEventListener('pointermove', move); scene.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', reset);
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) setup(); reset(); }); observer.observe(scene);
  return {
    update() { setup(); reset(); },
    dispose() { disposed = true; abort.abort(); cancelAnimationFrame(raf); observer.disconnect(); scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerleave', leave); document.removeEventListener('visibilitychange', reset); cache.clear(); }
  };
}
