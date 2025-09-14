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

        console.log(`📂 Moviendo foto: ${photo.public_id} -> ${newPublicId}`);

        // Verificar que la foto existe antes de moverla
        const existingPhoto = await cloudinary.api.resource(photo.public_id);
        console.log(`📋 Foto existe antes de mover: ${existingPhoto.public_id}`);

        // Mover la foto usando upload con URL de la foto existente
        const uploadResult = await cloudinary.uploader.upload(existingPhoto.secure_url, {
          public_id: newPublicId,
          folder: 'archived',
          invalidate: true
        });

        console.log(`✅ Foto subida a archived: ${uploadResult.public_id}`);

        // Eliminar la foto original después de subir la nueva
        await cloudinary.uploader.destroy(photo.public_id);
        console.log(`🗑️ Foto original eliminada: ${photo.public_id}`);

        // Eliminar todos los tags de la nueva foto
        await cloudinary.uploader.remove_all_tags(newPublicId);
        console.log(`🏷️ Tags eliminados de: ${newPublicId}`);

        return { success: true, filename, newPublicId: uploadResult.public_id };
      } catch (error) {
        console.error(`❌ Error archivando foto ${photo.public_id}:`, error);
        console.error(`❌ Detalles del error:`, error.message);
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
