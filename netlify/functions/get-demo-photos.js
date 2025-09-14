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
    'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Función de autenticación
  const authenticate = (event) => {
    const apiKey = event.headers['x-api-key'] || event.queryStringParameters?.apiKey;
    const expectedApiKey = process.env.API_KEY;

    if (!apiKey || apiKey !== expectedApiKey) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'API key inválida o faltante' }) };
    }
    return null; // Autenticación exitosa
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido. Use GET.' })
    };
  }

  // Verificar autenticación
  const authError = authenticate(event);
  if (authError) {
    return authError;
  }

  try {
    const eventId = event.queryStringParameters?.eventId;

    if (!eventId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'eventId es requerido' })
      };
    }

    // Verificar que sea un evento demo válido
    if (!eventId.startsWith('DEMO_')) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Solo disponible para eventos demo' })
      };
    }

    // Buscar fotos del evento demo
    const result = await cloudinary.search
      .expression(`folder:momentos-en-vivo AND tags:approved_${eventId}`)
      .sort_by('created_at', 'desc')
      .max_results(10) // Limitado para demo
      .execute();

    // Crear lista de fotos con información básica
    const photos = result.resources.map((photo, index) => ({
      id: photo.public_id,
      filename: `foto_${index + 1}.jpg`,
      thumbnail_url: cloudinary.url(photo.public_id, {
        width: 300,
        height: 200,
        crop: 'fill',
        quality: 'auto'
      }),
      created_at: photo.created_at,
      size: photo.bytes
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
        photos: photos,
        message: `Fotos de demo cargadas exitosamente`
      })
    };

  } catch (error) {
    console.error('Error obteniendo fotos demo:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Error interno del servidor'
      })
    };
  }
};
