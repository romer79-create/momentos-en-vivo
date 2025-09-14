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
    console.log('--- DEBUG: Request method:', req.method);
    console.log('--- DEBUG: Content-Type:', req.headers['content-type']);
    console.log('--- DEBUG: Body type:', typeof req.body);
    console.log('--- DEBUG: Body keys:', req.body ? Object.keys(req.body) : 'null');

    // Verificar variables de entorno
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('--- ERROR: Variables de entorno de Cloudinary no configuradas');
      return res.status(500).json({
        error: 'Variables de entorno de Cloudinary no configuradas',
        details: 'Por favor configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel'
      });
    }

    let file, message = '', eventId = 'DEFAULT';

    // Intentar diferentes métodos de parsing según lo que llegue
    if (req.body && typeof req.body === 'object') {
      // Método 1: Si viene como objeto con campos directos
      file = req.body.photo || req.body.file;
      message = req.body.message || '';
      eventId = req.body.eventId || 'DEFAULT';

      console.log('--- DEBUG: Método 1 - Archivo desde req.body:', file ? 'presente' : 'null');
    }

    // Si no tenemos archivo, intentar con FormData (aunque Vercel lo maneja diferente)
    if (!file && req.body && Buffer.isBuffer(req.body)) {
      console.log('--- DEBUG: Body es Buffer, intentando parsear como multipart');

      // Para desarrollo temporal, devolver info sobre lo que llega
      return res.status(200).json({
        message: 'Request recibido - debugging multipart',
        contentType: req.headers['content-type'],
        bodySize: req.body.length,
        hasBuffer: Buffer.isBuffer(req.body),
        cloudinaryConfigured: !!(process.env.CLOUDINARY_CLOUD_NAME)
      });
    }

    console.log('--- DEBUG: Archivo final:', file ? 'presente' : 'null');
    console.log('--- DEBUG: Mensaje:', message);
    console.log('--- DEBUG: EventId:', eventId);

    if (!file) {
      console.log('--- ERROR: No se recibió archivo');
      return res.status(400).json({
        error: 'No se recibió ningún archivo.',
        debug: {
          bodyType: typeof req.body,
          contentType: req.headers['content-type'],
          hasBody: !!req.body
        }
      });
    }

    // Para archivos base64 (desde testing directo)
    if (typeof file === 'string' && file.startsWith('data:')) {
      console.log('--- DEBUG: Procesando archivo base64');

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

      console.log('--- DEBUG: Subiendo a Cloudinary...');
      const uploadResult = await cloudinary.uploader.upload(file, uploadOptions);

      console.log('--- DEBUG: Subida exitosa:', uploadResult.secure_url);

      return res.status(200).json({
        message: '¡Foto subida con éxito!',
        imageUrl: uploadResult.secure_url,
        eventId: eventId
      });
    }

    // Para archivos reales (cuando el parsing multipart funcione)
    console.log('--- DEBUG: Archivo no es base64, tipo:', typeof file);
    return res.status(200).json({
      message: 'Archivo recibido (tipo no base64)',
      fileType: typeof file,
      message: message,
      eventId: eventId,
      cloudinaryReady: !!(process.env.CLOUDINARY_CLOUD_NAME)
    });

  } catch (error) {
    console.error('--- ERROR ATRAPADO EN UPLOAD ---', error);
    return res.status(500).json({
      error: 'Hubo un problema al subir la imagen.',
      details: error.message,
      stack: error.stack
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
