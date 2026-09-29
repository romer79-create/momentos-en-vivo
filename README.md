# Momentos en Vivo

**Actualización del 28/09/2026:** versión publicada con portada animada, preparación guiada, precios aprobados ($65.000 / $175.500 / 10 eventos a consultar), saldo por 12 meses y álbum por partes. Ver [publicación confirmada y pendientes](docs/RELEASE_2026_09_28.md), [implementación y límites](docs/PULIDO_Y_AUTOMATIZACION.md) y [referencia de Kaptura](docs/REFERENCIA_KAPTURA.md). El ensayo de Mercado Pago está limitado al administrador; los cobros reales y el borrado automático siguen desactivados. Los workers de correo están desplegados y falta comprobar su entrega desde producción.

**Un proyecto de Sylar.soluciones.** Contacto: sylar.soluciones@gmail.com · +54 9 376 410-4660.

Fotos de invitados con moderación del cliente o publicación automática opcional bajo su responsabilidad, y proyección en vivo. Sitio: https://momentos-en-vivo.web.app

La versión 3 está publicada, con seguridad, saldo de eventos y una nueva portada interactiva. La limpieza autorizada de los eventos antiguos se completó durante mantenimiento. Ver [revisión y puesta en marcha](docs/PUBLICACION.md). `REVISION_INICIAL.md` describe el estado anterior a estos cambios.

**Autoservicio:** cuentas verificadas pueden preparar borradores; el recorrido de compra y activación está implementado y probado localmente. El simulador no genera cargos. Mercado Pago tiene vendedor y secretos de prueba configurados, pero falta completar una compra auténtica de sandbox antes de habilitar ventas públicas. Ver [diseño del autoservicio](docs/AUTOSERVICIO.md) y [estado actual de pagos](docs/PAGOS.md).

**Temas e invitaciones:** catálogo de diseños editables, fondos/portadas/logos propios, invitación con ubicación y confirmación de asistencia, tarjeta PNG con QR y proyección a juego. Vista local en `/temas.html`; cada cliente accede al editor desde **Diseño e invitación**. Ver [funcionamiento, permisos y límites](docs/TEMAS_E_INVITACIONES.md).

## Uso

1. El cliente crea una cuenta y verifica su correo.
2. Prepara un borrador, compra un evento o un paquete y activa cada evento con una unidad de su saldo. El administrador puede atender excepciones.
3. Los invitados acceden con el QR del evento y envían una foto con un mensaje opcional.
4. El cliente aprueba o rechaza las fotos. Puede activar Publicación automática con aceptación expresa para publicar automáticamente las nuevas fotos. La pantalla muestra únicamente las aprobadas, manual o automáticamente.
5. Puede descargar las fotos por páginas, cerrar el evento o renovar sus enlaces.

La [guía para clientes](web/manual.html) se publica en `/manual.html`. El enlace de invitados permite enviar fotos; el enlace independiente de proyección permite ver las aprobadas. Ambos se revocan al renovar enlaces. Cerrar el evento impide nuevas cargas y lecturas por esos enlaces, mientras el propietario conserva acceso al panel.

## Aplicación activa

| Ruta | Función |
| --- | --- |
| `web/` | Interfaz de clientes, invitados, moderación y proyección |
| `public/index.html`, `web/landing.*` | Portada oscura/dorada con demostración interactiva y catálogo |
| `scripts/build.cjs` | Genera las pantallas y recursos de Hosting |
| `functions/app.js`, `functions/security.js` | API con autorización en el servidor y validación de imágenes |
| `functions/commerce.js` | Órdenes, Mercado Pago, saldo, activación y conciliación |
| `functions/index.js` | API y mantenimiento programado, Node.js 22 |
| `firestore.rules`, `storage.rules` | Impiden el acceso directo de clientes; los datos pasan por la API |
| `tests/` | Pruebas de permisos, integración y navegador |

Los archivos antiguos de Electron, Express, Netlify y las guías anteriores se conservan como antecedentes. No forman parte del inicio o despliegue actual. No usar sus instrucciones, claves ni sesiones de demostración.

## Desarrollo local

Requisitos: Node.js 22 recomendado (Node.js 24 también sirve para herramientas), npm y Java 21 para los emuladores. La primera instalación de dependencias y emuladores requiere Internet.

```powershell
npm ci
npm --prefix functions ci
npm start
```

Los emuladores usan el proyecto ficticio `demo-momentos` y escuchan solo en `127.0.0.1`. Abrir http://127.0.0.1:5000/cliente-login.html. Para preparar cuentas ficticias, en otra terminal:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
npm run demo:seed
```

| Cuenta local | Acceso |
| --- | --- |
| `cliente@example.test` | Cliente |
| `otro@example.test` | Otro cliente aislado |
| `admin@example.test` | Administrador |

Contraseña solo para estas cuentas ficticias: `Prueba-local-123456`. No existen en producción. Los datos del emulador son temporales.

### Probar desde un celular en la misma red

Con los emuladores iniciados, ejecutar `npm run preview:lan -- 192.168.1.8 5050`, reemplazando la IP por la de la computadora si cambia. Abrir `http://192.168.1.8:5050/` en el teléfono y en la PC para que los nuevos QR y enlaces compartidos usen esa dirección. Usar las cuentas de prueba existentes; la pasarela solo permite iniciar sesión, consultar la sesión y renovar sus tokens, no gestionar cuentas del emulador.

