const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

exports.handler = async (event) => {
  const { public_id } = JSON.parse(event.body);
  try {
    // Borra la imagen de Cloudinary
    await cloudinary.uploader.destroy(public_id);
    return { statusCode: 200, body: 'Imagen rechazada' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify(error) };
  }
};