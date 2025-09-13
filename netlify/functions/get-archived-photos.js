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
    console.log('📁 Recursos encontrados:', result.resources.map(r => r.public_id));

    // También buscar en la carpeta momentos-en-vivo para debug
    const momentosResult = await cloudinary.search
      .expression('folder:momentos-en-vivo')
      .max_results(10)
      .execute();

    console.log(`🔍 Debug: ${momentosResult.resources.length} fotos en momentos-en-vivo`);
    console.log('🔍 Fotos en momentos-en-vivo:', momentosResult.resources.map(r => ({ public_id: r.public_id, tags: r.tags })));

    // También buscar TODAS las fotos sin filtro de carpeta para debug
    const allPhotosResult = await cloudinary.search
      .expression('')
      .max_results(20)
      .sort_by('uploaded_at', 'desc')
      .execute();

    console.log(`🔍 Debug: Total de fotos en Cloudinary: ${allPhotosResult.resources.length}`);
    console.log('🔍 Todas las fotos recientes:', allPhotosResult.resources.map(r => ({ public_id: r.public_id, folder: r.public_id.split('/')[0] })));

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
