const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  try {
    console.log("--- 1. Iniciando get-photos ---");
    
    // Extraer eventId de los parámetros de consulta
    const eventId = event.queryStringParameters?.eventId || 'DEFAULT';
    console.log("--- 2. EventId recibido:", eventId);

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo',
      max_results: 50,
      tags: true
    });

    console.log("--- 3. Respuesta cruda de Cloudinary:", JSON.stringify(result.resources, null, 2));

    const pendingPhotos = result.resources.filter(photo => {
      // Una foto está pendiente si tiene el tag pending_${eventId}
      const isPendingForEvent = photo.tags && photo.tags.includes(`pending_${eventId}`);
      console.log(`--- 4. Verificando foto ${photo.public_id}: ¿Es pending para ${eventId}?`, isPendingForEvent);
      return isPendingForEvent;
    });

    console.log("--- 5. Fotos después del filtro:", JSON.stringify(pendingPhotos, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(pendingPhotos),
    };
  } catch (error) {
    console.error("--- 6. ERROR ATRAPADO EN get-photos ---:", error);
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};