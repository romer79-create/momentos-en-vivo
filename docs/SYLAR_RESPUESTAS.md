# Sylar: mascota y ayuda de Momentos en Vivo

Un proyecto de Sylar.soluciones. Decisión del propietario: Sylar es la mascota oficial de sus páginas, con atuendos adaptables y la misma identidad. El paquete original y sus nueve archivos permanecen intactos en `local-preview/sylar-package-20260929/Sylar_Asistente_Web/`.

## Estado actual

El propietario autorizó publicar la integración el 29/09/2026. La versión de la web usa `web/sylar/`; la muestra aislada sigue disponible en http://127.0.0.1:5052/. No se conectó IA. El componente original aporta el personaje, sus animaciones, el chat y su accesibilidad. El adaptador aporta respuestas preparadas de Momentos en Vivo y sustituye las respuestas genéricas de la demo del paquete sin editar el original.

`web/sylar/momentos-knowledge.mjs` contiene preguntas, respuestas, categorías y reglas de reconocimiento. No pretende comprender cualquier redacción: cuando hay varias coincidencias equivalentes pide elegir; si no encuentra una respuesta ofrece temas y contacto humano. Los botones del catálogo siempre permiten llegar a cada respuesta, aunque la redacción libre no se reconozca.

`momentos-help.js` conecta los mensajes del componente mediante `sylar:message`, `reply()` y `fail()`. El atributo `demo` se retira para impedir una segunda respuesta genérica del paquete. Los textos del usuario y del catálogo se insertan como texto, no como HTML.

## Alcance

- Cuenta, verificación, contraseña y borradores.
- Precios, compras, pagos pendientes, saldo y consultas de reintegros.
- Activación, fecha, cierre y enlaces.
- Invitados, QR, carga, límites y problemas con las fotos.
- Moderación, publicación automática y proyección.
- Temas, invitaciones, música, video y confirmación de asistencia.
- Álbum, plazos, conservación y privacidad.

No consulta cuentas, fotos, pagos, saldo ni información personal. No activa eventos, publica invitaciones, procesa pagos ni concede reintegros. Para precios y plazos usa los archivos aprobados `functions/offers.json` y `functions/event-terms.json` al compilar. La respuesta recuerda comprobar las condiciones de cada compra. No afirma que las ventas estén habilitadas.

La información se contrastó con el código actual del servidor y las pantallas; algunos documentos históricos del proyecto describen etapas anteriores y no se usan como autoridad para prometer funciones.

## Contacto

Cuando corresponde, muestra los enlaces fijos de WhatsApp y correo:

- https://wa.me/5493764104660
- mailto:sylar.soluciones@gmail.com

El visitante decide abrir el canal y enviar el mensaje. No se adjunta ni transmite automáticamente el contenido del chat. No hay analítica, almacenamiento persistente ni peticiones a servicios de IA. El historial permanece en esta pestaña hasta recargar.

## Presencia y recordatorio discreto

Sylar permanece visible por defecto en la prueba. `local-preview/sylar3d/sylar-presence.mjs` muestra «Si necesitás algo, acá estoy.» tras 45 segundos sin interacción. La burbuja dura 7 segundos; las siguientes esperan 3 minutos sin interacción. Tocar la burbuja abre la misma ayuda del personaje. No abre el chat por su cuenta, no reproduce sonidos ni mueve el foco.

La espera se suspende mientras el chat o un diálogo están abiertos, al escribir en un campo, al pausar u ocultar el personaje y cuando la pestaña no está visible. Las interacciones reinician la espera. Antes de mostrar el aviso se comprueba que no tape controles; se intenta a un lado y después arriba del personaje, o se pospone. Con foco de teclado en la burbuja se mantiene hasta salir de ella, para no quitar el control mientras se usa. Se respeta movimiento reducido y se cancelan los temporizadores al abandonar la página.

`node --test tests/sylar-presence.test.mjs` verifica los tiempos con un reloj simulado, reinicio por actividad, suspensión, comprobación al vencer la espera, falta de espacio, foco y limpieza (7 pruebas).

Se observó la aparición automática en la página local después de la espera real, con el chat cerrado y sin cambio de foco. Captura: `output/releases/sylar-presencia.png`. La repetición a tres minutos se comprobó con el reloj simulado; no se presenta como una espera cronometrada en el navegador.

## Ampliar respuestas

Para ampliar la ayuda, agregar una entrada al catálogo con una pregunta clara, respuesta comprobada, grupo y variantes habituales. Añadir un caso de prueba para dudas que se confundieron o no se reconocieron. No agregar promesas comerciales o funciones sin verificar su implementación. Reiniciar el servidor local después de cambiar el catálogo para recompilar el archivo servido.

Ejecutar desde la raíz del proyecto:

```powershell
node --test tests/sylar-knowledge.test.mjs tests/event-guidance.test.cjs
node scripts/preview-sylar3d.cjs
```

Las 51 comprobaciones cubren preguntas y variantes, acceso por menú, precios/plazos, ambigüedad, desconocimiento y contacto. En el navegador se verificaron sugerencias, consulta escrita, respuesta de precios, ayuda para fotos y música, derivación con enlaces correctos y ancho de 320 píxeles con altura reducida. La revisión móvil es una simulación de tamaño, no una prueba física de teléfono. La preferencia de movimiento reducido del paquete se conserva; no se simuló un cambio de esa preferencia en esta entrega.
