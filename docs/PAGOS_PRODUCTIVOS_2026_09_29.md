# Mercado Pago productivo — 29/09/2026

Momentos en Vivo — Un proyecto de Sylar.soluciones.

## Estado comprobado

- Aplicación: **2940830163173**, Checkout Pro mediante API de Preferencias.
- El panel permitió guardar `https://momentos-en-vivo.web.app/api/payments/webhook` en **Modo productivo**. Se recargó y se confirmó que la URL persistió con únicamente **Pagos (legacy)** marcado. No se restableció la firma.
- El titular aceptó las condiciones y activó las credenciales productivas.
- El ingreso oculto guardó `MERCADO_PAGO_LIVE_ACCESS_TOKEN` y `MERCADO_PAGO_LIVE_WEBHOOK_SECRET`, versiones **1**, habilitadas.
- Una consulta independiente a `/users/me` confirmó vendedor **78132866**, país **AR**, cuenta real. No se guardaron ni imprimieron perfiles o claves.
- `api1` y `billingMaintenance` se actualizaron satisfactoriamente en Node.js 22 con `PAYMENTS_MODE=live`, `PAYMENTS_CHECKOUT_ENABLED=false` y `PAYMENTS_SANDBOX_ADMIN=false`. La portada, las demás funciones y los eventos se conservaron.
- La comprobación pública confirmó precios aprobados, ventas pausadas, acceso anónimo rechazado y Webhooks falsificados rechazados.
- Una lectura independiente de Cloud Functions confirmó las dos funciones `ACTIVE`, runtime `nodejs22`, modo `live`, ventas pausadas y únicamente las dos claves productivas en versión 1. Sus actualizaciones son de las **20:13:33 UTC**. El comprobador es `scripts/check-payment-deployment.cjs`; acepta `--live` cuando se habiliten las compras.

Las claves y los vendedores de prueba/reales están separados. Las funciones vinculan solo las claves del modo seleccionado. Un cambio a `live` sin sus propias claves y vendedor deja los cobros desactivados.

## Validación privada completada

Se creó una única orden de **ARS 100**, exclusiva de la cuenta del titular y marcada `validation:true`, mediante `scripts/prepare-live-validation.cjs`. No se modificó el catálogo comercial: un evento sigue costando ARS 65.000 y tres ARS 175.500; diez se cotizan.

La preferencia devuelta confirmó aplicación **2940830163173** y vendedor **78132866**. Crear la orden y el enlace no ejecutó ningún pago. Después, una cuenta compradora real distinta de la vendedora completó el cobro de ARS 100 y el propietario confirmó que le avisaron de su registro.

La lectura de la orden confirmó estado **approved**, un único crédito real, una unidad disponible, vencimiento a los doce meses y correo de compra **sent**, con un solo intento. También figura un intento anterior rechazado, sin saldo acreditado ni incidencias.

La acreditación se registró el **29/09/2026 a las 20:55:58.952 UTC** y el receptor confirmó `payment`, firma verificada, resultado `credited` y respuesta HTTP 200 a las **20:55:59.032 UTC**. La última comprobación de la orden era anterior al pago, a las 20:28:05 UTC; no se usó el simulador ni el botón de comprobación manual para acreditar esta compra. La correlación entre compra real, registro firmado y transacción confirma la entrega y acreditación automáticas. El diagnóstico de registros aislado no certifica ese recorrido.

**Devolución pendiente:** el titular debe confirmar la devolución de los ARS 100 en Mercado Pago. No se ejecutó un reintegro ni se activó el crédito de validación en un evento. Después del reintegro se deberá comprobar el estado de la orden y la retirada del saldo sin usar.

El identificador y enlace privados se conservan solo en los archivos locales ignorados de `output/releases/`. Reejecutar el preparador reutiliza la orden pendiente y su enlace; nunca vuelve a preparar una orden ya procesada. La preparación rechaza ventas públicas activas, sandbox, vendedores de prueba, cuentas sin verificación y preferencias de otra aplicación.

`node scripts/check-live-validation.cjs` consulta únicamente la orden del titular, su saldo, lote, historial, correo e incidencias. No fuerza la conciliación ni simula una notificación. `node scripts/check-webhook-deliveries.cjs` inspecciona registros acotados sin cuerpos, firmas, identificadores privados ni credenciales. Es necesario correlacionar su resultado con el pago real: un aviso del simulador por sí solo no acredita entrega automática.

**Pendiente en este punto:** autorización explícita para abrir las ventas reales al público y publicación de ese cambio. La revisión automática de permisos rechazó el intento de habilitación por requerir esa autorización concreta. El cambio local de `PAYMENTS_CHECKOUT_ENABLED` está preparado, pero la configuración publicada sigue en `false`. El pago privado y su notificación automática sí quedaron comprobados.

## Comprobaciones ejecutadas

- 24 pruebas de configuración, credenciales, Gateway y Webhooks: aprobadas.
- 26 pruebas de seguridad, utilidades y acceso administrativo: aprobadas.
- 23 pruebas de comercio en emuladores: aprobadas; incluyen pagos pendientes/rechazados, duplicados simultáneos, reintegros, separación de saldos y recuperación programada.
- Una prueba adicional de pagos `live` firmados y reintegros: aprobada; la firma de sandbox no pasa, el saldo y el correo se generan una sola vez y el reintegro no modifica el saldo de prueba.
- Tres pruebas de la preparación privada: aprobadas; importe fijo, reintentos, rechazo de órdenes ajenas/completadas y de ventas activas.
- Las pruebas locales usan respuestas ficticias y no ejecutan cargos reales.

## Publicación y vuelta atrás

La primera publicación agotó el tiempo de análisis del código y no actualizó funciones. El segundo intento, con `FUNCTIONS_DISCOVERY_TIMEOUT=60`, actualizó correctamente solo `api1` y `billingMaintenance`.

Para abrir ventas tras la comprobación, cambiar únicamente `PAYMENTS_CHECKOUT_ENABLED=true`, conservar modo `live` y volver a desplegar esas dos funciones. Ejecutar `node scripts/check-public.cjs --live` y revisar Mis compras. Para pausar ventas, volver a `false` y redeplegar: se conserva la conciliación de compras reales.

La configuración anterior a `live` se guardó localmente en `output/releases/payments-before-live-20260929.env`; las claves de prueba no se eliminaron. Volver globalmente a sandbox durante compras reales dejaría de conciliar esas órdenes, por lo que la pausa de ventas es la primera medida ante un incidente.

El código y las pruebas se subieron a GitHub (`main` y `mejora/seguridad-eventos`) en el commit `b346274`. Los archivos privados de configuración y validación quedaron excluidos.

Referencias: [credenciales oficiales](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/credentials), [Webhooks para API de Preferencias](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
