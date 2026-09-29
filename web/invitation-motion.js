import { soundtrack } from './invitation-audio';

export function animatedInvitation({ card, event, p, assets = {}, el, button, notice }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = el('section', { class: 'invitation-experience', 'data-theme': p.themeId, 'data-motion': String(p.motion) });
  const particles = el('div', { class: 'invite-particles', 'aria-hidden': true });
  for (let i = 0; i < 14; i++) particles.append(el('i', { style: `--i:${i};--x:${(i * 37 + 7) % 100}%;--delay:${-i * .9}s` }));
  card.prepend(particles); root.append(card);
  const enchanted = p.themeId === 'hechizo';
  const candles = () => el('div', { class: 'magic-candles', 'aria-hidden': true }, ...Array.from({ length: 8 }, (_, i) => el('i', { style: `--c:${i};--left:${[9, 22, 37, 63, 78, 91, 4, 96][i]}%;--top:${[70, 25, 53, 18, 59, 40, 215, 195][i]}px` })));
  if (enchanted) {
    card.prepend(candles());
    card.querySelector('.invite-content').prepend(el('div', { class: 'magic-crest', 'aria-hidden': true }, '✦'));
    card.querySelector('.invite-message').after(el('p', { class: 'magic-ticket' }, 'ANDÉN 9¾', el('span', {}, 'Rumbo a una noche inolvidable')));
  }
  let music, disposed = false, openingTimer, countdownTimer;
  const toggleMusic = button('Activar música', async () => {
    if (music) { await music.close(); music = null; updateMusic(); return; }
    const track = soundtrack(p.themeId, { custom: p.musicSource === 'custom' ? assets.music : null }); music = track;
    try { await track.start(); if (disposed) { await track.close(); return; } updateMusic(); }
    catch (error) { await track.close(); music = null; updateMusic(); throw error; }
  }, 'invite-sound');
  function updateMusic() { toggleMusic.textContent = music ? '♪ Silenciar música' : '♪ Activar música'; toggleMusic.setAttribute('aria-pressed', String(Boolean(music))); }
  updateMusic();
  if (p.musicEnabled) card.append(toggleMusic);
  if (p.countdown) {
    const countdown = el('div', { class: 'invite-countdown', 'aria-label': 'Cuenta regresiva' });
    card.querySelector('.invite-actions').before(countdown);
    const tick = () => {
      const minutes = Math.max(0, Math.floor((Date.parse(event.startsAt) - Date.now()) / 60000));
      if (!minutes) { countdown.replaceChildren(el('span', {}, '¡Llegó el momento de celebrar!')); return; }
      const values = [[Math.floor(minutes / 1440), 'días'], [Math.floor(minutes / 60) % 24, 'horas'], [minutes % 60, 'minutos']];
      countdown.replaceChildren(...values.map(([n, label]) => el('div', {}, el('strong', {}, String(n).padStart(2, '0')), el('span', {}, label))));
    };
    tick(); countdownTimer = setInterval(tick, 60000);
  }
  const useOpening = p.opening && p.motion && !reduced.matches;
  root.dataset.open = String(!useOpening); card.inert = useOpening;
  if (useOpening) {
    card.setAttribute('aria-hidden', 'true');
    const initials = event.name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('');
    const cover = el('div', { class: 'invite-envelope' },
      el('p', { class: 'envelope-kicker' }, enchanted ? 'Una carta para alguien extraordinario' : 'Hay momentos que merecen compartirse'),
      el('div', { class: 'envelope-paper', 'aria-hidden': true }, el('div', { class: 'envelope-letter' }, el('span', {}, p.eyebrow), el('strong', {}, event.name)), el('div', { class: 'envelope-left' }), el('div', { class: 'envelope-right' }), el('div', { class: 'envelope-flap' }), el('div', { class: 'envelope-seal' }, initials || 'M')),
      el('p', { class: 'envelope-name' }, event.name),
      button('Abrir invitación', open, 'envelope-open'), el('p', { class: 'envelope-note' }, enchanted ? 'Rompé el sello. La magia empieza acá.' : 'Un momento especial te espera adentro'),
      el('p', { class: 'theme-credit' }, 'Un proyecto de Sylar.soluciones'));
    root.prepend(cover);
    if (enchanted) cover.prepend(candles());
    function reveal() {
      root.dataset.open = 'true'; card.inert = false; card.removeAttribute('aria-hidden'); cover.remove();
      const heading = card.querySelector('h1'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
    }
    function open() {
      if (root.dataset.opening) return;
      root.dataset.opening = 'true'; cover.querySelector('button').disabled = true;
      openingTimer = setTimeout(reveal, reduced.matches ? 0 : 1100);
    }
    const reduce = () => { if (reduced.matches && cover.isConnected) { clearTimeout(openingTimer); reveal(); } };
    reduced.addEventListener('change', reduce);
    root.addEventListener('invite-dispose', () => reduced.removeEventListener('change', reduce), { once: true });
  }
  const visibility = () => { if (document.hidden && music) { music.close(); music = null; updateMusic(); } };
  document.addEventListener('visibilitychange', visibility);
  const dispose = () => { if (disposed) return; disposed = true; clearTimeout(openingTimer); clearInterval(countdownTimer); music?.close(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', dispose); root.dispatchEvent(new Event('invite-dispose')); };
  window.addEventListener('pagehide', dispose, { once: true }); root.dispose = dispose;
  return root;
}
