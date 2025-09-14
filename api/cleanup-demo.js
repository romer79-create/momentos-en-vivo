const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Función para limpiar datos de demo expirados
// Esta función puede ser llamada por un cron job o manualmente
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido. Use POST.' })
    };
  }

  try {
    console.log('🧹 Iniciando limpieza de datos de demo expirados...');

    // Buscar todas las fotos con tags de eventos demo
    const result = await cloudinary.search
      .expression('folder:momentos-en-vivo')
      .max_results(500)
      .execute();

    console.log(`📊 Encontradas ${result.resources.length} fotos en total`);

    // Filtrar fotos de eventos demo
    const demoPhotos = result.resources.filter(photo => {
      // Buscar tags que comiencen con DEMO_
      return photo.tags && photo.tags.some(tag =>
        tag.startsWith('DEMO_') ||
        tag.startsWith('approved_DEMO_') ||
        tag.startsWith('pending_DEMO_')
      );
    });

    console.log(`🎯 Encontradas ${demoPhotos.length} fotos de eventos demo`);

    if (demoPhotos.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No se encontraron fotos de demo para limpiar',
          cleanedPhotos: 0,
          cleanedEvents: []
        })
      };
    }

    // Agrupar fotos por evento demo
    const demoEvents = {};
    demoPhotos.forEach(photo => {
      const demoTag = photo.tags.find(tag =>
        tag.startsWith('DEMO_') ||
        tag.startsWith('approved_DEMO_') ||
        tag.startsWith('pending_DEMO_')
      );

      if (demoTag) {
        // Extraer el ID del evento demo
        let eventId;
        if (demoTag.startsWith('approved_')) {
          eventId = demoTag.replace('approved_', '');
        } else if (demoTag.startsWith('pending_')) {
          eventId = demoTag.replace('pending_', '');
        } else {
          eventId = demoTag;
        }

        if (!demoEvents[eventId]) {
          demoEvents[eventId] = [];
        }
        demoEvents[eventId].push(photo);
      }
    });

    console.log(`📁 Eventos demo encontrados: ${Object.keys(demoEvents).length}`);

    // Procesar cada evento demo
    const cleanedEvents = [];
    let totalCleanedPhotos = 0;

    for (const [eventId, photos] of Object.entries(demoEvents)) {
      try {
        console.log(`🗑️ Procesando evento demo: ${eventId} (${photos.length} fotos)`);

        // Simular que el evento expiró (en producción, verificar timestamp)
        // Por ahora, limpiamos todos los eventos demo encontrados
        // En el futuro, agregar verificación de timestamp

        // Eliminar todas las fotos del evento demo
        const deletePromises = photos.map(async (photo) => {
          try {
            await cloudinary.uploader.destroy(photo.public_id);
            console.log(`✅ Eliminada foto: ${photo.public_id}`);
            return { success: true, public_id: photo.public_id };
          } catch (error) {
            console.error(`❌ Error eliminando ${photo.public_id}:`, error);
            return { success: false, public_id: photo.public_id, error: error.message };
          }
        });

        const deleteResults = await Promise.all(deletePromises);
        const successfulDeletes = deleteResults.filter(r => r.success).length;

        cleanedEvents.push({
          eventId: eventId,
          totalPhotos: photos.length,
          deletedPhotos: successfulDeletes,
          failedDeletes: photos.length - successfulDeletes
        });

        totalCleanedPhotos += successfulDeletes;

        console.log(`✅ Evento ${eventId}: ${successfulDeletes}/${photos.length} fotos eliminadas`);

      } catch (error) {
        console.error(`❌ Error procesando evento ${eventId}:`, error);
        cleanedEvents.push({
          eventId: eventId,
          error: error.message
        });
      }
    }

    console.log(`🧹 Limpieza completada: ${totalCleanedPhotos} fotos eliminadas de ${cleanedEvents.length} eventos`);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: `Limpieza completada exitosamente`,
        totalCleanedPhotos: totalCleanedPhotos,
        totalCleanedEvents: cleanedEvents.length,
        cleanedEvents: cleanedEvents,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error en limpieza de demo:', error);
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
