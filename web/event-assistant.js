import { eventGuidance } from './event-guidance.mjs';

const common = [
  ['¿Cómo comparto la invitación?', 'En Mis eventos, abrí Diseño e invitación. Guardá tus cambios y, con el evento activado, pulsá Publicar invitación. Copiá el enlace y pegalo en WhatsApp. La tarjeta y el video son opcionales.'],
  ['¿Cómo muestro las fotos en la pantalla?', 'En Mis eventos, elegí Abrir proyección desde la computadora conectada a la TV o al proyector. Mantené esa pestaña visible y con internet. Desde tu celular podés ir aprobando las fotos.'],
  ['¿Una foto no aparece?', 'Primero revisá Pendientes en Administrar fotos. Si ya está aprobada, comprobá que la proyección corresponda al mismo evento, esté visible y tenga internet. Si activaste publicación automática, las fotos que estaban pendientes antes siguen necesitando aprobación.'],
  ['¿Cómo descargo todos los recuerdos?', 'En Administrar fotos, buscá Todos los recuerdos, a salvo y pulsá Preparar álbum completo. Podés volver más tarde: se prepara solo. Cuando esté listo, descargá todas las partes. Incluye fotos aprobadas, pendientes y rechazadas en carpetas separadas.'],
];
const topics = {
  panel: [['¿Tengo que configurar todo?', 'No. Completá nombre, fecha y hora, elegí un tema y revisá la activación. Los modelos ya traen su diseño. Tus fotos, colores y música son opcionales.'], ...common],
  design: [['¿Puedo usar el tema tal como viene?', 'Sí. Elegí el modelo que te guste y guardalo. Si querés, cambiá las palabras o el lugar. Fotos, colores y música están en Personalizar y son opcionales.'], ['¿Guardar es lo mismo que publicar?', 'Guardar conserva el diseño. Publicar habilita el enlace para los invitados y requiere que hayas activado el evento. Si la invitación ya está publicada, los cambios que guardes se verán en ese enlace.'], ...common.slice(0, 1)],
  moderator: [common[2], ['¿Qué hace la publicación automática?', 'Las nuevas fotos pasan directamente a la pantalla sin revisión previa. Es opcional, está desactivada por defecto y requiere que aceptes tu responsabilidad. Podés volver a la revisión manual desde Configurar publicación automática.'], common[1], common[3]],
  purchases: [['¿Cuándo uso un evento de mi saldo?', 'Al confirmar la activación de un evento. Crear un borrador y elegir su tema no consumen saldo. En la revisión final verás los plazos y cuántos eventos te quedarán.'], ['¿Qué hago si ya pagué y no aparece?', 'Abrí esa compra en el historial y consultá su estado. Podés usar Comprobar pago. No hace falta iniciar otra compra para verificar la anterior. Si sigue pendiente, contactanos con la referencia de la compra.']],
  payment: [['¿Ya puedo preparar mi evento?', 'Sí, podés guardar un borrador mientras se confirma la compra. La activación requiere saldo acreditado. La pantalla de pago te indica el estado confirmado.'], ['¿El pago está pendiente?', 'Podés usar Comprobar pago y volver al historial. Revisá esta misma compra antes de intentar pagar nuevamente.']],
  login: [['¿Es mi primera vez?', 'Elegí Crear cuenta, usá tu correo y verificá el enlace que recibas. Después podrás preparar un borrador.'], ['¿Olvidé la contraseña?', 'Escribí tu correo en esta pantalla y pulsá Olvidé mi contraseña. Revisá también la carpeta de correo no deseado.']],
  register: [['¿Tengo que pagar para probar?', 'Crear tu cuenta y preparar un borrador no consume saldo. Para activar el evento necesitás comprar un evento o un paquete.'], ['¿No llegó la verificación?', 'Revisá correo no deseado y que hayas escrito bien la dirección. En la pantalla de verificación podés pedir un nuevo enlace.']],
  capture: [['¿Cómo envío mi foto?', 'Tocá Elegí o tomá una foto, seleccioná una imagen y enviala. El mensaje es opcional. Esperá la confirmación antes de cerrar la página.'], ['¿No se pudo enviar?', 'Revisá tu conexión y reintentá desde esta misma pestaña: la foto sigue seleccionada si no llegó a confirmarse. Si el formato no se puede abrir, elegí una imagen JPEG, PNG o WebP.'], ['¿Cuándo aparece en la pantalla?', 'Si el evento tiene revisión manual, tu foto espera la aprobación del organizador. Si tiene publicación automática, aparece sin ese paso. Cuando la página confirme la recepción, no hace falta volver a enviarla.']],
};

