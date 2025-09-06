const multipart = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
  secure: true,
});

exports.handler = async (event) => {
  console.log('--- Función de subida iniciada ---'); // LOG 1

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const result = await multipart.parse(event);
    const file = result.files[0];

    if (!file) {
      throw new Error('No se recibió ningún archivo.');
    }
    
    console.log('Archivo recibido y procesado, listo para subir.'); // LOG 2
    
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;

    const uploadResult = await cloudinary.uploader.upload(fileStr, {
      folder: 'momentos-en-vivo',
    });

    console.log('Respuesta de Cloudinary:', uploadResult); // LOG 3: El más importante

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '¡Foto subida con éxito!',
        imageUrl: uploadResult.secure_url
      }),
    };
  } catch (error) {
    console.error('--- ERROR ATRAPADO ---:', error); // LOG 4
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Hubo un problema al subir la imagen.' }),
    };
  }
};