# Compras y activación

## Estado y configuración

El simulador local acredita eventos ficticios sin contactar a Mercado Pago. No equivale a una prueba del proveedor. La versión pública está desplegada con `PAYMENTS_MODE=live`, `PAYMENTS_CHECKOUT_ENABLED=false` y `PAYMENTS_SANDBOX_ADMIN=false`: la conexión real está preparada y las ventas continúan pausadas hasta verificar el pago privado final. Ninguna credencial privada debe entrar al navegador, Git, chat o registros. Ver [estado productivo actual](PAGOS_PRODUCTIVOS_2026_09_29.md) y [registro histórico de pruebas](RELEASE_2026_09_28.md).

El propietario creó la aplicación **Momentos en Vivo**, con **Checkout Pro / API de Preferencias**, y guardó su Access Token mediante el ingreso oculto. El 28 de septiembre de 2026 se verificó la versión 1 habilitada de `MERCADO_PAGO_ACCESS_TOKEN`: Mercado Pago confirmó vendedor de prueba **2954695377**, sitio `MLA` y país `AR`. Se completaron dos compras ficticias aprobadas: una se recuperó manualmente y otra mediante la conciliación programada. El simulador oficial envió un aviso firmado válido, sin duplicar saldo ni correo. Eso no certificó el disparo automático.

El 29/09/2026 se preparó el paso a producción: la URL productiva de Webhooks quedó guardada con únicamente **Pagos (legacy)** y se activaron las credenciales productivas. Los detalles y el estado actual están en [la comprobación productiva](PAGOS_PRODUCTIVOS_2026_09_29.md); ese informe prevalece sobre los registros históricos de sandbox.

### Ingreso inicial de la credencial de prueba

Ejecutar en una terminal interactiva:

```powershell
node "D:\momentos en vivo\scripts\configure-payments.cjs"
```

El propietario copia el **Access Token** de **Prueba** usando su botón de copiar y lo pega solo en el pedido oculto. No hace falta revelar la clave ni enviar la Public Key para este paso. El programa consulta `GET https://api.mercadopago.com/users/me` con autorización en cabecera y sin seguir redirecciones. Exige etiqueta `test_user`, sitio `MLA`, país `AR` e identificador entero válido antes de guardar `MERCADO_PAGO_ACCESS_TOKEN` en Secret Manager del proyecto **momentos-en-vivo**, mediante la sesión de **sylar.soluciones@gmail.com**. Si no puede confirmar el tipo de cuenta, se detiene; el prefijo `APP_USR` por sí solo no distingue prueba de producción.

La clave viaja a Firebase por entrada estándar, con cuerpos de diagnóstico omitidos. El programa no escribe la clave en archivos o argumentos, no muestra el perfil completo, no crea preferencias ni pagos, no despliega y no habilita cobros. Rechaza reemplazar la credencial si la configuración local tiene un modo de cobro habilitado. Muestra únicamente el ID de prueba confirmado. Seis pruebas con respuestas simuladas cubren rechazo de cuentas reales/extranjeras, errores y protección de la clave. `scripts/check-payments.cjs` realizó además la verificación real indicada arriba, leyendo el secreto únicamente en memoria y mostrando solo metadatos.

La versión 1 de `MERCADO_PAGO_WEBHOOK_SECRET` está guardada, habilitada y vinculada a las funciones desplegadas. El receptor público rechaza firmas inválidas. Sigue pendiente confirmar una notificación auténtica de Mercado Pago y completar las compras de prueba antes de habilitar ventas. No repetir el ingreso inicial de claves salvo una rotación deliberada; los iniciadores rechazan reemplazos con el modo activo.

### Ingreso inicial de la clave de Webhooks

En la aplicación de Mercado Pago, abrir **Webhooks → Configurar notificaciones**, elegir la **URL modo pruebas**, ingresar `https://momentos-en-vivo.web.app/api/payments/webhook`, seleccionar **Pagos** y guardar. Mercado Pago genera una **Clave secreta** de esa aplicación. El receptor ya está publicado. Una simulación con un ID de pago inexistente no acredita saldo y puede fallar al consultar al proveedor: no demuestra una compra completa.

Copiar esa clave e ingresarla únicamente en el pedido oculto de:

```powershell
node "D:\momentos en vivo\scripts\configure-webhook.cjs"
```

Este iniciador guarda `MERCADO_PAGO_WEBHOOK_SECRET` con la misma protección de registros y entrada estándar. No modifica la política de PowerShell, despliega ni habilita cobros. Rechaza formatos básicos incorrectos, Access Tokens y modos de pago activos; solo una notificación firmada posterior podrá demostrar que la clave corresponde a esta aplicación. El receptor verifica la firma y consulta el pago al proveedor antes de acreditar saldo.

