import { FAQ, GROUPS, SUPPORT, answerTopic, resolveQuestion } from './momentos-knowledge.mjs';
import { mountPresenceReminder } from './sylar-presence.mjs';

export function mountMomentosHelp(assistant, { local = false, onGuide } = {}) {
  // Use the package's public message/reply methods; keep its drawing and animations intact.
  assistant.removeAttribute('demo');
  const root = assistant.shadowRoot;
  const messages = root.querySelector('.messages');
  const panel = root.querySelector('.panel');
  const life = new AbortController();
  root.querySelector('.connection').textContent = 'Momentos en Vivo · ayuda predefinida';
  root.querySelector('.note').textContent = `${local ? 'Prueba local. ' : ''}Respuestas predefinidas, sin IA. No consulto tu cuenta ni realizo cambios. El chat se borra al recargar.`;
  root.querySelector('input').placeholder = '¿Qué necesitás saber del evento?';
  messages.replaceChildren();

  function button(label, action) {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label;
    node.addEventListener('click', action, { signal: life.signal });
    return node;
  }
  function finish() { messages.scrollTop = messages.scrollHeight; }
  function choices(topics) {
    const list = document.createElement('div'); list.className = 'help-choices';
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Preguntas sugeridas');
    for (const id of topics) {
      const topic = FAQ.find(entry => entry.id === id); if (!topic) continue;
      list.append(button(topic.question, () => {
        assistant.addMessage(topic.question, 'user'); show(answerTopic(id));
      }));
    }
    messages.append(list); finish();
  }
  function contact() {
    const box = document.createElement('div'); box.className = 'help-contact';
    for (const [label, href] of [['Abrir WhatsApp de soporte', SUPPORT.whatsapp], ['Escribir a sylar.soluciones@gmail.com', SUPPORT.email]]) {
      const link = document.createElement('a'); link.href = href; link.textContent = label;
      if (href.startsWith('https:')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      box.append(link);
    }
    messages.append(box); finish();
  }
  function groups() {
    const list = document.createElement('div'); list.className = 'help-choices';
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Temas de Momentos en Vivo');
    for (const [id, label] of Object.entries(GROUPS)) list.append(button(label, () => {
      assistant.addMessage(label, 'user');
      assistant.reply('Elegí la pregunta que querés resolver.');
      choices(FAQ.filter(entry => entry.group === id).map(entry => entry.id));
    }));
    messages.append(list); finish();
  }
  function show(result) {
    assistant.reply(result.text);
    if (result.topics) choices(result.topics);
    if (result.kind === 'topics' || result.kind === 'fallback') groups();
    if (result.contact) contact();
    finish();
  }
  const actions = document.createElement('nav'); actions.className = 'help-actions';
  actions.setAttribute('aria-label', 'Opciones de ayuda');
  actions.append(button('Ver temas', () => show(resolveQuestion('temas'))), button('Contactar a una persona', () => show(resolveQuestion('contacto'))));
  if (onGuide) {
    const guide = button('Guiarme en esta pantalla', onGuide);
    guide.className = 'help-guide';
    guide.hidden = !document.querySelector('.guide-launcher');
    document.addEventListener('sylar:guide-ready', () => { guide.hidden = false; }, { signal: life.signal });
    actions.prepend(guide);
  }
  panel.insertBefore(actions, root.querySelector('form'));
  assistant.addEventListener('sylar:message', event => {
    try { show(resolveQuestion(event.detail?.text)); }
    catch { assistant.fail('No pude mostrar la ayuda. Podés contactar a Sylar.soluciones.'); contact(); }
  }, { signal: life.signal });
  assistant.addMessage('¡Hola! Soy Sylar, la mascota de Sylar.soluciones. Te ayudo con respuestas preparadas sobre Momentos en Vivo. Si no tengo una respuesta, te muestro cómo contactarnos. ¿Por dónde empezamos?');
  choices(['empezar', 'precios', 'subir', 'invitacion']);
  messages.scrollTop = 0;
  const stopPresence = mountPresenceReminder(assistant);
  return () => { stopPresence(); life.abort(); };
}
