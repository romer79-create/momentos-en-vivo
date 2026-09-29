# Revisión y publicación — 28 de septiembre de 2026

## Estado

**Publicación completada:** [registro de la intervención](RELEASE_2026_09_28.md) confirma la interfaz, las ocho funciones, las reglas y los 13 índices publicados, la limpieza autorizada de eventos antiguos y las comprobaciones posteriores. [Pulido y automatización](PULIDO_Y_AUTOMATIZACION.md) describe la implementación. Las validaciones de navegador listadas abajo son antecedentes locales, no pruebas completas en producción.

**Actualización de alcance:** la versión 3 incorpora el [recorrido de compra y activación automática](AUTOSERVICIO.md) para Argentina y ARS, con precios y plazos aprobados. Mercado Pago está configurado en sandbox únicamente para el administrador verificado; faltan la compra completa y sus notificaciones auténticas. Las compras públicas y los cobros reales siguen desactivados. Ver [PAGOS.md](PAGOS.md).

Cambios en `mejora/seguridad-eventos`, publicados el 28/09/2026. Los eventos antiguos se eliminaron durante la ventana de mantenimiento autorizada. La cuenta propietaria de Firebase está conectada y App Check tiene reCAPTCHA Enterprise registrado para la aplicación web correcta; el desafío real desde un teléfono sigue pendiente.

Destino exclusivo: proyecto Firebase `momentos-en-vivo`, aplicación web `1:403164580472:web:9451616b5c586e4d587b8d`, bucket `momentos-en-vivo.firebasestorage.app`, sitio https://momentos-en-vivo.web.app. Cuenta de Google confirmada: `sylar.soluciones@gmail.com`.

## Mejoras preparadas

| Problema anterior | Comportamiento nuevo |
| --- | --- |
| Sesiones y roles simulados en el navegador | Firebase Auth, correo verificado, comprobación de revocación y autorización en cada operación |
| Clave compartida y acceso cruzado a fotos | Propietario por evento; enlaces independientes de invitación y proyección; rechazo de IDs ajenos |
| Eventos guardados en un navegador | Eventos en Firestore asociados al UID del cliente |
| Enlaces permanentes de descarga | Imágenes privadas servidas por la API; reglas que bloquean accesos directos |
| Fotos pesadas y metadatos personales | Compresión en el navegador y reencodificación sin EXIF |
| Cargas duplicadas al reintentar | Identificador estable para la foto y prevención de duplicados |
| Listas y descargas sin límites | Paginación, carga diferida de imágenes y ZIP por página |
| Demostraciones y documentación desalineadas | Cuentas ficticias solo en emuladores; guía y páginas antiguas actualizadas |

Suspender un cliente revoca sesiones, cierra sus eventos y renueva sus enlaces. El propietario inicial se reconoce por un correo configurado en el servidor y verificado por Firebase; el navegador no asigna permisos administrativos.

## Validación

- 6 pruebas de utilidades de seguridad.
- 17 pruebas de compras con Firestore local: precio del servidor, notificaciones duplicadas/desordenadas, firma, importe/moneda/vendedor/modo, activación concurrente, conservación de condiciones, reintegros, aislamiento entre clientes/ambientes, conciliación y límites. El proveedor se sustituye por respuestas controladas; estas pruebas no certifican Mercado Pago real.
- 17 pruebas de integración con Auth, Firestore y Storage locales: aislamiento entre clientes, rechazo de sesiones falsas, permisos por enlace, moderación, cuotas, paginación, acceso directo bloqueado, limpieza acotada y propietario verificado. La última también comprueba habilitación/suspensión de clientes y protección del propietario frente a una suspensión accidental.
- 10 comprobaciones del recorrido de navegador aprobadas: compra local pendiente/aprobada, reprogramación sin segundo consumo, borrador/activación/QR, carga móvil con pérdida de conexión y reintento, moderación/proyección y texto malicioso, ZIP, rechazo de foto proyectada, aislamiento del segundo cliente, cierre y ausencia de errores JavaScript. También se verifican las cabeceras CSP recibidas; la configuración local corrige la incompatibilidad de rutas de Superstatic 10 en Windows.
- La portada pasó 13 comprobaciones de escritorio/móvil, teclado, movimiento reducido, pausa, catálogo desactivado/incorrecto, imágenes fallidas y redirección de enlaces.
- Capturas revisadas en escritorio de 1.440 px y móvil de 390 px.
- Auditorías de dependencias raíz y Functions sin vulnerabilidades reportadas al cerrar la revisión. Esto no certifica la ausencia de vulnerabilidades.

Se usaron fotografías generadas y cuentas ficticias. No se descargaron fotografías de clientes para estas pruebas.

## Procedimiento de referencia para publicaciones

La primera publicación y su limpieza ya se completaron. Los pasos siguientes describen el procedimiento de transición original; no repetir el borrado ahora que pueden existir cuentas y eventos nuevos. No aplicar estos pasos sobre otros proyectos.

1. Usar Node.js 22, instalar ambos lockfiles con `npm ci` y `npm --prefix functions ci`, generar con `npm run build` y ejecutar las pruebas del README.
2. Comprobar Email/Password en Firebase Auth, los dominios autorizados y el registro de App Check con reCAPTCHA Enterprise.
3. Completar el archivo ignorado `functions/.env.momentos-en-vivo` con `APP_CHECK_SITE_KEY` y `OWNER_EMAIL=sylar.soluciones@gmail.com`. La clave de sitio es pública; no usar una clave secreta ni contraseña.
4. La clave reCAPTCHA existente permite `momentos-en-vivo.web.app` y `localhost`. Usar el dominio canónico; antes de usar `firebaseapp.com` u otro dominio, añadirlo a esa clave y a Firebase Auth.
5. Revisar y revocar credenciales antiguas expuestas con su proveedor. No ejecutar comandos que impriman tokens o listados JSON de credenciales.

