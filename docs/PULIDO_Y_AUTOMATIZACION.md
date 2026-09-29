# Momentos en Vivo · preparación del lanzamiento

Un proyecto de **Sylar.soluciones**. Contacto: sylar.soluciones@gmail.com, +54 9 376 410-4660.

**Estado actualizado:** versión publicada el 28/09/2026. Ver [registro de publicación y pruebas públicas](RELEASE_2026_09_28.md). Las comprobaciones locales descritas aquí no certifican por sí solas los servicios externos.

## Condiciones aprobadas el 28/09/2026

- Un evento: **ARS 65.000**.
- Tres eventos: **ARS 175.500**, 10% de descuento sobre ARS 195.000.
- Diez eventos: **consultar** por WhatsApp. El servidor rechaza compras directas de ese plan.
- Recepción: **48 horas** desde la fecha/hora elegida, en Argentina.
- Descarga: **30 días** desde el fin de recepción.
- Saldo de nuevas compras: **12 meses calendario desde su acreditación** para activar eventos. Se muestra la fecha exacta. Un año bisiesto se ajusta al último día válido del mes.
- Tope técnico existente: 3.000 fotos por evento; aparece antes de comprar/activar.

Las condiciones se congelan en cada compra. Cambiar el catálogo no altera compras previas. Las compras antiguas que no tenían vencimiento no se modifican retroactivamente. La configuración base está en `functions/offers.json` y `functions/event-terms.json`; cualquier ajuste de entorno debe mantenerse alineado con la oferta aprobada.

## Cambios implementados

- La portada con cámara animada ahora es el inicio publicado. Presenta QR, fotos y proyección explícitamente, una demo manual, preguntas frecuentes, precios del servidor, temas y soporte. Conserva movimiento reducido y póster estático. Los QR antiguos dirigidos al inicio mantienen parámetros y fragmento privado al redirigir.
- Datos → diseño → revisión y activación. La revisión usa las condiciones del saldo que se consumirá y rechaza cambios posteriores de fecha, diseño, moderación o lote. La activación repetida sigue siendo idempotente.
- En el recorrido nuevo, las imágenes propias, colores, tipografías, música y efectos quedan agrupados como personalización opcional. El tema ya trae valores utilizables.
- «Publicación automática» reemplaza la etiqueta «Evento seguro». Se conserva la aceptación del titular, la versión de consentimiento y los controles de acceso.
- Álbum completo privado con instantánea de fotos listas al solicitarlo. Incluye aprobadas, pendientes y rechazadas separadas, más mensajes en `recuerdos.json`. Se genera en el servidor en ZIP de hasta 50 fotos. Cada parte completada persiste; los reintentos no reinician las anteriores. Hasta seis solicitudes nuevas al día por evento y tres reintentos manuales después de agotar los automáticos.
- En producción, cada parte se descarga con una URL firmada de hasta un minuto, siempre dentro del plazo del evento. El organizador debe autenticarse para obtenerla. En emuladores se usa una descarga autenticada por la API. El permiso IAM de firma sobre la propia cuenta de servicio ya fue autorizado, aplicado y confirmado; falta el ensayo completo de descarga pública autenticada.
- Avisos persistentes de compra acreditada, activación, recordatorio y fin de descarga. Emuladores guardan vistas previas privadas, nunca envían correo. Hay reintentos y una pantalla administrativa de incidencias.
- Saldo vencido retirado una sola vez con registro contable. No puede consumirse al activar; los reintentos de pago no lo restauran.
- Limpieza por lotes recuperables, únicamente para eventos con la nueva política. Se requiere un aviso aceptado por el servidor de correo al menos 72 horas antes del límite; se programa cuatro días antes para absorber retrasos. Una vista previa local no cuenta como envío. Sin ese requisito se conserva el contenido y se registra una incidencia.
- Antes del borrado se cierran accesos y se espera al menos 15 minutos para que terminen operaciones en curso. Solo se eliminan los prefijos del evento en fotos/temas/álbumes, sus fotos y respuestas; se conserva el registro del evento y de facturación.

## Correo de Gmail: conexión confirmada y workers publicados

Remitente elegido: **sylar.soluciones@gmail.com**. El propietario confirmó que recibió la prueba. Los workers ya se publicaron con `MAIL_MODE=smtp`. Se verificó en los metadatos desplegados que solo `mailWorker` y `mailMaintenance` vinculan `SMTP_PASSWORD`; `api1` no recibe esa clave. Falta comprobar una entrega desde esos workers. El ejemplo de entorno conserva el valor seguro `disabled`.

El propietario guardó la contraseña de aplicación. Se verificó que `SMTP_PASSWORD`, versión 1, está habilitado en el proyecto **momentos-en-vivo** y Gmail aceptó autenticación por TLS en el puerto 465. La comprobación real con `node scripts/check-mail.cjs` no envía mensajes, no imprime ni guarda la clave y no cambia el entorno. Con autorización explícita, se ejecutó una sola vez `--send-test-to-owner`: Gmail aceptó un mensaje dirigido a **sylar.soluciones@gmail.com**, asunto **Momentos en Vivo · prueba de correo**. Identificador de entrega: `<fad9d43b-d1cf-9e9e-68aa-33d376dd19b1@gmail.com>`. El propietario confirmó su recepción. No se enviaron nuevos mensajes de prueba durante la publicación.

