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

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo',
      max_results: 50,
      tags: true
    });

    console.log("--- 2. Respuesta cruda de Cloudinary:", JSON.stringify(result.resources, null, 2));

    const pendingPhotos = result.resources.filter(photo => {
      // Una foto está pendiente si NO tiene la etiqueta 'moderated'
      const isModerated = photo.tags && photo.tags.includes('moderated');
      console.log(`--- 3. Verificando foto ${photo.public_id}: ¿Tiene 'moderated'?`, isModerated);
      return !isModerated;
    });

    console.log("--- 4. Fotos después del filtro:", JSON.stringify(pendingPhotos, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(pendingPhotos),
    };
  } catch (error) {
    console.error("--- 5. ERROR ATRAPADO EN get-photos ---:", error);
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};