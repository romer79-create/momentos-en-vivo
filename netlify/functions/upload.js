const multipart = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Función de autenticación
const authenticate = (event) => {
  // Intentar múltiples formas de obtener la API key
  let apiKey = event.headers['x-api-key'] ||
               event.headers['X-API-Key'] ||
               event.headers['X-Api-Key'] ||
               event.queryStringParameters?.apiKey ||
               event.queryStringParameters?.apikey;

  const expectedApiKey = process.env.API_KEY;

  console.log('--- DEBUG AUTH: API Key recibida:', apiKey);
  console.log('--- DEBUG AUTH: API Key esperada:', expectedApiKey);
  console.log('--- DEBUG AUTH: Headers completos:', JSON.stringify(event.headers, null, 2));
  console.log('--- DEBUG AUTH: Query params:', JSON.stringify(event.queryStringParameters, null, 2));

  if (!apiKey || apiKey !== expectedApiKey) {
    console.log('--- DEBUG AUTH: Autenticación FALLIDA');
    return { statusCode: 401, headers, body: JSON.stringify({
      message: 'API key inválida o faltante',
      received: apiKey ? 'API key presente pero inválida' : 'API key faltante',
      expected: expectedApiKey ? 'API key configurada' : 'API key no configurada en entorno'
    }) };
  }

  console.log('--- DEBUG AUTH: Autenticación EXITOSA');
  return null; // Autenticación exitosa
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  // Debug: Verificar variables de entorno
  console.log('--- DEBUG ENV: API_KEY from env:', process.env.API_KEY);
  console.log('--- DEBUG ENV: CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);

  // Verificar autenticación
  const authError = authenticate(event);
  if (authError) {
    return authError;
  }

  try {
    const result = await multipart.parse(event);
    console.log('--- DEBUG: Estructura completa del resultado:', JSON.stringify(result, null, 2));
    
    const file = result.files[0];

    if (!file) { throw new Error('No se recibió ningún archivo.'); }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.contentType)) {
      throw new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF).');
    }

    // Validar tamaño del archivo (10MB máximo)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.content.length > maxSize) {
      throw new Error('Archivo demasiado grande. El tamaño máximo permitido es 10MB.');
    }
    
    // Extraer mensaje y event_id del FormData
    let message = '';
    let eventId = 'DEFAULT';
    
    // Opción 1: Directamente del resultado
    if (result.message) {
      message = result.message;
      console.log('--- DEBUG: Mensaje encontrado en result.message:', message);
    }
    if (result.eventId) {
      eventId = result.eventId;
      console.log('--- DEBUG: EventId encontrado en result.eventId:', eventId);
    }
    
    // Opción 2: En el array de fields
    if (result.fields) {
      if (result.fields.message) {
        message = result.fields.message;
        console.log('--- DEBUG: Mensaje encontrado en result.fields.message:', message);
      }
      if (result.fields.eventId) {
        eventId = result.fields.eventId;
        console.log('--- DEBUG: EventId encontrado en result.fields.eventId:', eventId);
      }
      
      // Opción 3: Buscar en todos los campos
      for (const [key, value] of Object.entries(result.fields)) {
        console.log('--- DEBUG: Campo encontrado:', key, '=', value);
        if (key === 'message') {
          message = value;
        } else if (key === 'eventId') {
          eventId = value;
        }
      }
    }
    
    console.log('--- DEBUG: Mensaje final extraído:', message);
    console.log('--- DEBUG: EventId final extraído:', eventId);
    
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;
    
    // Configurar opciones de subida con tags para evento, mensaje y estado
    const tags = [
      `event_${eventId}`,
      `pending_${eventId}`
    ];
    
    if (message) {
      tags.push(`msg:${encodeURIComponent(message)}`);
    }
    
    const uploadOptions = { 
      folder: 'momentos-en-vivo',
      tags: tags
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