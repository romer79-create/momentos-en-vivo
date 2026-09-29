# Dirección de producto: autoservicio por evento

## Decisiones confirmadas por el propietario

- El cliente debe registrarse, pagar, preparar y administrar sus eventos por su cuenta.
- Venta por evento individual y por paquetes de eventos.
- Mercado inicial: Argentina. Moneda: pesos argentinos (ARS).
- El propietario ya dispone de una cuenta de Mercado Pago. Checkout Pro es la integración propuesta; todavía no se conectó esa cuenta al proyecto.
- Cada cliente modera sus propias fotos. La intervención del propietario se reserva para problemas puntuales.

La versión local ya reemplaza la habilitación manual por borradores, compras, saldo y activación. Implementa un adaptador de Checkout Pro (Preferences/Payments), confirmaciones firmadas, consulta al proveedor y conciliación periódica. Los cobros reales siguen desactivados: falta conectar Mercado Pago, incorporar precios/condiciones y completar el ensayo con sus cuentas de prueba. Las mejoras de autorización, privacidad y manejo de imágenes siguen siendo la base.

## Implementado y pendiente

Implementado: portada con movimiento controlable y demostración interactiva; catálogo del servidor; historial de compras; simulador exclusivamente local; órdenes con precio/condiciones congelados; acreditación y activación atómicas; separación por cliente; ventana horaria de recepción; cierre periódico y por solicitud; reprogramación antes del comienzo mientras no haya fotos. Reintegros/contracargos retiran el saldo sin usar y registran una incidencia sin interrumpir eventos ya activados.

Pendiente: ensayo real en el ambiente de pruebas de Mercado Pago, política comercial definitiva, correos operativos, invitaciones de moderadores, ZIP de todo el álbum como tarea recuperable, eliminación programada de fotos y una bandeja administrativa de incidencias con alertas. Hoy las incidencias quedan registradas en Firestore y las descargas son por páginas. No prometer esos pendientes en la portada.

El propietario indicó que enviará precios, pero aún no entregó importes. Los paquetes 1/3/10 y los límites locales son provisionales. Ver [PAGOS.md](PAGOS.md).

## Recorrido propuesto

1. La portada explica el servicio, requisitos y planes. Acciones principales: Ver planes, Probar una demostración y Crear mi evento.
2. El cliente crea una cuenta y verifica su correo. Puede explorar una demostración con contenido ficticio y preparar un borrador privado, con límites contra abuso.
3. Compra un evento o un paquete. El importe y los límites salen del catálogo del servidor; el navegador no define el precio ni la cantidad de eventos acreditados.
4. El servidor confirma el pago con Mercado Pago y acredita la compra una sola vez, incluso si el cliente cierra la pestaña o llegan varias notificaciones del mismo pago.
5. El panel muestra Eventos disponibles, Mis eventos y Compras. Un asistente guía nombre, fecha, horario, apariencia y prueba de funcionamiento.
6. Al activar un evento se descuenta exactamente una unidad de su saldo, se vincula al evento y se habilita su QR para la ventana de uso contratada. Se puede preparar e imprimir el QR antes del comienzo; recibir fotos depende del horario configurado.
7. El cliente comparte el QR, revisa las fotos y maneja la pantalla. Puede delegar moderación mediante una invitación con permisos limitados.
8. Al finalizar, se cierra la recepción automáticamente, se prepara el álbum y se mantiene la descarga durante el plazo informado en la compra.
9. Se envían los avisos de vencimiento acordados y se eliminan los archivos al terminar la conservación. El cliente puede gestionar cierre y eliminación desde su cuenta.

La participación de invitados sigue sin cuenta ni pago. El cliente aporta conexión y dispositivos de proyección; el sitio debe explicar esto antes de comprar. La portada actual, orientada a atención local y consultas por WhatsApp, deberá adaptarse a la venta de un servicio digital.

## Catálogo inicial propuesto, todavía no aprobado

| Compra | Uso previsto |
| --- | --- |
| 1 evento | Una celebración puntual |
| Paquete de 3 eventos | Clientes que organizan ocasionalmente |
| Paquete de 10 eventos | Organizadores y salones |

Usar las mismas funciones principales en todos los paquetes y diferenciar inicialmente por cantidad. Los precios y eventuales descuentos aún no están definidos. No activar cobros recurrentes ni suscripciones como parte implícita de un paquete.

Mostrar en la compra, con lenguaje claro: fotos y almacenamiento incluidos por evento, ventana de recepción, tiempo de descarga, vigencia del saldo no utilizado, alcance de soporte y requisitos de conexión/pantalla. Los límites técnicos existentes no constituyen por sí solos una oferta comercial aprobada.

## Reglas que faltan definir

- Precio del evento individual y de cada paquete, teniendo en cuenta almacenamiento, procesamiento, descargas, cobro y soporte.
- Horas/días de recepción y días de conservación del álbum.
- Vigencia de los eventos comprados pero no usados.
- Reprogramación, cancelación y restitución de unidades no usadas. Evitar consumir saldo por editar un borrador o por un reintento del mismo botón.
- Qué pasa ante un reintegro o contracargo, especialmente si el evento ya comenzó. No cortar un evento activo sin una regla explícita y revisable.
- Facturación y comprobantes que corresponda entregar; no equiparar automáticamente la confirmación de pago con facturación fiscal.
- Proveedor y remitente de correos operativos. No se configuró ni envió ningún correo comercial en esta etapa.

