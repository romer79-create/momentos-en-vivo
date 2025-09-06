const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

// Headers para permitir la comunicación (CORS) y los métodos correctos
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  // Responde OK a las peticiones OPTIONS pre-vuelo del navegador
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  
  const { public_id } = JSON.parse(event.body);
  try {
    // Añade las etiquetas 'moderated' y 'approved' a la imagen
    await cloudinary.uploader.add_tag('moderated', [public_id]);
    await cloudinary.uploader.add_tag('approved', [public_id]);
    return { statusCode: 200, headers, body: 'Imagen aprobada' };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};