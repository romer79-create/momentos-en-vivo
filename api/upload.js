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

    let file, message = '', eventId = 'DEFAULT';

    // Manejar diferentes formatos de entrada
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Parsear multipart form data
      const boundary = req.headers['content-type'].split('boundary=')[1];
      const parts = parseMultipart(req.body, boundary);

      for (const part of parts) {
        if (part.name === 'photo') {
          file = {
            data: part.data,
            type: part.contentType,
            name: part.filename
          };
        } else if (part.name === 'message') {
          message = part.data.toString();
        } else if (part.name === 'eventId') {
          eventId = part.data.toString();
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      // Si viene como JSON (para testing)
      file = req.body.photo;
      message = req.body.message || '';
      eventId = req.body.eventId || 'DEFAULT';
    }

    console.log('--- DEBUG: Archivo procesado:', file ? file.name : 'null');
    console.log('--- DEBUG: Mensaje procesado:', message);
    console.log('--- DEBUG: EventId procesado:', eventId);

    if (!file || !file.data) {
      throw new Error('No se recibió ningún archivo.');
    }

    // Convertir el archivo a base64
    const fileStr = `data:${file.type};base64,${file.data.toString('base64')}`;

    // Configurar opciones de subida con tags para evento, mensaje y estado
    const tags = [
      `event_${eventId}`,
      `pending_${eventId}`
    ];

    if (message && message.trim()) {
      tags.push(`msg:${encodeURIComponent(message)}`);
    }

    const uploadOptions = {
      folder: 'momentos-en-vivo',
      tags: tags
    };

    console.log('--- DEBUG: Subiendo a Cloudinary con opciones:', uploadOptions);
    const uploadResult = await cloudinary.uploader.upload(fileStr, uploadOptions);

    console.log('--- DEBUG: Subida exitosa:', uploadResult.secure_url);

    return res.status(200).json({
      message: '¡Foto subida con éxito!',
      imageUrl: uploadResult.secure_url
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
