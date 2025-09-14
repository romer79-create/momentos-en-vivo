const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Se requiere eventId' });
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

    return res.status(200).json({
      success: true,
      eventId: eventId,
      totalPhotos: result.resources.length,
      archivedPhotos: successCount,
      message: `${successCount} fotos archivadas correctamente`
    });

  } catch (error) {
    console.error('Error en archive-event:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}
