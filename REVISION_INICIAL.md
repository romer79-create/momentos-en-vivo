# Momentos en Vivo — revisión inicial

Fecha: 28 de septiembre de 2026.
Repositorio: https://github.com/romer79-create/momentos-en-vivo
Copia local: D:\momentos en vivo.
Base revisada: rama main, commit a9be74f8b4ae40c5303b50243384bfcdc0e6c976, del 23 de noviembre de 2025.

## Qué hace

El proyecto permite que invitados accedan por QR, tomen o suban fotos y agreguen mensajes. Un moderador aprueba las imágenes para su proyección durante el evento. Incluye paneles de clientes y administración, demostraciones y descarga de fotos.

La versión más reciente utiliza páginas HTML y JavaScript en public, Firebase Hosting y Firestore. También conserva funciones para Storage, una versión de escritorio con Electron/Express y una implementación anterior de Netlify/Cloudinary. Son rutas de funcionamiento diferentes: no conviene asumir que todas siguen siendo compatibles.

## Hallazgos prioritarios en el código

1. **Permisos de la base de datos abiertos.** firestore.rules:7 permite leer y escribir cualquier documento sin autenticación. Si estas reglas están publicadas, los datos quedan accesibles y modificables por terceros. No se verificaron las reglas realmente desplegadas.
2. **Accesos de demostración pendientes de reemplazo.** public/admin-login.html:233 contiene un acceso de administrador fijo; también consulta contraseñas directamente en documentos de usuarios. public/admin.html:634 valida una sesión guardada en el navegador. Esto requiere autenticación real y autorización de acciones y datos por usuario y evento.
3. **La API devuelve una clave en los errores.** functions/index.js:71-86 registra la clave esperada y la incluye en la respuesta de autenticación fallida. Deben eliminarse esas exposiciones y revisar/rotar las credenciales que hayan estado activas. No se probaron claves contra el servicio publicado.
4. **Fotografías almacenadas dentro de documentos.** public/home.html:175-203 guarda la imagen completa como texto Base64 en Firestore. El límite documentado por Firebase es de 1 MiB por documento, por lo que fotografías que lo superen no se podrán guardar. Propuesta: archivos en Storage y referencias, estado y mensajes en Firestore, con límites y validación de imágenes. Fuente: [límites oficiales de Firestore](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields).
5. **Los eventos dependen de un navegador.** public/cliente-panel.html:975-978 guarda los eventos en localStorage; el panel de administración también los consulta allí. No hay una fuente compartida para esos eventos entre dispositivos. Deben persistirse asociados a su propietario y moderadores.
6. **Inicio y documentación desalineados.** El inicio de la raíz abre Electron, mientras la interfaz más reciente requiere la inicialización de Firebase Hosting. README y MULTI-TENANT-GUIDE describen soluciones diferentes. Falta establecer una única forma reproducible de ejecutar y probar la versión elegida.

## Orden propuesto para retomarlo

1. Preparar un entorno de pruebas aislado y documentar el recorrido actual: crear evento, abrir QR, enviar foto, aprobar, proyectar y descargar.
2. Implementar autenticación, roles y reglas por evento; retirar accesos de demostración y corregir la exposición de claves.
3. Unificar los eventos y las fotos: eventos y metadatos en Firestore; archivos en Storage. Revisar y conservar los datos existentes antes de migrarlos.
4. Probar dos eventos simultáneos y distintos usuarios, fotos grandes, pérdida de conexión, recarga de páginas y descarga final.
5. Actualizar dependencias y configuración de ejecución; separar los archivos históricos de la aplicación activa y actualizar las instrucciones.

## Alcance de esta revisión

Se descargó el repositorio con su historial y se registró como proyecto local independiente llamado «momentos en vivo». Se leyeron el código y la configuración. No se ejecutó una prueba funcional completa ni se verificó el estado del servicio publicado. No se modificó el código de la aplicación ni se desplegaron cambios. Este informe es el único archivo añadido por la revisión.
