const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Función para compartir en redes sociales
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, photoUrl, eventId, platform } = event.queryStringParameters;

    console.log('Solicitud de compartir:', { action, photoUrl, eventId, platform });

    // Obtener información del evento
    const events = JSON.parse(process.env.EVENTS_DATA || '[]');
    const eventData = events.find(e => e.id === eventId);

    if (!eventData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Evento no encontrado' }),
      };
    }

    let responseData = {};

    switch (action) {
      case 'generate-share-urls':
        // Generar URLs de compartir para diferentes plataformas
        responseData = {
          success: true,
          shareUrls: {
            facebook: generateFacebookUrl(photoUrl, eventData),
            twitter: generateTwitterUrl(photoUrl, eventData),
            linkedin: generateLinkedInUrl(photoUrl, eventData),
            whatsapp: generateWhatsAppUrl(photoUrl, eventData),
            instagram: generateInstagramUrl(photoUrl, eventData)
          },
          eventName: eventData.name,
          hashtags: generateHashtags(eventData)
        };
        break;

      case 'log-share':
        // Registrar que se compartió una foto
        console.log(`Foto compartida en ${platform}:`, {
          photoUrl,
          eventId,
          eventName: eventData.name,
          timestamp: new Date().toISOString()
        });

        responseData = {
          success: true,
          message: `Compartido en ${platform} registrado`
        };
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Acción no válida' }),
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error('Error en social-share:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    };
  }
};

// Generar URL de Facebook
function generateFacebookUrl(photoUrl, eventData) {
  const quote = `¡Mira esta foto del evento ${eventData.name}! 📸 #MomentosEnVivo #${eventData.id}`;
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(photoUrl)}&quote=${encodeURIComponent(quote)}`;
}

// Generar URL de Twitter
function generateTwitterUrl(photoUrl, eventData) {
  const text = `¡Nueva foto del evento ${eventData.name}! 📸 #MomentosEnVivo #${eventData.id}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(photoUrl)}`;
}

// Generar URL de LinkedIn
function generateLinkedInUrl(photoUrl, eventData) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(photoUrl)}`;
}

// Generar URL de WhatsApp
function generateWhatsAppUrl(photoUrl, eventData) {
  const text = `¡Mira esta foto del evento ${eventData.name}! 📸 ${photoUrl} #MomentosEnVivo #${eventData.id}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Generar URL de Instagram (solo para compartir en historias)
function generateInstagramUrl(photoUrl, eventData) {
  // Instagram no permite compartir URLs directamente desde web
  // Devolvemos la URL de la foto para copiar/pegar
  return photoUrl;
}

// Generar hashtags según el tipo de evento
function generateHashtags(eventData) {
  const baseHashtags = ['MomentosEnVivo', eventData.id];

  // Hashtags específicos por tipo de evento
  const typeHashtags = {
    boda: ['Boda', 'Wedding', 'Matrimonio'],
    cumpleanos: ['Cumpleaños', 'Birthday', 'Fiesta'],
    graduacion: ['Graduación', 'Graduation', 'Exito'],
    corporativo: ['Empresa', 'Corporate', 'Networking'],
    fiesta: ['Fiesta', 'Party', 'Celebration'],
    conferencia: ['Conferencia', 'Conference', 'Networking']
  };

  const specificHashtags = typeHashtags[eventData.type] || ['Evento'];

  return [...baseHashtags, ...specificHashtags];
}
