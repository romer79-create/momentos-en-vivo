const cloudinary = require('cloudinary').v2;

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Parsear el body - simplificar el parsing
    let eventId;

    if (req.method === 'POST') {
      if (req.body && typeof req.body === 'string') {
        // Si viene como string, parsearlo
        const params = new URLSearchParams(req.body);
        eventId = params.get('eventId');
      } else if (req.body && req.body.eventId) {
        // Si viene como objeto
        eventId = req.body.eventId;
      } else if (req.query && req.query.eventId) {
        // Si viene como query parameter
        eventId = req.query.eventId;
      }
    }

    console.log('📝 Body recibido:', req.body);
    console.log('📝 EventId parseado:', eventId);

    if (!eventId || eventId.trim() === '') {
      return res.status(400).json({ error: 'Se requiere eventId (parámetro faltante)' });
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

    return res.status(200).json({
      success: true,
      message: `Evento ${eventId} eliminado completamente`,
      deletedPhotos,
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error eliminando evento archivado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}