La cuenta necesita una contraseña de aplicación si usa este adaptador SMTP. El propietario confirmó que tiene activada la verificación en dos pasos. Ciertas cuentas no ofrecen esta opción. La crea el propietario desde su cuenta: [ayuda oficial de Google](https://support.google.com/accounts/answer/185833?hl=es). No usar la contraseña principal ni enviarla en el chat.

El alta ya fue realizada por el propietario mediante `node "D:\momentos en vivo\scripts\configure-mail.cjs"`. No repetirla salvo que se necesite reemplazar la clave. El ingreso queda oculto mediante el componente de contraseñas ya instalado con Firebase. Funciona sin modificar la política de ejecución de PowerShell que bloqueó el iniciador anterior `.ps1`. El valor llega a Firebase por una tubería de entrada, nunca como argumento, variable de entorno ni archivo. Guarda `SMTP_PASSWORD` en Secret Manager del proyecto **momentos-en-vivo**, usando la cuenta **sylar.soluciones@gmail.com**. `--non-interactive` impide el redespliegue y borrado automático de versiones anteriores. El programa rechaza entrada redirigida y valida los 16 caracteres de la clave de aplicación. La versión instalada de Firebase puede registrar cuerpos de solicitudes en diagnósticos: `scripts/secret-log-redaction.cjs`, precargado solo en este proceso, omite esos cuerpos y conserva estado y metadatos. Cuatro pruebas cubren validación, envío exclusivo por entrada estándar, detección de fallo y ocultación del valor y su base64 en diagnósticos. No agregar `--debug`, no mostrar versiones de secretos, no pegar el secreto en una orden ni guardarlo en archivos de entorno.

El despliegue concedió acceso al secreto a la cuenta de servicio y confirmó las vinculaciones. La prueba local de conexión no certifica la entrega desde producción; falta ensayar ese recorrido y sus incidencias. SMTP puede aceptar un mensaje y luego rebotarlo; no garantiza lectura. Si una función termina justo después de enviarlo, puede repetirse al reintentar; se mantiene un Message-ID estable, sin prometer entrega exactamente una vez.

## Publicación completada; apertura de ventas pendiente

Interfaz, ocho funciones, reglas e índices publicados en Firebase. La limpieza autorizada eliminó los 3 eventos antiguos, 60 documentos y 30 archivos de fotos durante mantenimiento; las cuentas y datos ajenos se conservaron. Los cobros reales y `RETENTION_CLEANUP` siguen desactivados. El sandbox solo permite compras al administrador verificado.

Antes de abrir ventas: completar la compra y notificación auténtica de Mercado Pago, revisar credenciales antiguas, probar una carga con App Check público, descargar el ZIP privado y confirmar alertas de presupuesto/errores. Las alertas de presupuesto no detienen por sí mismas el consumo.

La transición se realizó en la ventana sin eventos activos confirmada por el propietario. Se utilizó mantenimiento temporal porque Hosting, funciones, reglas e índices no cambian de forma atómica. La limpieza antigua ya completada es independiente de la política de retención automática y no debe repetirse con eventos nuevos.

## Validación y límites

Pasaron **50 pruebas locales**: 17 de utilidades de seguridad, cámara, música, proyección y ocultación de secretos en diagnósticos; 19 de compras, concurrencia, cotización del pack de diez, vencimiento del saldo y año bisiesto; 8 de automatización (álbum completo por partes, reintentos, permisos, correo, plazos y limpieza aislada); 6 de moderación y cargas en curso. Las pruebas nuevas de automatización usan un proyecto de emulador separado y limpian únicamente sus propios registros. Compilación y revisión de diferencias correctas. La auditoría de dependencias de producción de Functions informó cero vulnerabilidades conocidas; no sustituye una auditoría de la aplicación.

Navegador local: portada a 320 y 390 píxeles sin desborde horizontal, preguntas frecuentes y demo de revisión/proyección; alta de borrador, selección de tema, guardado y personalización opcional; compra simulada de un evento por ARS 65.000 con vencimiento de saldo a 12 meses; revisión de activación en celular, aceptación obligatoria y consumo de un crédito. El worker del emulador preparó el álbum de tres fotos y su descarga autenticada respondió HTTP 200; la herramienta del navegador no confirmó el archivo guardado. El ZIP completo sí fue abierto y comprobado en la prueba de API. Sigue pendiente comprobar el guardado en un teléfono físico. Evidencias: `output/portada-modelo/portada-celular.png`, `revision-activacion.png` y `album-listo.png`.

La inspección visual se hace con el navegador de la aplicación. Los scripts antiguos de portada en `tests/landing.cjs` corresponden a la interfaz anterior; `npm run test:landing` usa `tests/cover.cjs`. Los scripts de navegador actualizados requieren su ejecución independiente; no se sustituyen por afirmar que los tests de API cubren la UI.

No se ha hecho carga masiva, prueba en un teléfono físico ni auditoría externa. Falta probar servicios reales de correo, pago, firma de ZIP y disparadores programados desplegados. Una carga de foto terminada abruptamente puede dejar un registro `processing` que requiera asistencia. Los archivos ZIP derivados de versiones antiguas se eliminan con la limpieza del evento cuando tiene la política nueva; los eventos anteriores necesitan limpieza manual. Evaluar barrido anticipado si se regeneran con frecuencia.

Referencias de implementación: [Archiver](https://www.archiverjs.com/docs/quickstart/), [disparadores de Firestore](https://firebase.google.com/docs/functions/1st-gen/firestore-events-1st), [Nodemailer](https://nodemailer.com/usage/).
