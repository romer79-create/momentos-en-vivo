export function setupSteps(el, active = 1) {
  return el('ol', { class: 'setup-steps', 'aria-label': 'Preparación del evento' }, ...['Datos', 'Diseño e invitación', 'Revisar y activar'].map((text, i) => el('li', { 'aria-current': active === i + 1 ? 'step' : null, class: i + 1 < active ? 'complete' : '' }, el('b', {}, i + 1 < active ? '✓' : i + 1), el('span', {}, text))));
}

export async function reviewActivation({ event, el, button, request, notice, dateTime, onActivated }) {
  const path = `/events/${encodeURIComponent(event.id)}`;
  const quote = await request(`${path}/activation-preview`);
  const accepted = el('input', { type: 'checkbox' });
  const feedback = el('p', { role: 'alert', class: 'status' });
  const dates = el('dl', { class: 'event-dates' });
  for (const [label, value] of [['Comienza', quote.startsAt], ['Recibe fotos hasta', quote.receivesUntil], ['Descargas hasta', quote.downloadUntil]]) dates.append(el('div', {}, el('dt', {}, label), el('dd', {}, dateTime(value))));
  let saving = false;
  const cancel = button('Volver a preparar', () => dialog.close(), 'secondary');
  const activate = button('Confirmar y usar 1 evento', async () => {
    if (!accepted.checked || saving) return;
    saving = true; cancel.disabled = true; accepted.disabled = true; feedback.textContent = '';
    try {
      await request(`${path}/activate`, { method: 'POST', data: { reviewToken: quote.reviewToken } });
      dialog.close(); await onActivated(); notice('¡Evento activado! Publicá tu invitación y compartí el QR.');
    } catch (error) {
      feedback.textContent = error.message;
      // A stale review must be reopened; it must never silently accept new terms.
      if (error.status === 409) { activate.hidden = true; cancel.textContent = 'Cerrar y revisar de nuevo'; }
    } finally { saving = false; cancel.disabled = false; accepted.disabled = false; }
  });
  activate.disabled = true;
  accepted.addEventListener('change', () => { activate.disabled = !accepted.checked; });
  const dialog = el('dialog', { class: 'activation-dialog', 'aria-labelledby': 'activation-title', onClose: () => dialog.remove(), onCancel: e => { if (saving) e.preventDefault(); } },
    setupSteps(el, 3), el('h2', { id: 'activation-title' }, 'Revisá tu evento'), el('h3', {}, quote.name), dates,
    el('p', {}, `Hasta ${quote.limits.photoLimit.toLocaleString('es-AR')} fotos. Horarios de Argentina.`),
    quote.limits.retentionPolicy ? el('p', { class: 'privacy' }, 'Al vencer el plazo de descarga, las fotos, imágenes, música y respuestas de invitados se eliminarán automáticamente, con aviso previo por correo. Guardá tus recuerdos antes de esa fecha.') : null,
    el('p', { class: 'privacy' }, quote.autoApprove ? 'Publicación automática: las nuevas fotos aparecerán sin revisión previa, bajo tu responsabilidad.' : 'Revisión manual: las fotos aparecerán después de tu aprobación.'),
    el('p', { class: 'muted' }, `Se usará 1 evento de tu saldo. Te quedarán ${quote.creditsAfter}. La activación no publica la invitación: podrás revisarla y publicarla desde Diseño e invitación.`),
    el('label', { class: 'responsibility-check' }, accepted, el('span', {}, 'Revisé la fecha, el horario y los plazos de mi evento.')), feedback,
    el('div', { class: 'actions' }, cancel, activate));
  document.body.append(dialog); dialog.showModal();
}
