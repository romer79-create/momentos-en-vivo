const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'de537y5wb',
  api_key: '465853636538439',
  api_secret: 'HZKqEzoDAP66cP5ITLC3JAJfw9A',
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    // Obtener todas las fotos del folder
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'momentos-en-vivo',
      max_results: 500
    });

    if (result.resources.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No hay fotos para borrar', deleted: 0 })
      };
    }

    // Extraer los public_ids de todas las fotos
    const publicIds = result.resources.map(resource => resource.public_id);
    
    // Borrar todas las fotos en lotes de 100 (límite de Cloudinary)
    const deletedResults = [];
    for (let i = 0; i < publicIds.length; i += 100) {
      const batch = publicIds.slice(i, i + 100);
      const deleteResult = await cloudinary.api.delete_resources(batch);
      deletedResults.push(deleteResult);
    }

    // Contar cuántas se borraron exitosamente
    let totalDeleted = 0;
    deletedResults.forEach(result => {
      Object.values(result.deleted).forEach(status => {
        if (status === 'deleted') totalDeleted++;
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: `${totalDeleted} fotos borradas exitosamente`,
        deleted: totalDeleted,
        total: publicIds.length
      })
    };
    
  } catch (error) {
    console.error('Error borrando fotos:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al borrar las fotos' })
    };
  }
};
