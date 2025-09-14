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
    console.log('--- DEBUG: Body size:', req.body ? req.body.length : 'null');

    // Verificar variables de entorno
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('--- ERROR: Variables de entorno de Cloudinary no configuradas');
      return res.status(500).json({
        error: 'Variables de entorno de Cloudinary no configuradas',
        details: 'Por favor configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel'
      });
    }

    // Para Vercel, necesitamos leer el stream crudo del request
    const chunks = [];
    const contentType = req.headers['content-type'] || '';

    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        error: 'Content-Type debe ser multipart/form-data',
        received: contentType
      });
    }

    // Leer el body como stream
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyBuffer = Buffer.concat(chunks);
    console.log('--- DEBUG: Body buffer size:', bodyBuffer.length);

    if (bodyBuffer.length === 0) {
      return res.status(400).json({
        error: 'No se recibió ningún dato en el request body',
        debug: {
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length']
        }
      });
    }

    // Parsear boundary
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return res.status(400).json({
        error: 'No se pudo encontrar boundary en Content-Type',
        contentType: contentType
      });
    }

    const boundary = boundaryMatch[1];
    console.log('--- DEBUG: Boundary:', boundary);

    // Convertir buffer a string y dividir por boundary
    const bodyStr = bodyBuffer.toString();
    const boundaryDelimiter = `--${boundary}`;
    const parts = bodyStr.split(boundaryDelimiter).filter(part =>
      part && part.trim() !== '' && part.trim() !== '--'
    );

    console.log('--- DEBUG: Número de partes encontradas:', parts.length);

    let formData = {};
    let fileBuffer = null;
    let fileName = '';
    let fileContentType = '';

    // Procesar cada parte
    for (const part of parts) {
      const lines = part.split('\r\n');
      let headers = {};
      let contentStart = 0;
      let isFile = false;

      // Parsear headers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === '') {
          contentStart = i + 1;
          break;
        }

        // Content-Disposition header
        if (line.startsWith('Content-Disposition:')) {
          const dispositionMatch = line.match(/form-data; (.+)/);
          if (dispositionMatch) {
            const params = dispositionMatch[1].split(';').map(p => p.trim());
            for (const param of params) {
              if (param.startsWith('name="')) {
                headers['field-name'] = param.match(/name="([^"]+)"/)[1];
              } else if (param.startsWith('filename="')) {
                headers['filename'] = param.match(/filename="([^"]+)"/)[1];
                isFile = true;
              }
            }
          }
        }

        // Content-Type header
        else if (line.startsWith('Content-Type:')) {
          headers['content-type'] = line.split(':')[1].trim();
        }
      }

      // Extraer contenido
      const content = lines.slice(contentStart).join('\r\n').trim();
      const fieldName = headers['field-name'];

      if (isFile && fieldName === 'photo') {
        // Es un archivo
        fileBuffer = Buffer.from(content, 'binary');
        fileName = headers['filename'] || 'unknown.jpg';
        fileContentType = headers['content-type'] || 'application/octet-stream';
        console.log('--- DEBUG: Archivo encontrado:', fileName, fileContentType, fileBuffer.length, 'bytes');
      } else if (fieldName) {
        // Es un campo de texto
        formData[fieldName] = content;
        console.log('--- DEBUG: Campo encontrado:', fieldName, '=', content);
      }
    }

    const eventId = formData.eventId || 'DEFAULT';
    const message = formData.message || '';

    console.log('--- DEBUG: Final - Archivo:', fileBuffer ? 'presente' : 'null');
    console.log('--- DEBUG: Final - EventId:', eventId);
    console.log('--- DEBUG: Final - Message:', message);

    if (!fileBuffer) {
      console.log('--- ERROR: No se recibió archivo');
      return res.status(400).json({
        error: 'No se recibió ningún archivo.',
        debug: {
          partsFound: parts.length,
          boundary: boundary,
          bodySize: bodyBuffer.length
        }
      });
    }

    // Convertir el archivo a base64
    const fileStr = `data:${fileContentType};base64,${fileBuffer.toString('base64')}`;

    // Configurar opciones de subida
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
    const uploadResult = await cloudinary.uploader.upload(fileStr, uploadOptions);

    console.log('--- DEBUG: Subida exitosa:', uploadResult.secure_url);

    return res.status(200).json({
      message: '¡Foto subida con éxito!',
      imageUrl: uploadResult.secure_url,
      eventId: eventId
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
