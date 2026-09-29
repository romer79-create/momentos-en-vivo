(() => {
  'use strict';

  // Legacy event QR links keep both their query and their private fragment.
  const query = new URLSearchParams(window.location.search);
  if (query.has('event')) {
    window.location.replace('/home.html' + window.location.search + window.location.hash);
    return;
  }

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileNav = window.matchMedia('(max-width: 640px)');
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  function closeMenu(returnFocus = false) {
    menu.setAttribute('aria-expanded', 'false');
    if (returnFocus) menu.focus();
  }
  menu.hidden = false;
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true')));
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-wrap')) closeMenu();
  });
  mobileNav.addEventListener('change', () => closeMenu());

  const stage = document.getElementById('experiencia');
  const toggle = document.getElementById('motion-toggle');
  const next = document.getElementById('demo-next');
  const phone = document.getElementById('phone-photo');
  const projected = document.getElementById('projection-photo');
  const flying = document.getElementById('flight-photo');
  const announcement = document.getElementById('demo-announcement');
  const photos = [
    { src: phone.getAttribute('src'), caption: 'Una noche para recordar.' },
    { src: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=600&auto=format&fit=crop', caption: 'Que no termine la fiesta.' },
    { src: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?q=80&w=600&auto=format&fit=crop', caption: 'Las ganas de celebrar.' },
    { src: 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=600&auto=format&fit=crop', caption: 'Ese momento, juntos.' }
  ];
  const states = ['ready', 'pending', 'approved', 'projected'];
  const labels = {
    ready: { phone: 'Foto lista para enviar ↑', approval: 'Primero, tu aprobación.', next: 'Enviar foto de prueba', message: 'Foto de muestra lista para enviar.' },
    pending: { phone: 'Enviada. Esperando revisión.', approval: 'Foto pendiente de revisión.', next: 'Aprobar foto de prueba', message: 'Foto enviada. Espera la aprobación del organizador; todavía no aparece en la pantalla.' },
    approved: { phone: '¡Tu foto fue aprobada!', approval: 'Aprobada por el organizador.', next: 'Mostrar en la pantalla', message: 'Foto aprobada. Ya puede mostrarse en la pantalla del evento.' },
    projected: { phone: 'Tu recuerdo, en la pantalla.', approval: 'Tu recuerdo ya es parte.', next: 'Probar con otra foto', message: 'La foto aprobada ahora se muestra en la proyección.' }
  };
  let stateIndex = 0;
  let photoIndex = 0;
  let userPaused = reducedMotion.matches;
  let stageVisible = true;
  let timer;
  let remaining = 3200;
  let deadline = 0;
  const durations = { ready: 3200, pending: 3500, approved: 2450, projected: 4200 };

  function imageSource(img, source) {
    if (img.getAttribute('src') === source) return;
    img.removeAttribute('data-failed');
    img.src = source;
  }
  // Remote pictures are decoration. If one fails, the CSS artwork remains visible.
  document.querySelectorAll('.photo-surface img').forEach(img => {
    img.addEventListener('error', () => img.setAttribute('data-failed', ''));
    img.addEventListener('load', () => img.removeAttribute('data-failed'));
    if (img.complete && img.naturalWidth === 0) img.setAttribute('data-failed', '');
  });

  function clearTimer() {
    if (timer !== undefined) {
      remaining = Math.max(0, deadline - performance.now());
      window.clearTimeout(timer);
      timer = undefined;
    }
  }
  function running() {
    return !userPaused && !reducedMotion.matches && !document.hidden && stageVisible;
  }
  function render(manual) {
    const state = states[stateIndex];
    const copy = labels[state];
    stage.dataset.state = state;
    document.getElementById('phone-status').textContent = copy.phone;
    document.getElementById('approval-label').textContent = copy.approval;
    next.replaceChildren(document.createTextNode(copy.next + ' '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    next.append(arrow);
    const currentStep = state === 'approved' ? 'pending' : state;
    stage.querySelectorAll('[data-step]').forEach(step => {
      if (step.dataset.step === currentStep) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    if (manual) announcement.textContent = copy.message;
  }
  function advance(manual = false) {
    clearTimer();
    stateIndex = (stateIndex + 1) % states.length;
    if (stateIndex === 0) {
      photoIndex = (photoIndex + 1) % photos.length;
      imageSource(phone, photos[photoIndex].src);
      imageSource(flying, photos[photoIndex].src);
      document.getElementById('phone-caption').textContent = photos[photoIndex].caption;
    }
    if (states[stateIndex] === 'approved') {
      const from = flying.parentElement.getBoundingClientRect();
      const to = projected.getBoundingClientRect();
      flying.parentElement.style.setProperty('--flight-x', (to.left + to.width / 2 - from.left - from.width / 2) + 'px');
      flying.parentElement.style.setProperty('--flight-y', (to.top + to.height / 2 - from.top - from.height / 2) + 'px');
    }
    // The screen changes only after the explicit approval step.
    if (states[stateIndex] === 'projected') {
      imageSource(projected, photos[photoIndex].src);
      document.getElementById('projection-caption').textContent = photos[photoIndex].caption;
    }
    remaining = durations[states[stateIndex]];
    render(manual);
    schedule();
  }
  function schedule() {
    if (!running() || timer !== undefined) return;
    deadline = performance.now() + remaining;
    timer = window.setTimeout(() => { timer = undefined; advance(); }, remaining);
  }
  function updateMotion() {
    if (!running()) clearTimer();
    root.dataset.motion = !userPaused && !reducedMotion.matches && !document.hidden ? 'running' : 'paused';
    stage.dataset.demoMotion = running() ? 'running' : 'paused';
    toggle.disabled = reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(userPaused || reducedMotion.matches));
    toggle.querySelector('[data-motion-label]').textContent = reducedMotion.matches ? 'Movimiento reducido' : userPaused ? 'Reanudar animación' : 'Pausar animación';
    toggle.querySelector('[data-motion-icon]').textContent = userPaused || reducedMotion.matches ? '▷' : 'Ⅱ';
    toggle.title = reducedMotion.matches ? 'Respetamos la preferencia de movimiento reducido de tu dispositivo. Podés recorrer la demo con el botón de cada paso.' : '';
    schedule();
  }
  toggle.hidden = false;
  next.hidden = false;
  toggle.addEventListener('click', () => { userPaused = !userPaused; updateMotion(); });
  next.addEventListener('click', () => {
    // A manual walkthrough never races the automatic demonstration.
    userPaused = true;
    updateMotion();
    advance(true);
  });
  reducedMotion.addEventListener('change', () => {
    userPaused = reducedMotion.matches || userPaused;
    updateMotion();
  });
  document.addEventListener('visibilitychange', updateMotion);
  if ('IntersectionObserver' in window) {
    const stageObserver = new IntersectionObserver(entries => {
      stageVisible = entries[0].isIntersecting;
      updateMotion();
    }, { threshold: 0.1 });
    stageObserver.observe(stage);
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.reveal = 'shown';
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      if (!reducedMotion.matches && element.getBoundingClientRect().top > window.innerHeight) element.dataset.reveal = 'waiting';
      revealObserver.observe(element);
    });
  }
  render(false);
  updateMotion();

  const catalogStatus = document.getElementById('catalog-status');
  const cards = [...document.querySelectorAll('[data-credits]')];
  const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  async function loadCatalog() {
    catalogStatus.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/api/catalog', { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Catalog unavailable');
      const catalog = await response.json();
      if (!catalog || !Array.isArray(catalog.plans) || !['local', 'sandbox', 'live', 'disabled'].includes(catalog.mode)) throw new Error('Invalid catalog');
      let available = 0;
      cards.forEach(card => {
        const plan = catalog.plans.find(item => item && item.credits === Number(card.dataset.credits));
        if (!plan) return;
        const validPrice = Number.isSafeInteger(plan.priceCents) && plan.priceCents > 0 && plan.priceCents <= 1e12 && plan.currency === 'ARS';
        const validId = typeof plan.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(plan.id);
        if (typeof plan.title === 'string' && plan.title.trim() && plan.title.length <= 80) card.querySelector('[data-plan-title]').textContent = plan.title;
        if (validPrice) card.querySelector('[data-plan-price]').textContent = priceFormatter.format(plan.priceCents / 100);
        const enabled = validPrice && validId && catalog.mode === 'live' && catalog.checkoutEnabled === true;
        if (enabled) {
          const buy = card.querySelector('[data-plan-buy]');
          buy.href = '/registro.html?plan=' + encodeURIComponent(plan.id);
          buy.hidden = false;
          card.querySelector('[data-plan-unavailable]').hidden = true;
          available++;
        } else if (catalog.mode === 'sandbox' || catalog.mode === 'local') {
          card.querySelector('[data-plan-unavailable]').textContent = 'Modo de prueba · compra no habilitada';
        }
      });
      if (available) {
        catalogStatus.textContent = 'Precios en pesos argentinos. Elegí un plan para continuar desde tu cuenta.';
      } else if (catalog.mode === 'sandbox' || catalog.mode === 'local') {
        catalogStatus.textContent = 'Los planes están en modo de prueba. Todavía no se realizan compras reales.';
      } else if (cards.some(card => card.querySelector('[data-plan-price]').textContent !== 'Precio por confirmar')) {
        catalogStatus.textContent = 'Estos son los precios configurados. La compra todavía no está habilitada.';
      }
    } catch {
      // Fail closed: absent, malformed or unreachable catalog never enables a sale.
      catalogStatus.textContent = 'Los precios están por confirmar. Podés crear tu cuenta; la compra todavía no está habilitada.';
    } finally {
      window.clearTimeout(timeout);
      catalogStatus.setAttribute('aria-busy', 'false');
    }
  }
  loadCatalog();

  // Retire the site's previous offline worker through the existing migration worker.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();

