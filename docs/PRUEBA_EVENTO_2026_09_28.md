# Prueba de evento en el sitio publicado

Momentos en Vivo · Un proyecto de Sylar.soluciones.

Ensayo del 28 de septiembre de 2026 (Argentina), en el dominio público. Evento ficticio `rnb6cq5CPXF5VRjwTpLF`, «Prueba completa · Sylar.soluciones». Se utilizó una unidad sandbox; quedó una unidad de prueba disponible. No hubo cobros reales.

## Recorrido comprobado

- Activación con saldo de prueba: inicio 28/09 a las 22:30, recepción hasta 30/09 a las 22:30 y descargas hasta 30/10 a las 22:30, hora argentina.
- Diseño guardado con «Magia y hechizos», textos de prueba y publicación de la invitación. El enlace compartido abre el sobre animado, el tema y el acceso para sumar fotos. Al haber empezado el evento, no ofrece confirmación de asistencia: es el cierre esperado del plazo.
- Carga anónima por el formulario público, con App Check habilitado. Se envió una imagen del catálogo público con mensaje identificable de prueba.
- El propietario envió otra foto y confirmó expresamente que lo hizo desde su celular. Son dos envíos independientes, no un duplicado.
- Ambas fotos quedaron pendientes. La proyección estaba vacía antes de aprobar. La primera aprobación mostró la imagen de prueba; la segunda produjo el destacado «Un nuevo momento». Después quedaron las dos imágenes en la presentación normal.
- El álbum completo se preparó en el servidor. Se descargó realmente a la carpeta Descargas del equipo: 451.185 bytes, dos JPEG y `recuerdos.json`. Se verificaron CRC del ZIP, decodificación completa de ambas imágenes y correspondencia con el manifiesto. Resoluciones: 1600×1200 y 1672×940; sin metadatos EXIF.
- El ZIP contiene una foto en `aprobadas` y otra en `pendientes`, porque se preparó antes de aprobar la segunda. Esto corresponde al estado al iniciar la preparación, como advierte la interfaz. Actualizar el álbum genera una nueva captura del estado.

## Ajustes durante el ensayo

- Las 13 páginas generadas de la aplicación incorporan una versión derivada del contenido en sus referencias a JavaScript y CSS, para evitar reutilizar archivos anteriores después de una publicación. Se comprobó la coincidencia de las referencias con los archivos generados y su presencia en la página publicada.
- Se reduce el tamaño del título de la invitación para nombres largos y se equilibran sus líneas, conservando el tamaño de los nombres cortos y los temas existentes. Verificado visualmente en el sitio publicado con ancho de celular (390 px, 375 px útiles): título completo y sin desbordamiento horizontal. Es una revisión de tamaño de pantalla, no un segundo ensayo en teléfono físico.
- Se ensayó descargar el ZIP sin abrir una pestaña adicional. El navegador integrado no produjo un archivo en esa variante; se revirtió al enlace original, cuya descarga sí fue comprobada nuevamente después de publicar la versión final (23:00, 451.185 bytes). No se considera resuelto el detalle de la pestaña transitoria.

## Alcance y pendientes

- No se cambió la publicación automática: el evento conserva revisión manual. Esta sesión no certifica un ensayo nuevo de ese modo en el sitio público.
- La carga desde teléfono real está comprobada; la descarga del ZIP se verificó en computadora. No se ensayó una descarga móvil ni una nueva respuesta RSVP antes del inicio en esta sesión.
- La compra de prueba se recuperó automáticamente por la tarea programada. La entrega inmediata y validación de los avisos auténticos de Mercado Pago sigue pendiente; ver `DIAGNOSTICO_WEBHOOK_MP_2026_09_28.md`.
- Ventas reales y limpieza automática continúan desactivadas. No se añadieron fotos privadas del propietario al catálogo ni a este informe.

Captura de la invitación: `output/releases/invitacion-evento-prueba.png`. Los enlaces privados del evento no se incluyen en este documento.
