# Sylar · Página de prueba local

Momentos en Vivo — Un proyecto de Sylar.soluciones.

Desde la raíz del proyecto, ejecutar `node scripts/preview-sylar3d.cjs` y abrir http://127.0.0.1:5052/. El servidor solo escucha en esta computadora. Sylar aparece abajo a la derecha; al tocarlo abre la ayuda y al cerrarla queda visible.

## Personaje y respuestas

Se reutiliza el componente 2D del ZIP del propietario desde `web/sylar/vendor/sylar-assistant.js`, idéntico al original extraído en `local-preview/sylar-package-20260929/Sylar_Asistente_Web/`, sin modificar sus imágenes ni animaciones. La página no carga Three.js ni el personaje anterior. La prueba anterior está guardada por separado en `local-preview/sylar3d-before-package-20260929/`.

La ayuda actual usa respuestas predefinidas específicas de Momentos en Vivo, reemplazando las respuestas genéricas de ejemplo mediante un adaptador. No hay IA, voz ni consultas a cuentas. Las preguntas no reconocidas ofrecen contacto por WhatsApp o correo, sin enviar nada automáticamente. La interfaz conserva la portada, colores, tarjetas, guía original, controles de tamaño, pausa y ocultación.

Sylar permanece visible por defecto. Tras 45 segundos sin interacción puede mostrar «Si necesitás algo, acá estoy.» durante 7 segundos; después espera 3 minutos sin interacción entre avisos. La burbuja no abre el chat automáticamente. Se suspende al escribir, abrir la ayuda, ocultar/pausar al personaje o dejar la pestaña, y se pospone si taparía controles.

## Archivos

- `index.html`, `preview.css`, `preview.js`: página local y controles.
- `web/sylar/sylar-integration.css`: ajustes de tamaño del componente y acciones de ayuda compartidos con la web.
- `momentos-knowledge.mjs`: catálogo de preguntas, respuestas y reconocimiento.
- `momentos-help.js`: conexión con el chat original.
- `sylar-presence.mjs`: temporizador y burbuja de presencia; `tests/sylar-presence.test.mjs` contiene 7 comprobaciones de su comportamiento.
- `momentos-help.bundle.js`: archivo generado por el servidor, no editar a mano.
- `scripts/preview-sylar3d.cjs`: servidor exclusivo de prueba, con rutas estáticas permitidas.

Las fuentes de precios y plazos son `functions/offers.json` y `functions/event-terms.json`. Reiniciar el servidor al cambiar el catálogo para recompilarlo. Ningún archivo de esta prueba se incorpora a Firebase Hosting automáticamente.

## Comprobaciones

`node --test tests/sylar-knowledge.test.mjs tests/event-guidance.test.cjs`: 51 pruebas aprobadas. Ver `docs/SYLAR_RESPUESTAS.md` para alcance, fuentes, mantenimiento y verificación de navegador. No se realizaron cobros, publicaciones ni cambios a eventos reales. Los mensajes se mantienen solo en memoria y se borran al recargar.
