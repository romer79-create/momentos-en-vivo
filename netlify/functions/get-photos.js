const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

exports.handler = async (event) => {
  try {
    // Busca recursos en Cloudinary que NO tengan la etiqueta "moderated"
    const result = await cloudinary.search
      .expression('folder=momentos-en-vivo AND NOT tags=moderated')
      .sort_by('created_at', 'desc') // Muestra las más nuevas primero
      .max_results(30)
      .execute();

    return {
      statusCode: 200,
      body: JSON.stringify(result.resources),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify(error) };
  }
};