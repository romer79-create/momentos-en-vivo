const querystring = require('querystring');
const cloudinary = require('cloudinary').v2;

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event, context) => {
  // Solo permitir método POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  try {
    // Parsear el body
    const params = querystring.parse(event.body);
    const { eventId } = params;

    if (!eventId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Se requiere eventId' })
      };
    }

    console.log('🗑️ Eliminando evento archivado:', eventId);

    // 1. Buscar y eliminar fotos archivadas en Cloudinary
    let deletedPhotos = 0;
    let errors = [];

    try {
      // Buscar fotos con el tag de archivado del evento
      const searchResult = await cloudinary.search
        .expression(`tags:event_${eventId}_archived`)
        .execute();

      console.log(`📸 Encontradas ${searchResult.resources.length} fotos archivadas para eliminar`);

      // Eliminar cada foto encontrada
      for (const photo of searchResult.resources) {
        try {
          await cloudinary.uploader.destroy(photo.public_id);
          deletedPhotos++;
          console.log(`✅ Eliminada foto: ${photo.public_id}`);
        } catch (error) {
          console.error(`❌ Error eliminando foto ${photo.public_id}:`, error);
          errors.push(`Error eliminando ${photo.public_id}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('❌ Error buscando fotos archivadas:', error);
      errors.push(`Error buscando fotos: ${error.message}`);
    }

    // 2. También buscar y eliminar fotos con tags normales del evento (por si acaso)
    try {
      const regularSearchResult = await cloudinary.search
        .expression(`tags:event_${eventId}`)
        .execute();

      console.log(`📸 Encontradas ${regularSearchResult.resources.length} fotos regulares para eliminar`);

      for (const photo of regularSearchResult.resources) {
        try {
          await cloudinary.uploader.destroy(photo.public_id);
          deletedPhotos++;
          console.log(`✅ Eliminada foto regular: ${photo.public_id}`);
        } catch (error) {
          console.error(`❌ Error eliminando foto regular ${photo.public_id}:`, error);
          errors.push(`Error eliminando ${photo.public_id}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('❌ Error buscando fotos regulares:', error);
      errors.push(`Error buscando fotos regulares: ${error.message}`);
    }

    // 3. Log de auditoría
    console.log(`🗑️ Evento ${eventId} eliminado completamente:`);
    console.log(`   - Fotos eliminadas: ${deletedPhotos}`);
    console.log(`   - Errores: ${errors.length}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        message: `Evento ${eventId} eliminado completamente`,
        deletedPhotos,
        errors: errors.length > 0 ? errors : null,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error eliminando evento archivado:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Error interno del servidor',
        details: error.message
      })
    };
  }
};
