import './vendor/sylar-assistant.js';
import css from './sylar-integration.css';
import { mountMomentosHelp } from './momentos-help.js';

// One shared, self-hosted integration. Invitation/projection pages stay client-themed.
if (!['invitation', 'projection'].includes(document.body.dataset.page) && !document.querySelector('sylar-assistant')) {
  const assistant = document.createElement('sylar-assistant');
  assistant.id = 'sylar-help'; assistant.setAttribute('compact', '');
  const root = assistant.shadowRoot;
  const style = document.createElement('style'); style.textContent = css; root.append(style);
  document.body.append(assistant);
  document.body.classList.add('has-sylar');
  const life = new AbortController();
  let frame = 0, greetingTimer;
  const panel = root.querySelector('.panel');
  const launcher = root.querySelector('.launcher');
  const stopHelp = mountMomentosHelp(assistant, { onGuide() {
    assistant.open(false);
    document.dispatchEvent(new Event('sylar:guide'));
  } });
  const settings = document.createElement('div'); settings.className = 'help-settings';
  const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = 'Pausar movimiento'; pause.setAttribute('aria-pressed', 'false');
  pause.addEventListener('click', () => {
    const paused = assistant.toggleAttribute('paused');
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Reanudar movimiento' : 'Pausar movimiento';
  }, { signal: life.signal });
  settings.append(pause); panel.append(settings);

  function layout() {
    frame = 0;
    const viewport = window.visualViewport;
    const height = viewport?.height ?? innerHeight;
    const keyboard = Math.max(0, innerHeight - height - (viewport?.offsetTop ?? 0));
    assistant.style.setProperty('--sylar-viewport-height', `${Math.round(height)}px`);
    assistant.style.setProperty('--sylar-keyboard-bottom', `${Math.round(keyboard)}px`);
    assistant.toggleAttribute('short-viewport', height < 520);
    // The mascot yields space to page controls while closed; the chat is a deliberate overlay.
    if (!panel.hidden) return;
    const controls = [...document.querySelectorAll('button,a[href],input,textarea,select,summary,[role="button"]')]
      .map(node => ({ node, box: node.getBoundingClientRect() }))
      .filter(({ node, box }) => box.width && box.height && box.top < innerHeight && box.bottom > 0 && getComputedStyle(node).visibility !== 'hidden');
    for (const offset of [0, 64, 128, 192, 256]) {
      assistant.style.setProperty('--sylar-dock-offset', `${offset}px`);
      const box = launcher.getBoundingClientRect();
      if (box.top < (viewport?.offsetTop || 0) + 12) break;
      if (!controls.some(({ box: b }) => box.left < b.right + 4 && box.right > b.left - 4 && box.top < b.bottom + 4 && box.bottom > b.top - 4)) return;
    }
    assistant.style.setProperty('--sylar-dock-offset', '0px');
  }
  const queueLayout = () => { if (!frame) frame = requestAnimationFrame(layout); };
  for (const type of ['resize', 'scroll']) window.addEventListener(type, queueLayout, { passive: true, signal: life.signal });
  for (const type of ['resize', 'scroll']) window.visualViewport?.addEventListener(type, queueLayout, { signal: life.signal });
  const observer = new ResizeObserver(queueLayout); observer.observe(document.body);
  assistant.addEventListener('sylar:toggle', queueLayout, { signal: life.signal });
  assistant.addEventListener('sylar:state', event => {
    clearTimeout(greetingTimer);
    if (event.detail.state === 'hello') greetingTimer = setTimeout(() => assistant.setState('idle'), 2200);
  }, { signal: life.signal });
  document.addEventListener('sylar:guide-closed', () => launcher.focus(), { signal: life.signal });
  layout();
  window.addEventListener('pagehide', () => {
    stopHelp(); life.abort(); observer.disconnect();
    cancelAnimationFrame(frame); clearTimeout(greetingTimer); assistant.remove();
    document.body.classList.remove('has-sylar');
  }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
