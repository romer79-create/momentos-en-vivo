# Diagnóstico de Webhooks de Mercado Pago

Momentos en Vivo · Un proyecto de Sylar.soluciones

## Estado comprobado

- Aplicación visible en el panel del propietario: `2940830163173`.
- El propietario comparó de forma oculta su Access Token de **Prueba** con el secreto utilizado por el servidor. El resultado fue **COINCIDE**. No se cambiaron credenciales.
- Las preferencias creadas con esa credencial devuelven `client_id=272634192725060` y `collector_id=2954695377`.
- El vendedor `2954695377` está verificado como usuario de prueba argentino mediante `/users/me`.
- Comprador ficticio seleccionado en el panel: `2954695331`.
- Integración: Checkout Pro con API de Preferencias, SDK Node.js `mercadopago` 3.6.1.
- Receptor: `https://momentos-en-vivo.web.app/api/payments/webhook`.

## Casos observados

1. El simulador oficial, abierto desde el panel del propietario, notificó `payment.updated` para el pago de prueba `180376881419`. Respondió **200 OK** el 29/09/2026 a las 00:57 UTC. Se verificó la firma y se consultó el pago por API, sin duplicar saldo ni correo.
2. Una compra nueva produjo la preferencia `2954695377-74978b76-1351-4a4f-aade-b093b778f8f6` y el pago de prueba `181383366976`, aprobado por ARS 65.000 con tarjeta oficial de prueba. El proveedor devolvió `live_mode=true`, pese a las identidades ficticias verificadas.
3. A las 01:25:38 y 01:25:46 UTC llegaron peticiones de formato `payment` con `x-signature` y `x-request-id` presentes, rechazadas al validar la firma con el SDK oficial (**401**). No se conservaron sus cabeceras ni cuerpos. Al no superar la firma, no se certifica su origen solo con estos registros. También se rechazaron formatos IPN y otros tópicos (**400**).
4. La revisión programada recuperó el pago mediante consulta autenticada a las 01:28:14 UTC. La ejecución de `billingMaintenance` terminó correctamente a las 01:28:14.822 UTC. Se acreditó una sola unidad, saldo sandbox total 2 y correo de compra enviado con un intento. No se pulsó **Comprobar pago** en este ensayo. Esta recuperación es distinta de la entrega inmediata por Webhook.
5. En la aplicación `2940830163173`, el propietario informó que guardar la configuración de Modo productivo devuelve un error de reintento. La configuración de Modo de prueba y su simulador sí eran accesibles. No se considera guardado el cambio rechazado.
6. Abrir `https://www.mercadopago.com.ar/developers/panel/app/272634192725060/webhooks` mostró un error genérico, tanto desde la cuenta principal como al intentar acceder desde el vendedor ficticio. La segunda captura mostró el código de pantalla `DXT2-G81GZXQSLEIC`. No se ha determinado si es un problema de acceso, disponibilidad o representación de la aplicación interna de pruebas.

## Información que falta confirmar con Mercado Pago

- Cómo se vinculan la aplicación del propietario `2940830163173` y el `client_id` de prueba `272634192725060` obtenido con su propia credencial de Prueba.
- Desde qué panel y modo se obtiene la firma secreta aplicable a los avisos automáticos de estas compras ficticias.
- Por qué falla el guardado en Modo productivo y cómo acceder a la configuración que corresponde a los pagos de prueba.

No se ha demostrado una caída general de Mercado Pago ni un defecto de su servicio de firmas. Se requiere confirmar la configuración y el vínculo entre las aplicaciones. Los cobros reales continúan desactivados y las firmas inválidas se rechazan. Este informe no contiene tokens, claves, contraseñas, información de tarjetas ni datos personales de compradores.