La fecha, identidad del evento y período contratado deben impedir reutilizar una compra para celebraciones sucesivas, sin bloquear correcciones legítimas previas al inicio.

## Cambios necesarios en la aplicación

### Cuenta, compras y permisos

- Sustituir la pantalla que espera aprobación del administrador por acceso a borradores, compra y saldo.
- Mantener autorización por propietario: tener saldo no habilita administrar eventos ajenos.
- Separar el permiso de administrar un evento propio del derecho a activar otro evento. Comprar una vez no debe convertirse en una habilitación ilimitada.
- Reservar las modificaciones administrativas de saldo para excepciones con motivo e historial.
- Conservar un historial de movimientos de compra, consumo y ajustes, sin editar únicamente un contador sin trazabilidad.

### Cobro y acreditación

- Un catálogo con versiones define precio ARS y condiciones; cada orden conserva la versión comprada.
- Crear órdenes ligadas a la cuenta verificada y a una referencia única. Credenciales del proveedor solo en configuración segura del servidor.
- Verificar firma/origen de las notificaciones y consultar la orden o el pago directamente al proveedor. Validar vendedor, referencia, monto, moneda, ambiente y estado antes de acreditar.
- No habilitar por una captura de pantalla ni por parámetros de la página de retorno. Mostrar Pago pendiente cuando corresponda, sin pedir un nuevo pago por defecto.
- Procesar reintentos y notificaciones repetidas/desordenadas sin duplicar saldo. Hacer el registro y la acreditación de manera atómica.
- Incluir comprobación periódica de órdenes pendientes para recuperar notificaciones perdidas; llevar fallos persistentes a una bandeja de incidencias.
- Probar en el ambiente de pruebas del proveedor antes de habilitar cobros reales. No se realizaron pagos, reintegros ni cambios en Mercado Pago en esta etapa.

### Operación del evento

- Asistente inicial, vista previa y comprobación de QR, recepción, moderación y pantalla antes de comenzar.
- Activación atómica: dos clics o dos dispositivos no deben gastar dos unidades ni permitir gastar una misma unidad en dos eventos.
- Horarios con zona horaria explícita. Estados independientes para preparación, recepción, proyección y conservación del álbum.
- El cierre programado se debe comprobar también en las solicitudes del servidor; no depender solo de que se ejecute una tarea programada a tiempo.
- Descargar el álbum completo mediante un trabajo recuperable y un acceso temporal autorizado.
- Ayuda contextual, diagnóstico de problemas comunes y contacto de soporte con identificador de evento/error, sin incluir claves de enlace, tokens o fotos en los registros.

### Administración del negocio

- Resumen de pagos, eventos activos/próximos, almacenamiento e incidencias.
- Alertas ante fallas de cobro/acreditación, procesamiento o limpieza; no avisos por cada operación normal.
- Historial de acciones administrativas. Protección reforzada del acceso del propietario.
- Reintentos automáticos con límites y registro del resultado. El propietario atiende la excepción que no se recupera, no la operación cotidiana.

## Orden de implementación

1. Modelo de órdenes, saldo y activación; pruebas de autorización y concurrencia.
2. Integración de cobro de prueba y acreditación verificada; panel de compras y saldo.
3. Asistente, portada con planes, demostración y QR imprimible.
4. Cierre, álbum completo, avisos y conservación automática.
5. Diagnóstico, alertas e incidencias; ensayo completo de una compra/evento sin intervención del propietario.

No lanzar como autoservicio mientras falte probar el cobro con el proveedor o una explicación aprobada de límites y plazos. La versión publicada todavía no incorpora los cambios locales.

## Pruebas de aceptación adicionales

- Cliente nuevo completa una compra y activa un evento sin acción administrativa.
- Rechazo, pago pendiente, abandono y regreso al sitio no acreditan por error ni fuerzan compras duplicadas.
- Notificaciones repetidas, tardías, inválidas y fuera de orden se resuelven correctamente.
- Importe, moneda, vendedor, referencia o ambiente incorrectos no acreditan eventos.
- Compras válidas acreditan una sola vez aunque la pestaña de retorno nunca se abra.
- Dos activaciones simultáneas con saldo de uno habilitan un solo evento.
- Sin saldo se pueden ver compras/eventos propios, pero no activar eventos adicionales.
- Un cliente no puede leer compras, saldo ni eventos de otro.
- Cierre y caducidad se aplican aunque falle el ejecutor de tareas; las tareas se reintentan sin borrar archivos de otro evento ni adelantar la fecha de conservación.
- Avisos y descargas se recuperan después de un fallo; soporte recibe solamente los casos persistentes.

## Referencias de integración

- [Opciones de integración Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/getting-started)
- [Notificaciones de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications)
- [Notificaciones de Checkout Pro mediante Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications)

El adaptador implementado utiliza Preferences y Payments. No acepta notificaciones de Orders como si fueran pagos.
