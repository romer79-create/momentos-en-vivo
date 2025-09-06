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
    console.log('--- DEBUG: Estructura completa del resultado:', JSON.stringify(result, null, 2));
    
    const file = result.files[0];

    if (!file) { throw new Error('No se recibió ningún archivo.'); }
    
    // Múltiples formas de extraer el mensaje del FormData
    let message = '';
    
    // Opción 1: Directamente del resultado
    if (result.message) {
      message = result.message;
      console.log('--- DEBUG: Mensaje encontrado en result.message:', message);
    }
    // Opción 2: En el array de fields
    else if (result.fields && result.fields.message) {
      message = result.fields.message;
      console.log('--- DEBUG: Mensaje encontrado en result.fields.message:', message);
    }
    // Opción 3: Buscar en todos los campos
    else if (result.fields) {
      for (const [key, value] of Object.entries(result.fields)) {
        console.log('--- DEBUG: Campo encontrado:', key, '=', value);
        if (key === 'message') {
          message = value;
          break;
        }
      }
    }
    
    console.log('--- DEBUG: Mensaje final extraído:', message);
    
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;
    
    // Configurar opciones de subida con tags para el mensaje
    const uploadOptions = { 
      folder: 'momentos-en-vivo',
      tags: message ? [`msg:${encodeURIComponent(message)}`] : []
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