import { frameSequence } from './frame-sequence.mjs';

// Existing event QR URLs keep their private fragment during the homepage upgrade.
if (new URLSearchParams(location.search).has('event')) location.replace('/home.html' + location.search + location.hash);

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const systemTheme = matchMedia('(prefers-color-scheme: light)');
const themeToggle = document.querySelector('.theme-toggle');
let preference; try { preference = localStorage.getItem('mev-cover-theme'); } catch { /* Storage is optional. */ }
if (!['dark', 'light'].includes(preference)) preference = null;
function setTheme() {
  const theme = preference || (systemTheme.matches ? 'light' : 'dark'); root.dataset.theme = theme;
  themeToggle.setAttribute('aria-label', `Activar tema ${theme === 'dark' ? 'claro' : 'oscuro'}`);
  themeToggle.title = `Tema ${theme === 'dark' ? 'oscuro' : 'claro'} activo`;
  themeToggle.firstElementChild.textContent = theme === 'dark' ? '☼' : '☾';
}
themeToggle.hidden = false; setTheme();
themeToggle.addEventListener('click', () => { preference = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('mev-cover-theme', preference); } catch {} setTheme(); });
systemTheme.addEventListener('change', setTheme);

const motionToggle = document.querySelector('.motion-toggle'); let paused = false;
const sequence = frameSequence(document.querySelector('.hero-scene'), '/assets/portada-modelo/camera-turn-v1/manifest.json', () => !paused && !reduced.matches && fine.matches);
function motion() {
  root.dataset.motion = paused || reduced.matches || !fine.matches || document.hidden ? 'paused' : 'running';
  motionToggle.disabled = reduced.matches || !fine.matches;
  motionToggle.setAttribute('aria-pressed', String(paused || reduced.matches || !fine.matches));
  motionToggle.textContent = reduced.matches ? 'Movimiento reducido' : !fine.matches ? 'Vista táctil' : paused ? 'Reanudar efectos' : 'Pausar efectos';
  sequence.update();
}
motionToggle.hidden = false; motion();
motionToggle.addEventListener('click', () => { paused = !paused; motion(); });
reduced.addEventListener('change', motion); fine.addEventListener('change', motion); document.addEventListener('visibilitychange', motion);

// Explicit steps make approval understandable. There is no upload or server write.
const demo = document.querySelector('.demo'), next = document.getElementById('demo-next'), status = document.getElementById('demo-status');
const states = [
  { name: 'ready', button: 'Compartir foto de muestra ↗', text: 'Una foto está lista para compartir.' },
  { name: 'pending', button: 'Aprobar foto de muestra ✓', text: 'La foto espera tu revisión. Todavía no se proyectó.' },
  { name: 'projected', button: 'Volver a probar ↻', text: '¡Aprobada! El recuerdo ya está en la pantalla.' }
];
let step = 0; next.hidden = false;
next.addEventListener('click', () => { step = (step + 1) % states.length; const s = states[step]; demo.dataset.state = s.name; next.textContent = s.button; status.textContent = s.text; document.querySelectorAll('[data-step]').forEach((item, i) => { if (i === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); }); });

const rail = document.querySelector('.theme-rail'); const controls = document.querySelector('.rail-controls'); controls.hidden = false;
function railControls() { const end = rail.scrollWidth - rail.clientWidth; controls.querySelector('[data-rail="-1"]').disabled = rail.scrollLeft < 2; controls.querySelector('[data-rail="1"]').disabled = rail.scrollLeft >= end - 2; }
controls.addEventListener('click', event => { const button = event.target.closest('[data-rail]'); if (!button) return; rail.scrollBy({ left: Number(button.dataset.rail) * (rail.querySelector('.theme-card').offsetWidth + 20), behavior: reduced.matches ? 'instant' : 'smooth' }); });
rail.addEventListener('scroll', railControls, { passive: true }); const railResize = new ResizeObserver(railControls); railResize.observe(rail); railControls();
const reveal = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.dataset.reveal = 'shown'; reveal.unobserve(entry.target); } }, { threshold: .08 });
document.querySelectorAll('[data-reveal]').forEach(node => { if (!reduced.matches && node.getBoundingClientRect().top > innerHeight) node.dataset.reveal = 'waiting'; reveal.observe(node); });
const removeReveals = () => { if (reduced.matches) document.querySelectorAll('[data-reveal]').forEach(node => { node.dataset.reveal = 'shown'; }); }; reduced.addEventListener('change', removeReveals);
function dispose() { sequence.dispose(); reveal.disconnect(); railResize.disconnect(); reduced.removeEventListener('change', motion); reduced.removeEventListener('change', removeReveals); fine.removeEventListener('change', motion); systemTheme.removeEventListener('change', setTheme); document.removeEventListener('visibilitychange', motion); }
window.addEventListener('pagehide', dispose, { once: true });
// BFCache restores must also restore the observers that were disposed on pagehide.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

const priceNote = document.querySelector('.offer small');
priceNote.setAttribute('role', 'status'); priceNote.textContent = 'Consultando disponibilidad…';
fetch('/api/catalog', { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then(async response => {
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  const known = new Map([['evento-1', 1], ['pack-3', 3], ['pack-10', 10]]);
  const prices = (Array.isArray(catalog.plans) ? catalog.plans : []).filter(p => known.get(p.id) === p.credits && p.currency === 'ARS' && Number.isSafeInteger(p.priceCents) && p.priceCents > 0 && p.priceCents <= 1000000000);
  priceNote.textContent = prices.length ? prices.map(p => `${p.credits} ${p.credits === 1 ? 'evento' : 'eventos'}: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(p.priceCents / 100)}`).join(' · ') + ' ARS. 10 eventos: consultar.' : 'Precios por confirmar. Ya podés preparar tu borrador.';
  if (['local', 'sandbox'].includes(catalog.mode)) priceNote.append(' Versión de prueba, sin cobros reales.');
  else if (!catalog.checkoutEnabled) priceNote.append(' Las compras todavía no están habilitadas.');
}).catch(() => { priceNote.textContent = 'No pudimos consultar los precios. Podés revisarlos desde tu cuenta.'; });
