export function albumDownload({ eventPath, el, button, request, save }) {
  const status = el('p', { role: 'status', class: 'muted' });
  const parts = el('div', { class: 'album-parts' });
  let timer, busy = false, state = 'none';
  const generate = button('Preparar álbum completo', async () => { render(await request(eventPath('/album'), { method: 'POST' })); });
  const box = el('section', { class: 'card album-box', 'aria-label': 'Descarga del álbum completo' }, el('h2', {}, 'Todos los recuerdos, a salvo'),
    el('p', { class: 'muted' }, 'Incluye fotos aprobadas, pendientes y rechazadas, en carpetas separadas. Se toman las fotos listas al iniciar la preparación. Los álbumes grandes se dividen en ZIP de hasta 50 fotos; descargá todas las partes.'), generate, status, parts);
  function render(job) {
    state = job.state; clearTimeout(timer);
    const processing = ['queued', 'processing'].includes(state);
    generate.hidden = processing || state === 'expired';
    generate.textContent = state === 'failed' ? 'Reintentar preparación' : state === 'ready' ? 'Actualizar álbum con las últimas fotos' : 'Preparar álbum completo';
    status.textContent = processing ? `Preparando ${job.done} de ${job.total} fotos. Podés cerrar esta página y volver más tarde.` : state === 'ready' ? `Álbum listo: ${job.total} fotos. Preparado el ${new Date(job.createdAt).toLocaleString('es-AR')}.` : state === 'failed' ? job.message : state === 'expired' ? 'El plazo de descarga terminó.' : 'Tu álbum se prepara en el servidor y queda disponible hasta que termine el plazo del evento.';
    parts.replaceChildren(...(job.parts || []).map(part => button(`Descargar parte ${part.index + 1} · ${part.count} fotos`, async () => {
      const result = await request(eventPath(`/album/${part.index}/download`), { method: 'POST' });
      if (result.local) save(await request(eventPath(`/album/${part.index}/file`), { blob: true }), result.name);
      else {
        const url = new URL(result.url);
        if (url.protocol !== 'https:' || !(url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('.storage.googleapis.com'))) throw new Error('Enlace de descarga inválido.');
        const link = el('a', { href: url.href, download: result.name, rel: 'noreferrer', target: '_blank' }); link.click();
      }
    }, 'secondary')));
    if (processing) timer = setTimeout(refresh, 5000);
  }
  async function refresh() {
    if (!box.isConnected || busy) return;
    if (document.hidden) { timer = setTimeout(refresh, 10000); return; }
    busy = true;
    try { render(await request(eventPath('/album'))); }
    catch (error) { status.textContent = error.message; if (!['401', '403', '410'].includes(String(error.status)) && ['queued', 'processing'].includes(state)) timer = setTimeout(refresh, 15000); }
    finally { busy = false; }
  }
  // The section is attached by the caller before the first read.
  queueMicrotask(refresh); window.addEventListener('pagehide', () => clearTimeout(timer), { once: true });
  return box;
}
