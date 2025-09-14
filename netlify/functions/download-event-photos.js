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

    // Crear script de descarga automática para el navegador
    const downloadScript = `
      // Función para descargar todas las fotos automáticamente
      async function downloadAllPhotos(photos, eventId) {
        console.log(\`🚀 Iniciando descarga de \${photos.length} fotos del evento \${eventId}\`);

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          try {
            console.log(\`📥 Descargando foto \${i + 1}/${photos.length}: \${photo.filename}\`);

            // Crear enlace de descarga
            const link = document.createElement('a');
            link.href = photo.download_url;
            link.download = photo.filename;
            link.style.display = 'none';

            // Agregar al DOM y hacer clic
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Esperar entre descargas para evitar bloqueos del navegador
            if (i < photos.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

          } catch (error) {
            console.error(\`❌ Error descargando \${photo.filename}:\`, error);
          }
        }

        console.log('✅ Descarga completada');
        alert(\`✅ \${photos.length} fotos descargadas exitosamente\`);
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
      window.downloadAllPhotos = downloadAllPhotos;
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
        message: `${photos.length} fotos listas para descargar`,
        instructions: 'Usa downloadAllPhotos(photos, eventId) para descargar todas o downloadSinglePhoto(url, filename) para individual'
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
