# Catálogo, música propia y experiencias a medida

Momentos en Vivo · Un proyecto de Sylar.soluciones.

## Colección de modelos

`functions/themes.json` es el registro único de modelos publicados. El editor, la galería y las muestras animadas recorren ese registro: agregar un modelo completo lo incorpora a las tres superficies, sin editar listas de identificadores en cada pantalla. El servidor valida el mismo catálogo. Cada modelo necesita sus imágenes `public/assets/themes/ID.webp` y `ID-wide.webp`; la compilación comprueba que ambas existan.

Para próximos trabajos, agregar el nuevo modelo a ese registro y conservar los anteriores, según la preferencia del propietario. Incluir colores, tipografía, textos iniciales y `sample` con nombre y fecha ficticios, lugar y dirección de muestra opcionales. Los efectos particulares deben integrarse a la invitación y al video, respetando movimiento reducido. Probar móvil, selector, muestra, video y guardado antes de publicar.

Solo se comparte el diseño reutilizable. Las fotos, nombres reales, direcciones particulares y música subidos por clientes permanecen en sus eventos. Una carga personalizada no publica automáticamente archivos privados en el catálogo. Crear y agregar un nuevo modelo es trabajo de diseño; no hay generación automática por IA desde el formulario del cliente.

El quinto modelo, `hechizo` (Magia y hechizos), ilustra un cumpleaños de 15 inspirado en Harry Potter: carta de pergamino, sello de lacre, castillo, velas flotantes, andén 9¾ y acentos dorados. Muestra: `/invitacion.html?demo=hechizo`. La instrumental sintetizada es original; no incluye la banda sonora de las películas.

## Música del cliente

El editor acepta MP3, M4A, WAV, OGG o AAC hasta 15 MB, según los formatos que pueda decodificar el navegador. El cliente elige el segundo inicial. El navegador conserva hasta 60 segundos (mínimo 2), los convierte a WAV PCM mono de 32 kHz/16 bits y aplica un pequeño fundido en los extremos. Los archivos guardados no llevan metadatos del original. El video usa los primeros 16 segundos del fragmento; las pistas cortas se repiten.

El servidor vuelve a validar el contenedor canónico, formato, canales, frecuencia, tamaño y duración. Se autentica al titular antes de leer el cuerpo grande; admite como máximo 100 cargas por evento. Al reemplazar se comprueba `themeVersion` en una transacción y se elimina el archivo anterior; los conflictos no dejan archivos huérfanos. Quitar música se guarda con el diseño y borra el archivo privado.

`POST/GET /events/:eventId/theme-music` guarda/entrega el audio privado. Solo el titular/administrador o una invitación publicada, activa, vigente y con clave correcta pueden escucharlo. Las claves de fotos/proyección no permiten acceder a esta ruta. Se descarga bajo demanda al tocar reproducir, nunca automáticamente al abrir la invitación. Se reproduce mediante Web Audio sin micrófono ni permisos adicionales. La exportación mezcla esta misma pista en el MP4. Se mantiene la política CSP existente.

Guardar fragmento conserva el archivo; Guardar diseño confirma la selección de música. Si ya está seleccionada la música propia en una invitación publicada, reemplazar su archivo afecta las nuevas aperturas de ese enlace, como ocurre con las imágenes personalizadas.

## Oferta premium

La galería, el editor y Compras muestran «Experiencia a medida». El formulario prepara una consulta de WhatsApp para +54 9 376 410-4660 con la idea y, desde el editor, la referencia del evento. El cliente decide enviarla en WhatsApp. No se envían mensajes automáticamente, ni se guardan solicitudes o se cobran importes desde este formulario.

El presupuesto, alcance y entrega se acuerdan antes de comenzar. El precio del paquete premium y su cobro automático todavía están pendientes de definición; no se agregó un precio ficticio a un cobro real.

## Verificación

`tests/music.test.cjs`: límites y rechazo de WAV alterados y fuentes arbitrarias.
`tests/presentation.test.cjs`: permisos, publicación, reemplazo, conflictos y borrado del audio.
`tests/music-browser.cjs`: subir una pista de prueba, elegir el comienzo, guardar, reproducción del invitado bajo demanda, exportar y decodificar el AAC para comprobar que contiene la pista elegida, preparar consulta y quitar el archivo.
`tests/invitation-motion-browser.cjs`: recorre el catálogo completo (o `TEST_THEMES`), incluyendo Magia y hechizos, a 320, 390 y 768 px y verifica el MP4 descargado.

Estos cambios están en la vista previa local. Requieren despliegue de Hosting y Functions para llegar al sitio público.
