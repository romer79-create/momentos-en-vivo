export const PRESENCE_TIMING = Object.freeze({ initialDelay: 45000, repeatDelay: 180000, duration: 7000 });

// A single cancellable timer; inactivity is measured again after every interaction.
export function createPresenceReminder({ canShow, show, hide, schedule = setTimeout, cancel = clearTimeout, timing = PRESENCE_TIMING }) {
  let timer, displayed = false, disposed = false;
  function clear() { if (timer !== undefined) cancel(timer); timer = undefined; }
  function arm(delay) {
    if (disposed || !canShow()) return;
    timer = schedule(() => {
      timer = undefined;
      if (disposed || !canShow()) return;
      if (show() === false) { arm(timing.initialDelay); return; }
      displayed = true;
      timer = schedule(() => {
        timer = undefined; hide(); arm(timing.repeatDelay);
      }, timing.duration);
    }, delay);
  }
  return {
    touch() { if (disposed) return; clear(); hide(); arm(displayed ? timing.repeatDelay : timing.initialDelay); },
    hold() { clear(); },
    destroy() { disposed = true; clear(); hide(); },
  };
}

export function mountPresenceReminder(assistant) {
  const root = assistant.shadowRoot;
  const panel = root.querySelector('.panel');
  const life = new AbortController();
  const bubble = document.createElement('button');
  bubble.type = 'button'; bubble.className = 'presence-hint'; bubble.hidden = true;
  bubble.textContent = 'Si necesitás algo, acá estoy.';
  bubble.setAttribute('aria-label', 'Si necesitás algo, acá estoy. Abrir ayuda de Sylar');
  root.append(bubble);
  // Replace the package's permanent invitation with the occasional reminder.
  root.querySelector('.hello').setAttribute('aria-hidden', 'true');

  const editing = () => {
    let focus = document.activeElement;
    while (focus?.shadowRoot?.activeElement) focus = focus.shadowRoot.activeElement;
    return focus?.matches('textarea,select,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])');
  };
  function canShow() {
    return assistant.isConnected && !assistant.hidden && !assistant.hasAttribute('paused') && panel.hidden && !document.hidden && !document.querySelector('dialog[open]') && !editing();
  }
  const overlap = (a, b) => a.left < b.right + 5 && a.right > b.left - 5 && a.top < b.bottom + 5 && a.bottom > b.top - 5;
  function unobstructed() {
    const rect = bubble.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    if (rect.left < left + 4 || rect.top < top + 4 || rect.right > left + (viewport?.width || innerWidth) - 4 || rect.bottom > top + (viewport?.height || innerHeight) - 4) return false;
    return ![...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"],[contenteditable="true"]')].some(control => {
      const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility !== 'hidden' && overlap(rect, box);
    });
  }
  const reminder = createPresenceReminder({
    canShow,
    show() {
      bubble.hidden = false;
      for (const placement of ['beside', 'beside-low', 'above']) {
        bubble.dataset.placement = placement;
        if (unobstructed()) return true;
      }
      bubble.hidden = true; return false;
    },
    hide() { bubble.hidden = true; },
  });
  bubble.addEventListener('click', () => { reminder.touch(); assistant.open(true); }, { signal: life.signal });
  // Do not dismiss the bubble on pointerdown before its click can open the chat.
  const touch = event => {
    if (event?.composedPath?.().includes(bubble)) return;
    // Focusing an off-screen button may scroll the document after focus fires.
    if (event?.type === 'scroll' && root.activeElement === bubble) return;
    reminder.touch();
  };
  bubble.addEventListener('focus', () => reminder.hold(), { signal: life.signal });
  bubble.addEventListener('blur', () => reminder.touch(), { signal: life.signal });
  for (const type of ['pointerdown', 'keydown', 'input', 'scroll', 'focusin', 'focusout']) document.addEventListener(type, touch, { capture: true, passive: true, signal: life.signal });
  document.addEventListener('visibilitychange', touch, { signal: life.signal });
  window.addEventListener('resize', touch, { signal: life.signal });
  window.visualViewport?.addEventListener('resize', touch, { signal: life.signal });
  assistant.addEventListener('sylar:toggle', touch, { signal: life.signal });
  const observer = new MutationObserver(touch);
  observer.observe(assistant, { attributes: true, attributeFilter: ['hidden', 'paused'] });
  reminder.touch();
  return () => { life.abort(); observer.disconnect(); reminder.destroy(); bubble.remove(); };
}
