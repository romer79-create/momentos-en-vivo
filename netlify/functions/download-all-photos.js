const cloudinary = require('cloudinary').v2;
const JSZip = require('jszip');

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    // Obtener todas las fotos del folder
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo',
      max_results: 500,
      tags: true
    });

    if (result.resources.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No hay fotos para descargar' })
      };
    }

    // Crear ZIP con todas las fotos
    const zip = new JSZip();
    const folder = zip.folder('momentos-en-vivo');
    
    for (let i = 0; i < result.resources.length; i++) {
      const photo = result.resources[i];
      
      // Extraer mensaje de los tags si existe
      let message = '';
      if (photo.tags && Array.isArray(photo.tags)) {
        const messageTag = photo.tags.find(tag => tag.startsWith('msg:'));
        if (messageTag) {
          message = decodeURIComponent(messageTag.substring(4));
        }
      }
      
      // Descargar la imagen
      const response = await fetch(photo.secure_url);
      const imageBuffer = await response.arrayBuffer();
      
      // Crear nombre de archivo con mensaje si existe
      const fileName = message 
        ? `${photo.public_id.replace('momentos-en-vivo/', '')}_${message.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
        : `${photo.public_id.replace('momentos-en-vivo/', '')}.jpg`;
      
      folder.file(fileName, imageBuffer);
    }
    
    // Generar el ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Subir el ZIP a Cloudinary temporalmente
    const zipUpload = await cloudinary.uploader.upload(
      `data:application/zip;base64,${zipBuffer.toString('base64')}`,
      {
        resource_type: 'raw',
        folder: 'temp',
        public_id: `momentos-en-vivo-${Date.now()}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600 // Expira en 1 hora
      }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        downloadUrl: zipUpload.secure_url,
        photoCount: result.resources.length
      })
    };
    
  } catch (error) {
    console.error('Error creando descarga:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al preparar la descarga' })
    };
  }
};
