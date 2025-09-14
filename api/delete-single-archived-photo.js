const querystring = require('querystring');
const cloudinary = require('cloudinary').v2;

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event, context) => {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    // Parsear el body
    const params = querystring.parse(event.body);
    const { public_id } = params;

    if (!public_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Se requiere public_id de la foto' })
      };
    }

    // Verificar que la foto esté en la carpeta archived
    if (!public_id.startsWith('archived/')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Solo se pueden eliminar fotos archivadas' })
      };
    }

    console.log(`🗑️ Eliminando foto archivada: ${public_id}`);

    // Eliminar la foto definitivamente
    const result = await cloudinary.uploader.destroy(public_id);

    if (result.result === 'ok') {
      console.log(`✅ Foto eliminada exitosamente: ${public_id}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          public_id: public_id,
          message: `Foto ${public_id.split('/').pop()} eliminada permanentemente`,
          result: result,
          timestamp: new Date().toISOString()
        })
      };
    } else {
      throw new Error(`Error al eliminar la foto: ${result.result}`);
    }

  } catch (error) {
    console.error('❌ Error eliminando foto archivada:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Error interno del servidor',
        details: error.message
      })
    };
  }
};
