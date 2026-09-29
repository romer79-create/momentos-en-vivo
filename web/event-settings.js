import policy from '../functions/moderation-policy.json';

export function moderationSettings({ event, el, button, request, notice, onChange = async () => {} }) {
  const section = el('section', { class: 'moderation-settings', 'aria-label': 'Publicación de fotos' });
  const path = `/events/${encodeURIComponent(event.id)}`;
  async function change(enabled) {
    await request(path, { method: 'PATCH', data: { autoApprove: enabled, ...(enabled ? { responsibilityAccepted: true, responsibilityVersion: policy.version } : {}) } });
    event.autoApprove = enabled; render();
    notice(enabled ? 'Publicación automática activada. Las nuevas fotos se publicarán automáticamente.' : 'Revisión manual activada. Las nuevas fotos necesitarán tu aprobación.');
    await onChange(enabled);
  }
  function confirmAutomatic() {
    const accept = el('input', { type: 'checkbox' });
    const error = el('p', { class: 'status', role: 'alert' });
    const activate = button('Activar publicación automática', async () => {
      if (!accept.checked) return;
      accept.disabled = true; cancel.disabled = true; dialog.dataset.saving = 'true'; error.textContent = '';
      try { await change(true); dialog.close(); }
      catch (err) { error.textContent = err.message; }
      finally { accept.disabled = false; cancel.disabled = false; delete dialog.dataset.saving; }
    });
    activate.disabled = true;
    accept.addEventListener('change', () => { activate.disabled = !accept.checked; });
    const cancel = button('Cancelar', () => dialog.close(), 'secondary');
    const dialog = el('dialog', { class: 'safe-mode-dialog', 'aria-labelledby': 'safe-mode-title', onClose: () => dialog.remove(), onCancel: e => { if (dialog.dataset.saving) e.preventDefault(); } },
      el('p', { class: 'eyebrow' }, 'Una decisión para tu evento'),
      el('h2', { id: 'safe-mode-title' }, 'Activar publicación automática'),
      el('p', { class: 'muted' }, 'Pensado para reuniones privadas con personas de confianza. Las nuevas fotos y sus mensajes podrán verse en la pantalla sin pasar por tu aprobación.'),
      el('p', { class: 'privacy' }, 'Esta opción no verifica si el contenido es adecuado. Las fotos que ya están pendientes seguirán esperando tu revisión. Podés rechazar fotos o volver a la revisión manual cuando quieras.'),
      el('label', { class: 'responsibility-check' }, accept, el('span', {}, policy.responsibility)), error,
      el('div', { class: 'actions' }, cancel, activate));
    document.body.append(dialog); dialog.showModal();
  }
  function render() {
    const automatic = event.autoApprove === true;
    section.dataset.automatic = String(automatic);
    section.replaceChildren(el('div', {}, el('p', { class: 'eyebrow' }, 'Publicación de fotos'), el('h3', {}, 'Publicación automática'),
      el('span', { class: 'pill' }, automatic ? 'Activada · sin revisión previa' : 'Desactivada · revisión manual'),
      el('p', { class: 'muted' }, automatic ? 'Las nuevas fotos y sus mensajes se publican sin revisión previa, bajo tu exclusiva responsabilidad. Podés retirar contenido desde Aprobadas.' : 'Cada foto necesita tu aprobación. Para una reunión con invitados de confianza, podés elegir que las nuevas fotos se publiquen automáticamente.')),
      button(automatic ? 'Volver a revisión manual' : 'Configurar publicación automática', automatic ? () => change(false) : confirmAutomatic, 'secondary'));
  }
  render(); return section;
}
