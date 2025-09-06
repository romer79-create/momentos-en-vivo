const multipart = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
  secure: true,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const result = await multipart.parse(event);
    const file = result.files[0];

    if (!file) { throw new Error('No se recibió ningún archivo.'); }
    
    // Obtener el mensaje si existe
    const message = result.message || '';
    
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;
    
    // Configurar opciones de subida con contexto del mensaje
    const uploadOptions = { 
      folder: 'momentos-en-vivo',
      context: message ? `message=${message}` : undefined
    };
    
    const uploadResult = await cloudinary.uploader.upload(fileStr, uploadOptions);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: '¡Foto subida con éxito!', imageUrl: uploadResult.secure_url }),
    };
  } catch (error) {
    console.error('--- ERROR ATRAPADO EN UPLOAD ---:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Hubo un problema al subir la imagen.' }),
    };
  }
};