La pasarela temporal escucha únicamente en la IP privada indicada y admite conexiones de esa subred. Los emuladores y sus paneles siguen ligados a `127.0.0.1`; las rutas de administración de Auth no se publican. Se cierra con Ctrl+C y requiere que la computadora y los emuladores sigan encendidos. En esta prueba HTTP, la copia de enlaces se hace manualmente cuando el navegador no ofrece portapapeles. Los identificadores conservan aleatoriedad criptográfica aunque `randomUUID` no esté disponible.

Las pruebas de navegador admiten `TEST_BASE_URL`, `TEST_USER_EMAIL` y `TEST_OUTPUT` para repetir el recorrido de temas desde una dirección LAN con datos ficticios. No se habilita ningún túnel público ni se despliega producción.

## Pruebas

Cerrar otros emuladores antes de ejecutar estas suites:

```powershell
npm test
npm run test:integration
npm run test:landing
npx playwright install chromium
npm run test:e2e
```

En Windows se puede usar Edge instalado, sin descargar Chromium:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e
```

`test:e2e` genera la interfaz, inicia emuladores, crea cuentas ficticias y recorre el flujo en un navegador. Guarda capturas y resultados en `test-results/` (ignorado por Git). `test:browser` ejecuta solo el recorrido contra emuladores ya preparados. Si el equipo tarda en descubrir las funciones al iniciar, se puede ampliar `FUNCTIONS_DISCOVERY_TIMEOUT` a `60` segundos.

En Windows, la configuración local generada usa expresiones equivalentes para las cabeceras: corrige la normalización de rutas de Superstatic 10 y permite probar CSP de verdad. La configuración de producción conserva los patrones de Firebase Hosting. El recorrido del navegador verifica las cabeceras recibidas.

## Configuración y límites

Producción carga la configuración pública de Firebase desde Hosting. Copiar `functions/.env.example` a `functions/.env.momentos-en-vivo` y completar la clave pública de App Check y, opcionalmente, el correo del propietario inicial. Nunca subir archivos `.env` ni credenciales a Git.

- Firebase Auth exige correo verificado; los roles se validan en el servidor.
- App Check es obligatorio para subir fotos en producción; el bypass solo se usa en emuladores.
- Imágenes: hasta 20 MB seleccionados en el navegador, comprimidos antes de enviar. El servidor acepta hasta 5 MB decodificados y 25 megapíxeles, reencoda JPEG a un máximo de 1.920 px y elimina metadatos EXIF.
- Hasta 3.000 fotos por evento, 100 eventos por cuenta y 120 intentos de carga por minuto por evento/red. Son límites iniciales, no una prueba de capacidad para eventos multitudinarios.
- Moderación y ZIP: páginas de 50 fotos. Proyección: últimas 50 publicaciones, consulta cada 4 segundos y carrusel cada 7 segundos. Cada nueva publicación se destaca durante 6 segundos con el fondo difuminado, antes de incorporarse al carrusel. Las llegadas se encolan; las fotos retiradas se eliminan al actualizar. Al abrir la proyección no se repite el destaque de las fotos existentes. Respeta movimiento reducido y pausa el destaque si se oculta la pestaña.
- Publicación automática: desactivado por defecto, habilita publicación automática de nuevas fotos y mensajes. Solo el titular puede activarlo aceptando expresamente su exclusiva responsabilidad; se guardan texto, versión, usuario y fecha. Se configura desde Mis eventos y Administrar fotos. No aprueba pendientes anteriores ni vuelve a publicar fotos rechazadas por un reintento. Mantiene autenticación, enlaces privados, App Check, validación, sanitización y cuotas. La política se vuelve a leer tras guardar la imagen para que desactivarla también afecte las cargas en curso.
- Las fotos no se almacenan para uso sin conexión. La carga fallida puede reintentarse mientras se mantenga abierta la pestaña.

Los enlaces funcionan como permisos de acceso: quien tenga el de proyección podrá ver fotos aprobadas. No compartirlos fuera del evento. Las nuevas imágenes se sirven por la API sin enlaces públicos permanentes de Storage.

La consulta de proyección prioriza `publishedAt` y combina un lote por `createdAt` para conservar fotos anteriores que no tenían esa fecha. Un contador transaccional `photosVersion` permite consultar solo el evento cuando no cambian sus publicaciones, sin releer las fotos en cada sondeo; siempre se revalidan acceso y vencimiento. Antes del despliegue, publicar el índice compuesto `photos: eventId/status/publishedAt` incluido en `firestore.indexes.json` y esperar a que esté listo. Una foto aprobada tarde también entra en las últimas 50 publicaciones. Los cambios de estado de fotos deben pasar por la API para actualizar ese contador.

Pruebas específicas: `npm test` incluye la cola de proyección; `npm run test:live` recorre consentimiento, envío, destaque, cola, retiro y vuelta a revisión manual en navegador. `tests/moderation.test.cjs` usa cuentas y eventos aislados y elimina únicamente sus propios datos al terminar. Para ejecutar el navegador en la red, definir `TEST_BASE_URL` y `TEST_USER_EMAIL` con una cuenta de prueba; los resultados y capturas quedan en `test-results/live/`. La integración general incluye un reinicio de datos: ejecutarla solo en emuladores descartables, nunca sobre una sesión de pruebas que se quiera conservar.
