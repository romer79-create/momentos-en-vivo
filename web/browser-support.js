// getRandomValues is available on a LAN HTTP origin; randomUUID is restricted
// to secure contexts. Both paths retain cryptographic randomness and UUID v4.
export function randomId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* A manual copy remains available. */ }
  }
  const dialog = document.createElement('dialog'); const title = document.createElement('h2'); title.textContent = 'Copiá este enlace';
  const hint = document.createElement('p'); hint.textContent = 'Mantené presionado el enlace seleccionado y elegí Copiar.';
  const input = document.createElement('textarea'); input.value = text; input.readOnly = true; input.setAttribute('aria-label', 'Enlace para copiar');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Listo'; close.addEventListener('click', () => dialog.close());
  dialog.append(title, hint, input, close); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); input.focus(); input.select();
  return false;
}
export function localEmulator(config, hostname) {
  return config.emulator === true && (/^(localhost|127\.0\.0\.1)$/.test(hostname) || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname));
}
