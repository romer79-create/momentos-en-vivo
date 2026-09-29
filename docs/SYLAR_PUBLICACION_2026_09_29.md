# Sylar en Momentos en Vivo · 29/09/2026

Un proyecto de Sylar.soluciones. Publicación autorizada expresamente por el propietario.

## Alcance

- Personaje y animaciones originales, conservados byte a byte en `web/sylar/vendor/sylar-assistant.js`.
- Catálogo compartido de 37 respuestas preparadas, con precios y plazos tomados de la configuración del proyecto. Sin IA, consultas a cuentas, almacenamiento de conversaciones ni transmisión de mensajes.
- Preguntas desconocidas: temas alternativos y contacto voluntario por WhatsApp o correo.
- Presencia permanente y recordatorio discreto después de 45 segundos de inactividad, durante 7 segundos; posteriores avisos tras 3 minutos sin actividad. Se suspende al escribir, abrir la ayuda, pausar o dejar la pestaña.
- Chat con guía de la pantalla, pausa de movimiento, adaptación al teclado móvil y devolución del foco al personaje al cerrar.
- Integración en 15 páginas. Invitación y proyección conservan su presentación sin asistente.
- Compilación en `scripts/build.cjs`; lógica compartida en `web/sylar/`. La prueba aislada sigue usando estas fuentes.

## Comprobaciones antes de publicar

- 58 pruebas de conocimiento, presencia y guía: aprobadas.
- Suite de utilidades de seguridad, pagos, proyección y preparación: aprobada con Node 22.
- Construcción correcta; inclusión única del componente y exclusión de las dos pantallas del evento verificadas.
- Navegador local: abrir/cerrar, precios, pregunta desconocida, enlaces de soporte, guía contextual, ausencia de desbordamiento a 390 × 844 y apertura del chat al pulsar el recordatorio tras una espera real.
- La repetición de tres minutos se verifica con reloj simulado; el ancho móvil es una simulación, no un nuevo ensayo en un teléfono físico.
- La vista estática local no tiene API ni acceso a eventos; el acceso autenticado se comprueba en la web publicada.
- Escaneo acotado de patrones de credenciales sin mostrar valores. Imágenes originales incrustadas comprobadas; archivos de entorno, copias y entregables temporales excluidos del envío a Git.

## Publicación

Solo Firebase Hosting, proyecto `momentos-en-vivo`, cuenta `sylar.soluciones@gmail.com`. No se modifican funciones, reglas, eventos, fotos, secretos ni el estado de ventas. Referencia anterior de Hosting: `bf676322b85cc2f6`.

Estado: preparado y comprobado localmente; completar el registro al verificar la publicación.
