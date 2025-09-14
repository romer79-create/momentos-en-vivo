const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
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
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('--- DEBUG: Request headers:', req.headers);
    console.log('--- DEBUG: Content-Type:', req.headers['content-type']);

    // Para Vercel, intentemos una aproximación más simple
    let file, message = '', eventId = 'DEFAULT';

    // Verificar si tenemos el body como Buffer (Vercel)
    if (req.body && Buffer.isBuffer(req.body)) {
      console.log('--- DEBUG: Body is Buffer, length:', req.body.length);

      // Para este caso, vamos a devolver una respuesta temporal
      // indicando que necesitamos las credenciales de Cloudinary
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('--- ERROR: Variables de entorno de Cloudinary no configuradas');
        return res.status(500).json({
          error: 'Variables de entorno de Cloudinary no configuradas',
          details: 'Por favor configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel'
        });
      }

      // Respuesta temporal mientras arreglamos el parsing
      return res.status(200).json({
        message: 'Upload endpoint recibido (parsing en desarrollo)',
        received: true,
        contentType: req.headers['content-type'],
        bodySize: req.body.length
      });
    }

    // Si viene como objeto (para testing)
    if (req.body && typeof req.body === 'object') {
      file = req.body.photo;
      message = req.body.message || '';
      eventId = req.body.eventId || 'DEFAULT';
    }

    console.log('--- DEBUG: Archivo procesado:', file ? 'presente' : 'null');
    console.log('--- DEBUG: Mensaje procesado:', message);
    console.log('--- DEBUG: EventId procesado:', eventId);

    if (!file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    // Para archivos base64 (desde testing)
    if (typeof file === 'string' && file.startsWith('data:')) {
      const uploadOptions = {
        folder: 'momentos-en-vivo',
        tags: [
          `event_${eventId}`,
          `pending_${eventId}`
        ]
      };

      if (message && message.trim()) {
        uploadOptions.tags.push(`msg:${encodeURIComponent(message)}`);
      }

      console.log('--- DEBUG: Subiendo a Cloudinary con opciones:', uploadOptions);
      const uploadResult = await cloudinary.uploader.upload(file, uploadOptions);

      console.log('--- DEBUG: Subida exitosa:', uploadResult.secure_url);

      return res.status(200).json({
        message: '¡Foto subida con éxito!',
        imageUrl: uploadResult.secure_url
      });
    }

    // Para archivos reales, devolver mensaje temporal
    return res.status(200).json({
      message: 'Archivo recibido (procesamiento multipart en desarrollo)',
      fileType: typeof file,
      message: message,
      eventId: eventId
    });

  } catch (error) {
    console.error('--- ERROR ATRAPADO EN UPLOAD ---', error);
    return res.status(500).json({
      error: 'Hubo un problema al subir la imagen.',
      details: error.message
    });
  }
}

// Función auxiliar para parsear multipart data
function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryStr = `--${boundary}`;
  const lines = body.toString().split('\r\n');

  let currentPart = null;
  let inHeaders = false;
  let dataBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === boundaryStr) {
      // Fin de la parte anterior
      if (currentPart && dataBuffer.length > 0) {
        currentPart.data = Buffer.concat(dataBuffer);
        parts.push(currentPart);
      }

      // Nueva parte
      currentPart = {};
      inHeaders = true;
      dataBuffer = [];
    } else if (line === `${boundaryStr}--`) {
      // Fin del multipart
      if (currentPart && dataBuffer.length > 0) {
        currentPart.data = Buffer.concat(dataBuffer);
        parts.push(currentPart);
      }
      break;
    } else if (inHeaders) {
      if (line === '') {
        // Fin de los headers
        inHeaders = false;
      } else if (line.startsWith('Content-Disposition:')) {
        // Parsear Content-Disposition
        const disposition = line.split(';').map(s => s.trim());
        for (const disp of disposition) {
          if (disp.startsWith('name="')) {
            currentPart.name = disp.slice(6, -1);
          } else if (disp.startsWith('filename="')) {
            currentPart.filename = disp.slice(10, -1);
          }
        }
      } else if (line.startsWith('Content-Type:')) {
        currentPart.contentType = line.split(':')[1].trim();
      }
    } else {
      // Datos de la parte
      if (currentPart && !inHeaders) {
        dataBuffer.push(Buffer.from(line + '\r\n'));
      }
    }
  }

  return parts;
}
