# Temas e invitaciones

Momentos en Vivo — **Un proyecto de Sylar.soluciones**.

Implementación local del 28 de septiembre de 2026. No está desplegada en producción.

## Recorrido del cliente

1. Explorar Champagne, Aurora, Disco pop, Nocturno y Magia y hechizos en `/temas.html`.
2. Crear un evento y entrar en **Diseño e invitación** desde su tarjeta.
3. Elegir tema, textos, lugar, dirección, colores y una de las tres tipografías. El nombre, fecha y hora se cambian en Mis eventos y corresponden a Argentina.
4. Subir opcionalmente fondo, portada y logo propios. Se admiten JPEG, PNG y WebP estáticos, hasta 5 MB y 25 megapíxeles. Se conserva la transparencia del logo.
5. Guardar el diseño. El borrador es privado; publicar requiere un evento activado, abierto y dentro de su período.
6. Copiar el enlace para compartirlo, abrir la invitación o descargar una tarjeta PNG con QR. Los botones interactivos viven en la página, no en el PNG.
7. Consultar las confirmaciones y descargar su lista CSV. Cada respuesta admite hasta 10 personas. Se reciben respuestas hasta el inicio del evento, con un máximo de 2000 respuestas por evento. Desde el mismo navegador se puede modificar la respuesta sin sumarla de nuevo. Si se borran los datos del navegador o se usa otro dispositivo, será una respuesta diferente.

El fondo y los colores acompañan la invitación, la página para subir fotos y la proyección. El carrusel presenta hasta tres fotografías aprobadas; Nocturno usa una principal y dos secundarias, y Disco pop inclina los marcos. Cada nueva publicación se muestra grande durante seis segundos con las anteriores difuminadas antes de incorporarse al carrusel. Las animaciones son opcionales y respetan movimiento reducido.

La invitación web tiene apertura con sobre, efectos decorativos por tema y cuenta regresiva opcional. `opening` y `countdown` se guardan como booleanos y están activados por defecto; `musicEnabled` está desactivado por defecto. La música instrumental se sintetiza localmente con motivos originales por tema, se activa por un toque del invitado y se detiene al ocultar la pestaña. No pide micrófono ni descarga canciones externas. Con movimiento reducido o `motion: false`, la tarjeta se abre directamente y los efectos quedan desactivados. Las muestras públicas `/invitacion.html?demo=champagne` (también `aurora`, `disco-pop`, `nocturno`, `hechizo`) usan datos ficticios y no registran confirmaciones.

El editor permite preparar un MP4 vertical de 16 segundos, 720 × 1280, con tres escenas, fondos/portada/logo personalizados, texto, QR del enlace publicado y música opcional. El navegador lo genera con Canvas y MediaRecorder H.264/AAC; no se sube el video a Firebase. Se comprueba la capacidad de MP4 antes de habilitar la creación y se muestra una alternativa de navegador cuando no está disponible. La vista previa funciona sin exportar; descargar requiere un diseño guardado y una invitación publicada (las muestras se identifican como tales). Cancelar, cerrar u ocultar la pestaña interrumpe la creación y libera las pistas de audio/video. Los archivos descargados son copias: no cambian al editar el evento; su QR respeta la revocación normal del enlace.

`tests/invitation-motion-browser.cjs` recorre el catálogo de temas, apertura accesible, control de audio, anchos móviles, cancelación, exportación MP4 y decodificación real de duración/resolución y de tres fotogramas. `tests/themes-browser.cjs` incluye exportación con imágenes privadas y preferencias guardadas; `tests/presentation.test.cjs` valida esas opciones y sus permisos. La exportación se probó en Edge sobre HTTP de la red local; la disponibilidad del codificador depende del navegador y del dispositivo. Referencias de la API: [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) y [Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream).

Las imágenes subidas se guardan inmediatamente en ese evento. Los cambios de texto, paleta y las eliminaciones se aplican con Guardar. Antes de publicar se pueden revisar en la vista previa. Un fondo personalizado tiene prioridad sobre la ilustración del tema; Quitar fondo personalizado recupera el fondo predefinido.

## Permisos y archivos

- El servidor comprueba propietario o administrador para editar, subir imágenes o consultar asistentes. Firestore y Storage siguen cerrados al acceso directo del navegador.
- La invitación tiene una clave aleatoria propia en el fragmento del enlace. No expone correo del propietario, claves de proyección ni datos de otros invitados. Al comenzar el evento ofrece el enlace para enviar fotos. Por defecto requieren aprobación; con Publicación automática, el titular acepta expresamente la publicación automática bajo su exclusiva responsabilidad.
- Renovar enlaces cambia también el de invitación. Cerrar el evento, vencer la recepción o retirar su publicación impide abrir la invitación y sus imágenes con ese enlace.
- Las imágenes se decodifican y convierten a WebP en el servidor, retirando metadatos y limitando dimensiones. No se aceptan SVG, HTML, scripts, ZIP, CSS ni URLs externas como temas. Se pueden usar diseños propios exportados desde un editor a una imagen admitida.
- Cada evento dispone de tres espacios de imagen y hasta 200 cargas. Al reemplazar o quitar una imagen se intenta eliminar el archivo anterior. La limpieza periódica de archivos huérfanos y la retención automática de asistentes aún no están implementadas.
- Las revisiones de diseño evitan sobrescribir silenciosamente cambios de otra ventana. Los reintentos de RSVP son transaccionales e idempotentes por identificador; el CSV neutraliza fórmulas.
- Las confirmaciones públicas requieren App Check en producción, como la recepción de fotos. Se probó el funcionamiento local; faltan las pruebas de producción con la configuración real.

Los temas personalizados son ajustes e imágenes por evento. Esta versión no incluye un catálogo privado reutilizable entre eventos ni importación de paquetes de código de terceros.

## Recursos y comprobación

La configuración validada está en `functions/themes.json`; las rutas en `functions/presentation.js`; la interfaz en `web/themes.js` y `web/themes.css`. Los fondos se sirven desde `public/assets/themes/` y se generaron con la herramienta integrada `image_gen`. Los prompts y sus fuentes se conservan en `output/temas-invitaciones/fondos-prompts.json`. No se requiere generar imágenes para compilar o ejecutar el sitio.

Pruebas nuevas: `tests/presentation.test.cjs` y `tests/themes-browser.cjs`. Cubren borradores, propiedad, archivos falsos y metadatos, escrituras simultáneas, publicación, RSVP, revocación, ancho móvil, descarga PNG/CSV y retirada de fotografías del mosaico. `npm run test:e2e` incluye el recorrido de temas y el anterior de compras y fotos. Las capturas de revisión se guardan en `test-results/themes/`.

Contacto: sylar.soluciones@gmail.com · +54 9 376 410-4660.
