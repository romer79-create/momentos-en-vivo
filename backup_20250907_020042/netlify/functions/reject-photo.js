const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') { return { statusCode: 200, headers }; }
  
  const { public_id, eventId } = JSON.parse(event.body);
  const finalEventId = eventId || 'DEFAULT';
  
  try {
    // Remover el tag pending_${eventId} antes de eliminar
    await cloudinary.uploader.remove_tag(`pending_${finalEventId}`, [public_id]);
    
    // Eliminar la imagen completamente
    await cloudinary.uploader.destroy(public_id);
    
    return { statusCode: 200, headers, body: 'Imagen rechazada y eliminada' };
  } catch (error) {
    console.error('Error al rechazar imagen:', error);
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};