const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
};

// Función de autenticación
const authenticate = (event) => {
  const apiKey = event.headers['x-api-key'] || event.queryStringParameters?.apiKey;
  const expectedApiKey = process.env.API_KEY;

  console.log('--- DEBUG AUTH get-photos: API Key recibida:', apiKey);
  console.log('--- DEBUG AUTH get-photos: API Key esperada:', expectedApiKey);
  console.log('--- DEBUG AUTH get-photos: Headers:', JSON.stringify(event.headers, null, 2));

  if (!apiKey || apiKey !== expectedApiKey) {
    console.log('--- DEBUG AUTH get-photos: Autenticación FALLIDA');
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'API key inválida o faltante' }) };
  }

  console.log('--- DEBUG AUTH get-photos: Autenticación EXITOSA');
  return null; // Autenticación exitosa
};

exports.handler = async (event) => {
  // Verificar autenticación
  const authError = authenticate(event);
  if (authError) {
    return authError;
  }

  try {
    // Extraer eventId de los parámetros de consulta
    const eventId = event.queryStringParameters?.eventId || 'DEFAULT';

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo',
      max_results: 50,
      tags: true
    });

    const pendingPhotos = result.resources.filter(photo => {
      // Una foto está pendiente si tiene el tag pending_${eventId}
      return photo.tags && photo.tags.includes(`pending_${eventId}`);
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(pendingPhotos),
    };
  } catch (error) {
    console.error("Error en get-photos:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Error interno del servidor' }) };
  }
};