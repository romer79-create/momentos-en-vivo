const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  try {
    // Busca recursos que SÍ tengan la etiqueta "approved"
    const result = await cloudinary.search
      .expression('folder=momentos-en-vivo AND tags=approved')
      .sort_by('created_at', 'desc') // Muestra las más nuevas primero
      .max_results(50) // Mostramos hasta 50 fotos aprobadas
      .execute();

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