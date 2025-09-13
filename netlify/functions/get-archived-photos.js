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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    console.log('🔍 Buscando fotos archivadas...');

    // Buscar fotos en la carpeta archived
    const result = await cloudinary.search
      .expression('folder:archived')
      .max_results(500)
      .sort_by('uploaded_at', 'desc')
      .execute();

    console.log(`📸 Encontradas ${result.resources.length} fotos archivadas`);

    // Procesar las fotos para incluir información adicional
    const archivedPhotos = result.resources.map(photo => ({
      public_id: photo.public_id,
      filename: photo.public_id.split('/').pop(),
      secure_url: photo.secure_url,
      thumbnail_url: cloudinary.url(photo.public_id, {
        width: 200,
        height: 200,
        crop: 'fill',
        quality: 'auto'
      }),
      uploaded_at: photo.uploaded_at,
      bytes: photo.bytes,
      format: photo.format,
      width: photo.width,
      height: photo.height,
      // Calcular tamaño en MB
      size_mb: (photo.bytes / (1024 * 1024)).toFixed(2)
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        totalPhotos: archivedPhotos.length,
        photos: archivedPhotos,
        message: `${archivedPhotos.length} fotos archivadas encontradas`
      })
    };

  } catch (error) {
    console.error('❌ Error obteniendo fotos archivadas:', error);
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
