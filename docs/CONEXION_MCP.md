# Conexión MCP de Mercado Pago

Un proyecto de **Sylar.soluciones**.

## Estado comprobado el 28/09/2026

Se configuró el servidor `mercadopago` en Codex. Una comprobación completa del transporte local y del MCP oficial confirmó seis herramientas y una consulta de historial correcta. También se consultó la lista de calidad. Después de guardar el directorio de trabajo y reiniciar la aplicación, las seis herramientas aparecieron disponibles en este chat y `notifications_history` respondió correctamente desde la herramienta integrada, sin notificaciones encontradas en el contexto consultado. No se modificaron Webhooks ni se hicieron pagos.

Se intentó una sola creación de comprador argentino de prueba para continuar el ensayo. Mercado Pago la rechazó con `FORBIDDEN_FOR_TRIAL_ACCOUNTS`; no se creó el usuario. La limitación corresponde a la credencial del vendedor ficticio conectada, no demuestra que la cuenta principal del propietario esté sin activar. Después, el propietario mostró en su panel tres compradores argentinos existentes. Se eligió reutilizar **cuenta prueba ticket**, ID **2954695331**, distinto del vendedor. No se guardan su contraseña ni su código de acceso en estos documentos. Falta iniciar el recorrido de compra desde la sesión del administrador de Momentos en Vivo y usar el comprador ficticio al llegar a Mercado Pago.

La conexión utiliza el método de **Access Token de prueba** que Mercado Pago documenta como alternativa. No es una sesión OAuth de la cuenta principal. La autorización OAuth nativa falló con `OAuth authorization endpoint origin does not match the authorization server origin without issuer-bound callbacks`: los metadatos públicos declaran `mcp.mercadopago.com` como emisor y `auth.mercadopago.com` como destino de autorización, sin anunciar soporte de la comprobación de emisor en la respuesta. No se deshabilitó esa validación.

## Funcionamiento y límites

- El transporte local es `scripts/mercadopago-mcp.cjs`, ejecutado con Node.js 22. Usa el SDK MCP ya instalado en el proyecto.
- Recupera exclusivamente la versión **1** de `MERCADO_PAGO_ACCESS_TOKEN` desde Secret Manager de **momentos-en-vivo**, con la sesión Firebase de **sylar.soluciones@gmail.com**. No imprime ni guarda la clave en archivos ni en la configuración de Codex.
- Antes de conectar exige que Mercado Pago confirme el vendedor ficticio argentino **2954695377**. Una credencial real, de otro país, otra cuenta o una versión deshabilitada detiene el proceso. No sigue automáticamente futuras versiones del secreto.
- Solo envía solicitudes MCP al endpoint HTTPS oficial, sin seguir redirecciones. Elimina claves de los resultados y rechaza argumentos que intenten sustituir la autorización.
- Herramientas expuestas: documentación, checklist de calidad, evaluación, historial de notificaciones, creación de compradores argentinos de prueba y carga de saldo ficticio de usuarios de prueba. Estar expuestas no garantiza permisos del proveedor: la creación fue rechazada por la limitación de cuenta de prueba. La evaluación y la carga de saldo no fueron ejecutadas.
- No expone lectura de credenciales, creación/listado de aplicaciones ni modificación de Webhooks. Esas operaciones y el acceso completo de la cuenta requieren una conexión posterior adecuada; este transporte no las simula.
- Requiere conservar la carpeta del proyecto, sus dependencias, Node.js y la sesión Firebase. Si esa sesión vence, hay que renovarla con Firebase para la cuenta propietaria. No pegar claves en el chat.

Para recargarlo: **Configuración → Servidores MCP → mercadopago → Reiniciar** en la aplicación. No necesita autenticación OAuth adicional para esta modalidad.

## Verificación

Las cuatro pruebas de `tests/mercadopago-mcp.test.cjs` comprueban identidad de prueba obligatoria, herramientas y argumentos restringidos, ocultación de secretos y rechazo de destinos/redirecciones ajenos. La comprobación real `node scripts/mercadopago-mcp.cjs --check` confirmó la consulta de calidad; un cliente MCP separado verificó después el transporte estándar de entrada/salida y la consulta remota de historial. El MCP no sustituye la compra completa pendiente con Mercado Pago ni habilita ventas en la web.

Referencias: [conexión y autenticación alternativas de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/mcp-server/mcp-server-troubleshooting), [configuración MCP de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Actualización posterior al primer pago

Se completó el pago de prueba `180376881419`, asociado a la preferencia de la aplicación `272634192725060`. Se acreditó una unidad sandbox mediante la consulta autenticada de la web y se envió el correo automático. Ver [informe de publicación](RELEASE_2026_09_28.md).

La consulta de `notifications_history` con el ID explícito de esa aplicación fue rechazada por Mercado Pago con `OAuth ownership validation failed`: esta operación exige una conexión OAuth de la aplicación propietaria. Por tanto, el resultado anterior sin `application_id` que decía no encontrar notificaciones no permite concluir que esta aplicación no las envíe. No se intentó eludir esa restricción. El historial debe comprobarse desde Webhooks en el panel del propietario.

La evaluación de calidad con el pago conocido falló con HTTP 400 por un parámetro interno `product_id` no expuesto por la herramienta; no se obtuvo puntuación. Una lectura limitada de los registros propios de Firebase encontró estados HTTP de `api1`, pero no identificó rutas de Webhooks y no demuestra una entrega auténtica. La preferencia sí contiene la URL esperada `https://momentos-en-vivo.web.app/api/payments/webhook`. No se modificaron notificaciones ni se rotaron secretos en estas comprobaciones.
