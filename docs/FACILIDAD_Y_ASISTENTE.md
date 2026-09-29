# Facilidad de uso y asistente

Momentos en Vivo · Un proyecto de Sylar.soluciones.

La facilidad es el diferencial principal solicitado por el propietario: el cliente debe poder preparar y manejar el evento por su cuenta, con orientación en cada etapa y soporte humano para casos puntuales.

## Primera implementación

- Portada centrada en «Tu evento. Tus recuerdos. Así de simple», con tres etapas explicadas sin promesas de tiempo no verificadas.
- Borrador con nombre, fecha y hora. Cada evento destaca el próximo paso según su estado real: diseño, revisión de activación, invitación, primera foto, moderación o álbum.
- «¿Te guío?» abre una guía contextual con un destino concreto y preguntas frecuentes de la pantalla actual. En un panel con varios eventos, permite seleccionar uno.
- Disponible en acceso, registro, panel, diseño, compras, estado del pago, moderación y carga de invitados. No tapa las invitaciones ni la proyección.
- Personalización avanzada y opciones de publicación plegadas por defecto. En celular se muestran primero los controles del diseño, con un enlace explícito a la vista previa.
- En moderación, primero se muestran instrucciones y fotos; el álbum y las opciones quedan después.

El asistente es una guía de la aplicación, no un chat generativo. No envía conversaciones ni datos a servicios de IA, no compra, no activa eventos, no publica invitaciones ni cambia permisos por su cuenta. Sus botones llevan a los controles existentes. Todas las validaciones y confirmaciones siguen en el servidor y los formularios correspondientes.

## Verificación

Cinco pruebas de orientación cubren borradores, guardado frente a publicación, eventos programados, recepción activa, modo manual y automático, cierre, vencimiento y estados desconocidos. Ejecutar `npm run test:guidance`.

En el sitio publicado se verificaron el asistente del panel, la apertura de respuestas, la navegación a las fotos y el diseño con opciones plegadas. El atajo «Ver mi enlace» cerró la ayuda y abrió la sección para compartir. En el acceso se comprobó el diálogo a 390 px, sin desbordamiento horizontal, y el cierre con Escape devolvió el foco al botón de ayuda. La revisión de ancho es una simulación de pantalla, no un nuevo ensayo en un teléfono físico. El ensayo no implicó nuevos cobros ni modificaciones a los datos de los eventos existentes.

La comprobación pública posterior a la publicación confirmó precios vigentes, ventas deshabilitadas, rechazo del acceso anónimo a recursos privados y rechazo de avisos con firma falsa. Capturas locales: `output/releases/portada-facilidad.png`, `output/releases/asistente-del-evento.png` y `output/releases/asistente-movil.png`.

## Criterio para próximas mejoras

Medir dónde se traban usuarios reales antes de agregar opciones. Priorizar un siguiente paso visible, textos cortos, valores iniciales útiles y ayudas junto a cada decisión. Un chat con IA podría agregarse más adelante para consultas abiertas, con alcance y datos definidos; esta versión no lo necesita para guiar el recorrido habitual.

## Sylar en la web

La mascota aprobada reúne el chat de respuestas preparadas y la guía contextual. En el chat, «Guiarme en esta pantalla» abre el mismo recorrido de orientación. El botón «¿Te guío?» queda como alternativa si el componente no llega a cargar. La portada, el acceso, el catálogo y las páginas de ayuda comparten el componente; invitaciones y proyección mantienen su presentación propia.
