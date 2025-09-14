const cloudinary = require('cloudinary').v2;
const JSZip = require('jszip');
const https = require('https');
const http = require('http');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event, context) => {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    const eventId = event.queryStringParameters?.eventId || 'DEFAULT';

    if (!eventId || eventId === 'DEFAULT') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'EventId es requerido' })
      };
    }

    console.log(`📸 Buscando fotos para descargar del evento: ${eventId}`);

    // Buscar fotos aprobadas del evento
    const result = await cloudinary.search
      .expression(`folder:momentos-en-vivo AND tags:approved_${eventId}`)
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();

    console.log(`✅ Encontradas ${result.resources.length} fotos aprobadas`);

    if (!result.resources || result.resources.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'No se encontraron fotos aprobadas para este evento',
          eventId: eventId
        })
      };
    }

    // Crear lista de fotos con URLs de descarga directa
    const photos = result.resources.map((photo, index) => ({
      id: photo.public_id,
      filename: `foto_${index + 1}_${photo.public_id.split('/').pop()}.jpg`,
      original_url: photo.secure_url,
      download_url: cloudinary.url(photo.public_id, {
        quality: 'auto',
        fetch_format: 'auto',
        flags: 'attachment'
      }),
      thumbnail_url: cloudinary.url(photo.public_id, {
        width: 200,
        height: 200,
        crop: 'fill',
        quality: 'auto'
      }),
      size: photo.bytes,
      format: photo.format,
      width: photo.width,
      height: photo.height,
      uploaded_at: photo.created_at
    }));

    // Crear script de descarga con ZIP del lado del cliente
    const downloadScript = `
      // Función para descargar todas las fotos en ZIP
      async function downloadAllPhotosAsZip(photos, eventId) {
        console.log(\`🚀 Iniciando creación de ZIP con \${photos.length} fotos del evento \${eventId}\`);

        try {
          // Cargar JSZip dinámicamente desde CDN
          if (!window.JSZip) {
            console.log('📦 Cargando JSZip...');
            await loadJSZip();
          }

          const zip = new JSZip();
          const folder = zip.folder(\`fotos_evento_\${eventId}\`);

          // Función para descargar imagen como buffer
          const downloadImageBuffer = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
            return await response.arrayBuffer();
          };

          // Descargar todas las imágenes y agregar al ZIP
          const downloadPromises = photos.map(async (photo, index) => {
            try {
              console.log(\`📥 Descargando foto \${index + 1}/\${photos.length}: \${photo.filename}\`);
              const imageBuffer = await downloadImageBuffer(photo.original_url);
              folder.file(photo.filename, imageBuffer);
              return { success: true, filename: photo.filename };
            } catch (error) {
              console.error(\`❌ Error descargando \${photo.filename}:\`, error);
              return { success: false, filename: photo.filename, error: error.message };
            }
          });

          // Esperar a que se descarguen todas las imágenes
          const results = await Promise.all(downloadPromises);
          const successCount = results.filter(r => r.success).length;

          console.log(\`✅ \${successCount} fotos descargadas, generando ZIP...\`);

          // Generar el archivo ZIP
          const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
          });

          // Crear enlace de descarga para el ZIP
          const zipUrl = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = zipUrl;
          link.download = \`fotos_evento_\${eventId}_\${new Date().toISOString().split('T')[0]}.zip\`;
          link.style.display = 'none';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Limpiar URL del objeto
          setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

          console.log('✅ ZIP generado y descargado exitosamente');
          alert(\`✅ ZIP creado exitosamente con \${successCount} fotos!\`);

        } catch (error) {
          console.error('❌ Error creando ZIP:', error);
          alert(\`❌ Error creando ZIP: \${error.message}\`);
        }
      }

      // Función para cargar JSZip dinámicamente
      async function loadJSZip() {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          script.onload = () => {
            console.log('✅ JSZip cargado exitosamente');
            resolve();
          };
          script.onerror = () => {
            console.error('❌ Error cargando JSZip');
            reject(new Error('No se pudo cargar JSZip'));
          };
          document.head.appendChild(script);
        });
      }

      // Función para descargar foto individual
      function downloadSinglePhoto(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Exponer funciones globalmente
      window.downloadAllPhotosAsZip = downloadAllPhotosAsZip;
      window.downloadSinglePhoto = downloadSinglePhoto;
    `;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        eventId: eventId,
        totalPhotos: photos.length,
        photos: photos,
        downloadScript: downloadScript,
        message: `${photos.length} fotos listas para descargar en ZIP`,
        instructions: 'Usa downloadAllPhotosAsZip(photos, eventId) para descargar todas en ZIP o downloadSinglePhoto(url, filename) para individual'
      })
    };

  } catch (error) {
    console.error('❌ Error en download-event-photos:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        details: error.message
      })
    };
  }
};