export function nextStep(el, event) {
  const guidance = eventGuidance(event);
  return el('aside', { class: 'next-step', 'aria-label': 'Tu próximo paso' }, el('span', { class: 'guide-spark', 'aria-hidden': true }, '✦'), el('div', {}, el('p', { class: 'guide-kicker' }, 'Tu próximo paso'), el('h3', {}, guidance.title), el('p', {}, guidance.text)));
}

export function mountAssistant({ el, button, page, getContext }) {
  if (!topics[page]) return;
  let dialog;
  const launcher = button('¿Te guío?', open, 'guide-launcher');
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-controls', 'event-assistant');
  document.body.classList.add('has-event-guide');
  document.body.append(launcher);
  document.addEventListener('sylar:guide', open);
  document.dispatchEvent(new Event('sylar:guide-ready'));
  function open() {
    if (dialog?.open) return;
    const context = getContext();
    const events = context.events || (context.event ? [context.event] : []);
    const advice = el('div', { class: 'guide-advice' });
    const showAdvice = event => {
      let guidance = eventGuidance(event);
      if (page === 'design' && !['expired', 'album', 'review'].includes(guidance.stage)) {
        if (context.dirty) guidance = { title: 'Primero guardá tus cambios', text: 'La vista previa ya muestra tus cambios, pero todavía no están guardados. Usá Guardar diseño para conservarlos.', label: 'Ir a guardar', href: '#compartir' };
        else if (event?.status === 'draft' && !event.presentation) guidance = { title: 'Elegí el tema que te guste y guardalo', text: 'Podés usarlo tal como viene. Guardar no consume saldo. Después vas a revisar la activación.', label: 'Ir a guardar', href: '#compartir' };
        else if (event?.status !== 'draft') guidance = event?.presentation?.published
          ? { title: 'Tu invitación ya tiene enlace', text: 'Copialo y compartilo con tus invitados. Si cambiás el diseño, guardá los cambios para que se vean en ese mismo enlace.', label: 'Ver mi enlace', href: '#compartir' }
          : { title: 'Revisá y publicá tu invitación', text: 'El evento está activado. Publicar guarda el diseño y habilita el enlace que vas a compartir.', label: 'Ir a publicar', href: '#compartir' };
      }
      if (['purchases', 'payment'].includes(page)) guidance = { title: 'Prepará tu evento a tu ritmo', text: 'Podés crear el borrador mientras elegís tu compra. Antes de activarlo vas a revisar los plazos y el saldo que se usará.', label: 'Ir a mis eventos', href: '/cliente-panel.html' };
      advice.replaceChildren(el('p', { class: 'guide-kicker' }, 'Por dónde seguir'), el('h3', {}, guidance.title), el('p', {}, guidance.text));
      if (guidance.href) advice.append(el('a', { class: 'button', href: guidance.href, onClick: () => dialog.close() }, guidance.label));
    };
    const close = button('Cerrar ayuda', () => dialog.close(), 'secondary');
    dialog = el('dialog', { id: 'event-assistant', class: 'guide-dialog', 'aria-labelledby': 'guide-title', onClose: () => {
      dialog.remove();
      if (document.body.classList.contains('has-sylar')) document.dispatchEvent(new Event('sylar:guide-closed'));
      else launcher.focus();
    } },
      el('div', { class: 'guide-dialog-head' }, el('div', {}, el('p', { class: 'guide-kicker' }, 'Vamos paso a paso'), el('h2', { id: 'guide-title' }, 'Tu asistente del evento')), close),
      el('p', { class: 'muted' }, 'Elegí lo que necesitás. Te mostramos dónde ir y qué hacer.'));
    if (['panel', 'design', 'moderator', 'purchases', 'payment'].includes(page)) {
      if (events.length > 1) {
        const select = el('select', { 'aria-label': 'Evento para la ayuda', onChange: e => showAdvice(events.find(event => event.id === e.target.value)) }, ...events.map(event => el('option', { value: event.id }, event.name)));
        dialog.append(el('label', { class: 'field' }, '¿Con qué evento seguimos?', select));
      }
      showAdvice(events[0]); dialog.append(advice);
    }
    dialog.append(el('div', { class: 'guide-questions' }, ...topics[page].map(([question, answer]) => el('details', {}, el('summary', {}, question), el('p', {}, answer)))),
      el('div', { class: 'guide-contact' }, el('strong', {}, '¿Necesitás una mano?'), el('p', {}, 'Si esta guía no alcanza, escribinos y te ayudamos con tu caso.'), el('a', { href: 'https://wa.me/5493764104660', target: '_blank', rel: 'noopener noreferrer' }, 'Hablar con Sylar.soluciones ↗')));
    document.body.append(dialog); dialog.showModal();
  }
}
