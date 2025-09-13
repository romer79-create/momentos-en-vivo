const cloudinary = require('cloudinary').v2;

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

  const eventId = event.queryStringParameters?.eventId;

  if (!eventId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Se requiere eventId' })
    };
  }

  try {
    // 1. Buscar todas las fotos del evento (pendientes y aprobadas)
    const result = await cloudinary.search
      .expression(`folder:momentos-en-vivo AND (tags:approved_${eventId} OR tags:pending_${eventId})`)
      .max_results(500)
      .execute();

    console.log(`Encontradas ${result.resources.length} fotos para archivar del evento ${eventId}`);
    console.log('📋 Fotos encontradas:', result.resources.map(r => ({ public_id: r.public_id, tags: r.tags })));

    // 2. Mover cada foto a carpeta de archivados y eliminar tags
    const archivePromises = result.resources.map(async (photo) => {
      try {
        // Crear nuevo nombre en carpeta archived
        const filename = photo.public_id.split('/').pop();
        const newPublicId = `archived/${filename}`;

        // Mover la foto
        await cloudinary.uploader.rename(photo.public_id, newPublicId, { invalidate: true });

        // Eliminar todos los tags para que no sea accesible por las URLs del evento
        await cloudinary.uploader.remove_all_tags(newPublicId);

        return { success: true, filename };
      } catch (error) {
        console.error(`Error archivando foto ${photo.public_id}:`, error);
        return { success: false, error: error.message };
      }
    });

    const archiveResults = await Promise.all(archivePromises);
    const successCount = archiveResults.filter(r => r.success).length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        eventId: eventId,
        totalPhotos: result.resources.length,
        archivedPhotos: successCount,
        message: `${successCount} fotos archivadas correctamente`
      })
    };

  } catch (error) {
    console.error('Error en archive-event:', error);
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
