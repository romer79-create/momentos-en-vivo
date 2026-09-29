'use strict';
// Adapter only: package images and animations stay intact; the help module supplies answers.
const status = document.querySelector('#status');
const settings = document.querySelector('#settings');
const start = document.querySelector('#start');
const assistant = document.querySelector('#sylar-demo');
const stateSelect = document.querySelector('#animation-state');
const life = new AbortController();
let greetingTimer;
let viewportFrame;

document.querySelector('#restart').addEventListener('click', () => location.reload());
document.querySelector('#open-guide').addEventListener('click', () => {
  assistant.open?.(false);
  assistant.hidden = true;
  window.openSylarGuide();
});

if (!customElements.get('sylar-assistant')) {
  status.textContent = 'No se pudo cargar el paquete local. La guía del evento sigue disponible.';
} else {
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = '/sylar-integration.css';
  assistant.shadowRoot.append(style);
  assistant.hidden = false;
  document.body.classList.add('sylar-package-ready');
  start.disabled = false;
  status.textContent = 'Sylar está listo. Preguntale sobre Momentos en Vivo o elegí un tema.';

  const viewport = () => {
    const visible = window.visualViewport;
    const height = visible?.height ?? window.innerHeight;
    const keyboard = Math.max(0, window.innerHeight - height - (visible?.offsetTop ?? 0));
    assistant.style.setProperty('--sylar-viewport-height', `${Math.round(height)}px`);
    assistant.style.setProperty('--sylar-keyboard-bottom', `${Math.round(keyboard)}px`);
    assistant.toggleAttribute('short-viewport', height < 520);
    viewportFrame = 0;
  };
  const queueViewport = () => { if (!viewportFrame) viewportFrame = requestAnimationFrame(viewport); };
  window.addEventListener('resize', queueViewport, { signal: life.signal });
  window.visualViewport?.addEventListener('resize', queueViewport, { signal: life.signal });
  window.visualViewport?.addEventListener('scroll', queueViewport, { signal: life.signal });
  viewport();

  settings.addEventListener('submit', event => {
    event.preventDefault(); settings.elements.hide.checked = false;
    assistant.hidden = false; assistant.open(true);
    status.textContent = 'Sylar está listo. Te guía con respuestas preparadas sobre Momentos en Vivo.';
  });
  settings.elements.compact.addEventListener('change', event => assistant.toggleAttribute('compact', event.target.checked));
  settings.elements.paused.addEventListener('change', event => assistant.toggleAttribute('paused', event.target.checked));
  settings.elements.hide.addEventListener('change', event => {
    if (event.target.checked) assistant.open(false);
    assistant.hidden = event.target.checked;
    event.target.focus();
    status.textContent = event.target.checked ? 'Personaje oculto. La guía del evento sigue disponible.' : 'Sylar está listo. Preguntale sobre Momentos en Vivo o elegí un tema.';
  });
  stateSelect.addEventListener('change', () => assistant.setState(stateSelect.value));
  assistant.addEventListener('sylar:state', event => {
    clearTimeout(greetingTimer);
    stateSelect.value = event.detail.state;
    if (event.detail.state === 'hello') greetingTimer = setTimeout(() => assistant.setState('idle'), 2200);
  });
  // Keep the component's nonmodal chat and existing event guide separate.
  document.addEventListener('close', event => {
    if (event.target.id !== 'event-assistant') return;
    assistant.hidden = settings.elements.hide.checked;
    document.querySelector('#open-guide').focus();
  }, { capture: true, signal: life.signal });

  window.addEventListener('pagehide', () => {
    clearTimeout(greetingTimer); cancelAnimationFrame(viewportFrame);
    life.abort(); assistant.remove();
  }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
