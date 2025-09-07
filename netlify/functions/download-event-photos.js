const cloudinary = require('cloudinary').v2;
const JSZip = require('jszip');

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

    // Obtener todas las fotos aprobadas del evento
    const result = await cloudinary.search
      .expression(`folder=momentos-en-vivo AND tags=approved_${eventId}`)
      .sort_by([['created_at', 'desc']])
      .max_results(500)
      .execute();

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

    // Crear ZIP con las fotos
    const zip = new JSZip();
    const folder = zip.folder(`fotos_evento_${eventId}`);

    // Descargar cada imagen y agregarla al ZIP
    const downloadPromises = result.resources.map(async (photo, index) => {
      try {
        const response = await fetch(photo.secure_url);
        const arrayBuffer = await response.arrayBuffer();
        const filename = `foto_${index + 1}_${photo.public_id.split('/').pop()}.jpg`;
        folder.file(filename, arrayBuffer);
        return { success: true, filename };
      } catch (error) {
        console.error(`Error descargando foto ${photo.public_id}:`, error);
        return { success: false, error: error.message };
      }
    });

    const downloadResults = await Promise.all(downloadPromises);
    const successCount = downloadResults.filter(r => r.success).length;

    // Generar el ZIP
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Convertir a base64 para enviar
    const base64Zip = zipBuffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        eventId: eventId,
        totalPhotos: result.resources.length,
        downloadedPhotos: successCount,
        zipData: base64Zip,
        filename: `fotos_evento_${eventId}.zip`
      })
    };

  } catch (error) {
    console.error('Error en download-event-photos:', error);
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
