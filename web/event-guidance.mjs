// Presentation advice only. The server remains responsible for every permission.
export function eventGuidance(event, now = Date.now()) {
  if (!event) return { stage: 'create', title: 'Empezá con tres datos', text: 'Nombre, fecha y hora. Guardás un borrador privado y después elegís el tema. Todavía no usás saldo.', label: 'Preparar mi evento', href: '/cliente-panel.html#nuevo-evento' };
  const id = encodeURIComponent(event.id);
  const design = `/diseno.html?event=${id}`;
  const photos = `/moderador.html?event=${id}`;
  const past = value => Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
  if (event.status === 'draft') return event.presentation
    ? { stage: 'activate', title: 'Tu diseño está guardado', text: 'Revisá la fecha y los plazos antes de activar. La confirmación usa 1 evento de tu saldo; después podrás publicar la invitación.', label: 'Revisar mi evento', href: `/cliente-panel.html?setup=${id}#evento-${id}` }
    : { stage: 'design', title: 'Ahora elegí un tema', text: 'El modelo ya viene preparado. Podés usarlo como está o cambiar sus palabras. Guardar el diseño no consume saldo.', label: 'Elegir mi tema', href: `${design}&setup=1` };
  if (past(event.downloadUntil)) return { stage: 'expired', title: 'El plazo de este evento terminó', text: 'La recepción y las descargas ya finalizaron. Podés preparar un nuevo evento desde tu panel.', label: 'Ir a mis eventos', href: '/cliente-panel.html' };
  if (event.status === 'closed' || past(event.receivesUntil)) return { stage: 'album', title: 'Guardá los recuerdos', text: 'La recepción de fotos está cerrada. Prepará el álbum completo y descargá todas sus partes antes del plazo indicado en tu evento.', label: 'Ir a mi álbum', href: `${photos}#album` };
  if (event.status !== 'active' || !event.activatedAt) return { stage: 'review', title: 'Revisá el estado del evento', text: 'Volvé a Mis eventos para consultar su estado antes de compartir los enlaces.', label: 'Ir a mis eventos', href: '/cliente-panel.html' };
  if (Date.parse(event.startsAt) > now) return event.presentation?.published
    ? { stage: 'share', title: 'Tu invitación está lista para compartir', text: 'Copiá su enlace y pegalo en WhatsApp. Las fotos se recibirán a partir de la fecha y hora que elegiste.', label: 'Compartir mi invitación', href: `${design}#compartir` }
    : { stage: 'publish', title: 'Publicá tu invitación cuando esté lista', text: 'El evento está activado. Revisá la invitación y publicala para obtener el enlace que vas a compartir con tus invitados.', label: 'Revisar mi invitación', href: `${design}#compartir` };
  if (!(event.photoCount > 0)) return { stage: 'first-photo', title: 'Probá con una primera foto', text: 'Abrí el QR desde Mis eventos y escanealo con tu celular. Enviá una foto; después revisala y abrí la proyección.', label: 'Ver las opciones del evento', href: `/cliente-panel.html#evento-${id}` };
  return { stage: 'live', title: 'Ya están llegando los recuerdos', text: event.autoApprove ? 'Las nuevas fotos se publican automáticamente. Podés retirar una desde Aprobadas. Abrí la proyección en el equipo conectado a la pantalla.' : 'Revisá Pendientes y aprobá las fotos que quieras mostrar. Abrí la proyección en el equipo conectado a la pantalla.', label: 'Ver las fotos', href: photos };
}