Referencia: [configuración oficial de Webhooks para Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

Fuentes: [credenciales de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-application), [token en cabecera y consulta de cuenta](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/best-practices/credentials-best-practices/secure-credentials?scope=prod), [identificación de usuarios de prueba](https://developers.mercadolibre.com.ar/es_ar/registra-tu-aplicacion/consulta-usuarios).

### Configuración del servidor

El archivo ignorado `functions/.env.momentos-en-vivo` acepta:

| Variable | Significado |
| --- | --- |
| `PAYMENTS_MODE` | `disabled`, `sandbox` o `live` |
| `PAYMENTS_CHECKOUT_ENABLED` | `true` habilita compras públicas si toda la configuración es válida; `false` las pausa sin detener la conciliación ni los avisos de pagos existentes |
| `PAYMENTS_SANDBOX_ADMIN` | `true` permite compras exclusivamente a administradores verificados en modo `sandbox`; no habilita compras en `live` |
| `MERCADO_PAGO_COLLECTOR_ID` | ID del vendedor de prueba |
| `MERCADO_PAGO_LIVE_COLLECTOR_ID` | ID del vendedor real; obligatorio en `live` |
| `PRICE_EVENT_1_CENTS` | Precio entero en centavos ARS de 1 evento |
| `PRICE_PACK_3_CENTS` | Precio entero en centavos ARS de 3 eventos |
| Pack de 10 | Solo cotización; no permite compra directa, aunque se configure un precio |
| `EVENT_PHOTO_LIMIT` | Fotos por evento, entre 1 y 3000 |
| `EVENT_RECEPTION_HOURS` | Ventana desde la fecha/hora elegida, entre 1 y 168 horas |
| `EVENT_DOWNLOAD_DAYS` | Días de descarga después de la recepción, entre 1 y 365 |

Guardar las claves en Firebase Secret Manager: `MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` se usan exclusivamente en `sandbox`; `MERCADO_PAGO_LIVE_ACCESS_TOKEN` y `MERCADO_PAGO_LIVE_WEBHOOK_SECRET`, exclusivamente en `live`. Las funciones `api1` y `billingMaintenance` vinculan solo las correspondientes al modo seleccionado. No existe fallback de claves reales a claves de prueba. Redeplegar ambas al cambiar el modo. Un plan sin precio no permite iniciar su compra; faltando credenciales, vendedor o condiciones, el catálogo deshabilita todos los cobros.

Para preparar las claves reales mientras las ventas están pausadas y la configuración sigue en `sandbox`/`disabled`, el titular usa `node 'D:\momentos en vivo\scripts\configure-live-payments.cjs'`. El ingreso es oculto, valida vendedor real argentino antes de guardar, conserva las claves de prueba y no activa ventas ni despliega. `scripts/check-live-payments.cjs` comprueba las versiones guardadas y devuelve únicamente metadatos.

La oferta aprobada es **ARS 65.000 por un evento**, **ARS 175.500 por tres** (10% de descuento) y **consultar por diez**. Incluye 48 horas de recepción y 30 días de descarga desde el fin de recepción; el saldo sin activar vence a los 12 meses calendario de acreditarse. Se conserva el tope técnico de 3000 fotos. Los simuladores muestran los mismos importes y plazos, sin cobrar dinero real. El horario se interpreta en Argentina (UTC−3). Las compras anteriores sin vencimiento se conservan. Ver [condiciones y validación actuales](PULIDO_Y_AUTOMATIZACION.md).

## Confirmación y recuperación

Checkout Pro usa `POST /checkout/preferences`, referencia de orden propia y precios del servidor. Retorna al dominio canónico `/pago.html?order=...`; la página de retorno nunca acredita por sus parámetros. Las órdenes se conservan al fallar la red y el mismo identificador recupera la compra.

Las cuentas de prueba actuales acceden por el `init_point` devuelto por Mercado Pago. En el ensayo del 28/09/2026, `sandbox_init_point` entró en un bucle de redirecciones al iniciar sesión; `init_point` permitió pagar con la tarjeta ficticia. Antes de crear preferencias, el servidor verifica por `/users/me` que el vendedor coincida con el configurado, sea argentino y tenga `test_user` únicamente en sandbox. El modo live rechaza vendedores de prueba.

Un pago entre cuentas de prueba puede devolver `live_mode: true` en ese recorrido. No se omite la comprobación de modo: en sandbox, esa variante exige vendedor de prueba verificado y coincidencia exacta de `payer.id` con `MERCADO_PAGO_TEST_BUYER_ID`, seleccionado previamente en el panel de cuentas de prueba. El perfil público del comprador no expone `tags`, por lo que no se infiere su carácter ficticio del nombre ni del correo. La prueba inicial está limitada al comprador `2954695331`; cambiarlo requiere comprobar previamente la nueva cuenta en el panel. Solo el objeto obtenido y validado por el servidor recibe esa comprobación interna, que no puede enviarse por JSON desde el navegador. Se mantienen las verificaciones de referencia, moneda, importe, vendedor, firma y acreditación única. `live_mode: false` conserva la validación de sandbox anterior.

Webhook: `https://momentos-en-vivo.web.app/api/payments/webhook`. Solo notificaciones de tipo `payment`, firma verificada con el SDK oficial y consulta autenticada a `/v1/payments/{id}`. Se comprueban vendedor, referencia, importe, moneda, modo y estado. Se permite la repetición de una notificación firmada: la consulta obtiene el estado actual y la transacción impide duplicar saldo. No se acepta el estado enviado por el navegador o el cuerpo del webhook como prueba de pago.

El receptor registra únicamente categorías de diagnóstico (`payment_webhook`): formato, etapa, resultado, estado HTTP y presencia/verificación de firma. No registra identificadores, cuerpos, cabeceras ni mensajes del proveedor. `node scripts/check-webhook-deliveries.cjs` consulta estas entradas de forma acotada; un aviso firmado puede proceder del simulador, por lo que no demuestra por sí solo el disparo automático de una compra.

Cada compra guarda precio, cantidad y condiciones. Una transacción escribe el pago, el lote de unidades, el saldo y el historial. Activar un evento consume una unidad del lote más antiguo disponible en otra transacción. Dos clics no consumen dos unidades; dos eventos no pueden gastar la misma.

Los saldos y lotes de prueba están separados de los reales. Un evento activado en sandbox no se puede reutilizar en live. Aun así, hacer los ensayos del proveedor en un proyecto de staging separado evita mezclar datos de pruebas e historial comercial.

`billingMaintenance` consulta órdenes pendientes y pagos aprobados cada 15 minutos, procesando hasta 25 órdenes por ejecución y cerrando hasta 100 eventos vencidos. Los aprobados se vuelven a comprobar diariamente; los pendientes, por hora. El servidor hace respetar los horarios aunque la tarea se retrase. No publica avisos externos.

Pagos duplicados, errores de conciliación y reintegros generan `billingIncidents`. Reintegros o contracargos retiran unidades sin usar; no cierran eventos ya activados. Los reintegros parciales quedan en revisión y suspenden el saldo restante de esa compra. El panel administrativo ya muestra incidencias; su resolución y las alertas externas siguen pendientes. Los workers de avisos están publicados con SMTP; falta comprobar una entrega desde ellos. La limpieza automática continúa desactivada.

## Antes de habilitar ventas

1. Precios, límites, plazos y soporte ya incorporados; completar cualquier política comercial o fiscal pendiente antes de vender.
2. Credenciales y vendedor de prueba ya configurados. La captura del propietario confirmó compradores argentinos existentes; se eligió reutilizar **cuenta prueba ticket**, ID **2954695331**, distinto del vendedor **2954695377**. No crear duplicados ni guardar contraseñas/códigos en la documentación.
3. Probar compra aprobada, pendiente, rechazada, notificación repetida y retorno cerrado con compradores de prueba distintos del vendedor. Verificar los webhooks desde el proveedor.
4. Ensayar un reintegro y la recuperación de una notificación perdida. Confirmar que las incidencias permiten actuar sin revisar todos los pagos manualmente.
5. Configurar facturación y avisos operativos según la política aprobada. La pantalla de pago no es una factura fiscal.
6. Después de los ensayos y la decisión de abrir ventas, cambiar a credenciales/ID del vendedor real, definir modo `live`, desactivar la excepción sandbox y habilitar explícitamente `PAYMENTS_CHECKOUT_ENABLED=true`. Redeplegar y comprobar el catálogo antes de anunciar la venta.

Los ensayos locales no realizan cargos ni sustituyen una validación con el proveedor. Las compras ficticias publicadas y el paso a producción se documentan por separado.

El primer ensayo publicado quedó aprobado después de corregir el acceso por `init_point` y la validación de cuentas de prueba: una unidad de saldo sandbox acreditada, sin duplicaciones, y correo automático enviado. Se recuperó el pago desde **Comprobar pago**. Posteriormente, el simulador oficial de Webhooks envió `payment.updated` sobre ese pago y obtuvo 200 OK; la lectura del registro confirmó una nueva comprobación y conservó un solo crédito y envío de correo. Falta comprobar el disparo automático al realizar una compra nueva, sin usar simulador ni refresco manual, y los demás escenarios antes de habilitar ventas. Ver el detalle en [el informe de publicación](RELEASE_2026_09_28.md#primer-checkout-de-prueba-y-bloqueo-de-acceso).

## MCP oficial

El [MCP oficial](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/mcp-server/tools) ofrece diagnóstico y revisión de calidad. Ya está cargado en este chat y una consulta de historial respondió correctamente, con la credencial de prueba mantenida en Firebase. La autorización OAuth de la cuenta principal presentó una incompatibilidad y no se completó. El transporte expone seis herramientas y excluye credenciales, aplicaciones y cambios de Webhooks. Mercado Pago rechazó el único intento de crear un comprador con `FORBIDDEN_FOR_TRIAL_ACCOUNTS`; posteriormente el panel del propietario confirmó que ya existían compradores reutilizables. Ver [conexión, límites y comprobaciones](CONEXION_MCP.md). No reemplaza las llamadas del servidor que procesan los pagos ni habilita ventas reales.

Referencias oficiales: [preferencias](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-payment-preference), [webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
