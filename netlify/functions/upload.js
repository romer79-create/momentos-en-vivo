const multipart = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
  secure: true,
});

// Headers para permitir la comunicación (CORS) y los métodos correctos
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  console.log('--- Función de subida iniciada ---');

  // AÑADIDO: Responde OK a las peticiones OPTIONS pre-vuelo del navegador
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const result = await multipart.parse(event);
    const file = result.files[0];

    if (!file) {
      throw new Error('No se recibió ningún archivo.');
    }
    
    console.log('Archivo recibido y procesado, listo para subir.');
    
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;

    const uploadResult = await cloudinary.uploader.upload(fileStr, {
      folder: 'momentos-en-vivo',
    });

    console.log('Respuesta de Cloudinary:', uploadResult);

    return {
      statusCode: 200,
      headers, // AÑADIDO: Incluye los headers en la respuesta exitosa
      body: JSON.stringify({
        message: '¡Foto subida con éxito!',
        imageUrl: uploadResult.secure_url
      }),
    };
  } catch (error) {
    console.error('--- ERROR ATRAPADO ---:', error);
    return {
      statusCode: 500,
      headers, // AÑADIDO: Incluye los headers en la respuesta de error
      body: JSON.stringify({ error: 'Hubo un problema al subir la imagen.' }),
    };
  }
};