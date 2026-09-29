# Sylar · Asistente web 2D — prototipo 01

## Probarlo ahora

Abrí `demo.html` en un navegador de escritorio. El HTML es autónomo: tiene imágenes y código incorporados, no necesita instalación, servidor ni conexión. Usá los botones para cambiar el estado, mové el mouse para probar la mirada y pulsá «Probar el chat».

El archivo `Sylar_Asistente_Demo.html` entregado por separado es la misma demo.

## Qué contiene

- `demo.html`: laboratorio interactivo completo y autónomo.
- `sylar-assistant.js`: componente reutilizable, con imágenes incorporadas y sin dependencias externas.
- `integracion.html`: ejemplo mínimo para insertarlo en una página.
- `assets/`: cabeza, cuerpo y dos brazos en PNG transparente, recortados de la imagen aportada por el usuario.
- `PROMPT_PARA_CODEX.md`: instrucciones para integrar este prototipo en un proyecto existente.

## Alcance y límites

Es un personaje 2D articulado por capas. Se mueve con CSS y responde a eventos con JavaScript. No es un video, un GIF, un modelo 3D, un archivo de Blender ni un proyecto de Rive. No se puede girar libremente para verlo desde cualquier ángulo.

La imagen de origen contiene una vista frontal pequeña. Las piezas tienen un lienzo de 136 × 219 píxeles y conservan las limitaciones de ese recorte. Son adecuadas para probar movimiento y para un lanzador pequeño; antes de aumentar mucho el tamaño conviene preparar piezas de mayor resolución y corregir uniones y zonas ocultas. La capa de la cabeza se preparó sin los ojos originales; los ojos del prototipo están dibujados y animados en SVG.

El chat de la demo usa respuestas predefinidas. No consulta Ñandé ni ninguna otra web, no usa micrófono, no reproduce voz, no guarda mensajes y no realiza peticiones de red. No se modificó ni publicó ningún sitio.

## Inserción mínima

Copiá `sylar-assistant.js` junto a la página y añadí:

```html
<script src="./sylar-assistant.js" defer></script>
<sylar-assistant demo></sylar-assistant>
```

El atributo `demo` habilita únicamente respuestas de ejemplo. No debe presentarse al público como un asistente real.

Para mostrar solamente el personaje, sin chat flotante:

```html
<script src="./sylar-assistant.js" defer></script>
<sylar-mascot id="sylar" state="idle" style="width:180px"></sylar-mascot>
```

Esperá a la definición del componente antes de llamar a sus métodos:

```javascript
await customElements.whenDefined('sylar-mascot');
const mascot = document.getElementById('sylar');
mascot.setState('hello');
```

## Estados y controles

Los estados son `idle`, `hello`, `attentive`, `thinking`, `speaking`, `happy` y `sleeping`.

`speaking` es solamente una indicación visual de respuesta: no genera audio. `attentive` no activa un micrófono.

El atributo `paused` pausa los movimientos. Se respeta la preferencia del sistema de reducir movimiento y se pausan animaciones cuando el componente deja de ser visible o la pestaña está oculta. La pausa global del laboratorio es un control de la demo; en la web final conviene ofrecer un control equivalente y permitir ocultar el asistente.

## Conectar un asistente real

Quitá `demo` cuando haya una integración preparada. Esto NO conecta una IA automáticamente: sin un controlador, el chat queda esperando una respuesta.

El componente dispara:

- `sylar:message`: `event.detail.text` contiene el mensaje del visitante.
- `sylar:state`: `event.detail.state` contiene el estado visual.
- `sylar:toggle`: `event.detail.open` indica si el panel está abierto.

Métodos de `<sylar-assistant>`:

```javascript
assistant.open(true);             // Abrir el panel.
assistant.setState('thinking');    // Cambiar la animación.
assistant.reply('Respuesta real obtenida por tu aplicación.');
assistant.fail('No se pudo obtener la respuesta. Probá de nuevo.');
assistant.addMessage('Texto adicional.', 'assistant');
```

La lógica de tu aplicación debe escuchar `sylar:message`, obtener una respuesta por el mecanismo existente y llamar a `reply()` o `fail()`. Implementá límites de solicitudes, tiempo máximo de espera y gestión de errores. Mantené credenciales y claves de servicios exclusivamente en el servidor. Antes de enviar mensajes a servicios externos, definí las condiciones de privacidad correspondientes.

El componente usa Shadow DOM para aislar sus estilos, pero la integración todavía debe probarse con el sitio real: rutas, carga única del script, posición, teclado móvil, banners, menús y política de seguridad de contenido. No hace falta habilitar código inseguro globalmente para este prototipo.

## Comprobaciones realizadas

Pruebas automáticas en Chromium de escritorio: seis botones de estado, avance real de las animaciones, seguimiento del puntero, pausa, modo claro, apertura/cierre del chat, envío y respuesta simulada, regreso a reposo, Escape y tratamiento del texto del usuario sin ejecutarlo como HTML. No se observaron peticiones de red ni errores JavaScript durante esas pruebas.

También se verificaron anchos móviles simulados de 390 y 320 píxeles, sin desbordamiento horizontal, y la preferencia de movimiento reducido. Esto no reemplaza pruebas en teléfonos físicos ni en todos los navegadores.

## Referencias técnicas

CSS animations, MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Animations/Using

Movimiento reducido, MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
