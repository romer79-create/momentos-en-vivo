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
  const { public_id } = JSON.parse(event.body);
  try {
    await cloudinary.uploader.add_tag('moderated', [public_id]);
    await cloudinary.uploader.add_tag('approved', [public_id]);
    return { statusCode: 200, headers, body: 'Imagen aprobada' };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify(error) };
  }
};