const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  try {
    // Extraer eventId de los parámetros de consulta
    const eventId = event.queryStringParameters?.eventId || 'DEFAULT';
    console.log("EventId recibido para fotos aprobadas:", eventId);

    // Busca recursos que tengan la etiqueta "approved_${eventId}"
    const result = await cloudinary.search
      .expression(`folder=momentos-en-vivo AND tags=approved_${eventId}`)
      .sort_by('created_at', 'desc') // Muestra las más nuevas primero
      .max_results(50) // Mostramos hasta 50 fotos aprobadas
      .execute();

    console.log(`Fotos aprobadas encontradas para evento ${eventId}:`, result.resources.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.resources),
    };
  } catch (error) {
    console.error("Error al obtener fotos aprobadas:", error);
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};