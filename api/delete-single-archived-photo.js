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
    // Parsear el body (viene como string en Vercel)
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const params = new URLSearchParams(body);
    const public_id = params.get('public_id');

    if (!public_id) {
      return res.status(400).json({ error: 'Se requiere public_id de la foto' });
    }

    // Verificar que la foto esté en la carpeta archived
    if (!public_id.startsWith('archived/')) {
      return res.status(400).json({ error: 'Solo se pueden eliminar fotos archivadas' });
    }

    console.log(`🗑️ Eliminando foto archivada: ${public_id}`);

    // Eliminar la foto definitivamente
    const result = await cloudinary.uploader.destroy(public_id);

    if (result.result === 'ok') {
      console.log(`✅ Foto eliminada exitosamente: ${public_id}`);

      return res.status(200).json({
        success: true,
        public_id: public_id,
        message: `Foto ${public_id.split('/').pop()} eliminada permanentemente`,
        result: result,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`Error al eliminar la foto: ${result.result}`);
    }

  } catch (error) {
    console.error('❌ Error eliminando foto archivada:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}
