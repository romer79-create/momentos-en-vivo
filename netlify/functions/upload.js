const multipart = require('lambda-multipart-parser');
const cloudinary = require('cloudinary').v2;

// --- CONFIGURACIÓN DE CLOUDINARY ---
// Reemplaza estos valores con tus credenciales reales
cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
  secure: true,
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. Parseamos la imagen que viene en la petición con el nuevo paquete
    const result = await multipart.parse(event);
    const file = result.files[0];

    if (!file) {
      throw new Error('No se recibió ningún archivo.');
    }

    // 2. Preparamos la imagen para subirla a Cloudinary desde la memoria
    const fileStr = `data:${file.contentType};base64,${file.content.toString('base64')}`;

    // 3. Subimos la imagen a Cloudinary
    const uploadResult = await cloudinary.uploader.upload(fileStr, {
      folder: 'momentos-en-vivo', // Opcional: crea una carpeta en Cloudinary
    });

    // 4. Devolvemos una respuesta exitosa
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '¡Foto subida con éxito!',
        imageUrl: uploadResult.secure_url
      }),
    };
  } catch (error) {
    console.error('Error en la subida:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Hubo un problema al subir la imagen.' }),
    };
  }
};