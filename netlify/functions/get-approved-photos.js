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

  if (!apiKey || apiKey !== expectedApiKey) {
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'API key inválida o faltante' }) };
  }
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

    // Busca recursos que tengan la etiqueta "approved_${eventId}"
    const result = await cloudinary.search
      .expression(`folder=momentos-en-vivo AND tags=approved_${eventId}`)
      .sort_by('created_at', 'desc') // Muestra las más nuevas primero
      .max_results(50) // Mostramos hasta 50 fotos aprobadas
      .execute();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.resources),
    };
  } catch (error) {
    console.error("Error al obtener fotos aprobadas:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Error interno del servidor' }) };
  }
};