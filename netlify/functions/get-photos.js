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
    // NUEVO MÉTODO: Pide los recursos directamente de la carpeta
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo', // La carpeta que queremos
      max_results: 50,
      tags: true // Le pedimos que nos incluya las etiquetas (tags)
    });

    // FILTRO MANUAL: Filtramos las fotos que NO tengan la etiqueta "moderated"
    const pendingPhotos = result.resources.filter(photo => {
      return !photo.tags.includes('moderated');
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(pendingPhotos),
    };
  } catch (error) {
    console.error("Error al obtener fotos:", error);
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};