const cloudinary = require('cloudinary').v2;

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

    // Preparar URLs de descarga directa
    const photos = result.resources.map((photo, index) => ({
      id: photo.public_id,
      url: photo.secure_url,
      filename: `foto_${index + 1}_${photo.public_id.split('/').pop()}.jpg`,
      created_at: photo.created_at
    }));

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
        photos: photos
      })
    };

  } catch (error) {
    console.error('Error en get-event-photos-urls:', error);
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