## Cambio de versión

Realizar sin un evento en curso: los modelos de permisos de ambas versiones son incompatibles. Preparar una página temporal de mantenimiento si se necesita impedir el uso durante el cambio. Especificar cuenta y proyecto en cada comando.

1. Publicar índices con `firebase deploy --only firestore:indexes --project momentos-en-vivo --account sylar.soluciones@gmail.com` y comprobar que terminan de construirse.
2. Publicar reglas, funciones e interfaz como parte de la misma intervención: `firebase deploy --only functions:api1,functions:billingMaintenance,functions:albumWorker,functions:albumMaintenance,functions:eventNotifications,functions:mailWorker,functions:mailMaintenance,functions:retentionMaintenance,firestore:rules,storage,hosting --project momentos-en-vivo --account sylar.soluciones@gmail.com`. No es un despliegue atómico; verificar cada componente antes de reabrir el uso. Las tareas programadas requieren los servicios de Scheduler/PubSub y facturación correspondientes. Verificar la firma de descargas y el envío del correo antes de habilitarlos.
3. Solo durante la migración original, con el sitio en mantenimiento y sin eventos nuevos, se utilizó `scripts/migrate-legacy-events.cjs`, que limita el proyecto y comprueba esas condiciones. Reutiliza la sesión autorizada de Firebase sin cambiar las credenciales por defecto del equipo. No volver a aplicar la limpieza después de la reapertura.

```powershell
node scripts/migrate-legacy-events.cjs
node scripts/migrate-legacy-events.cjs --apply --confirm-project=momentos-en-vivo
node scripts/migrate-legacy-events.cjs
```

La primera ejecución cuenta, la segunda elimina y la tercera verifica el resultado. Afecta las colecciones `events`, `photos`, `uploadLimits` y `accountLimits`, y los objetos bajo `photos/` del bucket especificado. Conserva Firebase Auth, facturación, el bucket y colecciones/archivos ajenos. El borrado es irreversible: revertir código no recupera fotografías.

## Verificación después de publicar

- `/api/health` responde versión 3; `/api/config` indica `emulator: false` y una clave pública App Check configurada. `/api/catalog` debe mantener compras desactivadas hasta completar la preparación de pagos.
- La cuenta propietaria ya fue creada y Firebase confirmó el correo verificado y la cuenta habilitada. El acceso a la consola Google por sí solo no equivale a una cuenta de la web.
- Registrar/verificar un cliente y comprobar su acceso separado sin habilitación administrativa. Seguir el ensayo de compra/activación descrito en `PAGOS.md` antes de habilitar ventas.
- Crear un evento de prueba, escanear el QR en un teléfono, subir, aprobar, proyectar, descargar y rechazar una foto. Cerrar el evento y comprobar la revocación.
- Confirmar que accesos sin sesión/enlace y lecturas directas de Firestore/Storage se rechazan. Revisar errores sin registrar claves de enlace, tokens o fotos.
- Verificar una carga real con App Check desde el dominio público. Los emuladores comprueban los rechazos, pero no certifican el desafío real de Google.

Si App Check falla, corregir el registro, la clave o el dominio; no deshabilitarlo como solución permanente. Si falta un índice, esperar a que esté listo antes de habilitar eventos.

## Límites y pendientes conocidos

- No hubo prueba de carga masiva ni auditoría externa. App Check y cuotas reducen abuso; no eliminan todos los ataques o consumos.
- Probar un teléfono real —incluido iPhone si se usará—, los correos de verificación, la conexión del salón y el proyector antes del evento. Navegadores sin decodificador HEIC pedirán elegir otra foto.
- El álbum completo se prepara por partes en el servidor; el permiso de firma ya está aplicado a la misma cuenta de servicio con autorización expresa. Falta comprobar la descarga completa en producción. Los avisos SMTP están desplegados y pendientes de ensayo desde los workers; la limpieza automática sigue desactivada.
- Hay panel administrativo de incidencias. Siguen pendientes invitaciones de moderadores y alertas externas de costos/errores.
- Una terminación abrupta durante el guardado puede dejar una foto `processing`; requiere diagnóstico y limpieza administrativa. Se recuperan los errores de Storage que sí responden.
- Se puede sustituir el propietario por correo por un rol ligado a su UID con `scripts/grant-admin.cjs`, quitando luego `OWNER_EMAIL`.
- `.env.local` salió del índice de Git, pero no se reescribió el historial. Las credenciales antiguas publicadas deben revocarse con su proveedor. El backend nuevo no usa las claves compartidas heredadas.
- Un comando de comprobación Firebase mostró credenciales de sesión de la cuenta anterior en la salida de la herramienta. Se informó al usuario; no se copiaron al proyecto. Renovar esa sesión sigue pendiente; no se revocaron accesos a otros proyectos.

## Recuperación

Conservar una revisión del código probado. Si falla una parte del despliegue, mantener el servicio en mantenimiento y reparar o volver a una revisión compatible de API e interfaz. No restaurar reglas abiertas ni el backend antiguo inseguro. Volver a una versión de Hosting no restaura funciones, reglas o fotos eliminadas.

Referencias: [roles administrativos](https://firebase.google.com/docs/auth/admin/custom-claims), [App Check web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [validación del backend](https://firebase.google.com/docs/app-check/custom-resource-backend).
