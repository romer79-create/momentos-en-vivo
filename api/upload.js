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

    // Para Vercel, necesitamos manejar el body de manera diferente
    let formData = {};
    let fileBuffer = null;
    let fileName = '';
    let contentType = '';

    if (req.body && Buffer.isBuffer(req.body)) {
      console.log('--- DEBUG: Body es Buffer, procesando multipart...');

      // Parsear boundary del Content-Type
      const contentTypeHeader = req.headers['content-type'] || '';
      const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/);
      const boundary = boundaryMatch ? boundaryMatch[1] : '';

      if (!boundary) {
        console.log('--- DEBUG: No boundary found, trying alternative parsing');
        return res.status(200).json({
          message: 'Request recibido - boundary not found',
          contentType: contentTypeHeader,
          bodySize: req.body.length
        });
      }

      console.log('--- DEBUG: Boundary:', boundary);

      // Dividir el body por boundary
      const bodyStr = req.body.toString();
      const parts = bodyStr.split(`--${boundary}`).filter(part => part && part.trim() !== '' && part.trim() !== '--');

      console.log('--- DEBUG: Número de partes encontradas:', parts.length);

      for (const part of parts) {
        const lines = part.split('\r\n');
        let headers = {};
        let contentStart = 0;

        // Parsear headers
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line === '') {
            contentStart = i + 1;
            break;
          }

          if (line.includes(': ')) {
            const [key, value] = line.split(': ');
            headers[key.toLowerCase()] = value;
          } else if (line.includes('=')) {
            // Content-Disposition parsing
            const dispositionMatch = line.match(/Content-Disposition: form-data; (.+)/);
            if (dispositionMatch) {
              const params = dispositionMatch[1].split(';').map(p => p.trim());
              for (const param of params) {
                if (param.includes('name="')) {
                  headers['field-name'] = param.match(/name="([^"]+)"/)[1];
                } else if (param.includes('filename="')) {
                  headers['filename'] = param.match(/filename="([^"]+)"/)[1];
                }
              }
            }
          }
        }

        // Extraer contenido
        const content = lines.slice(contentStart).join('\r\n').trim();
        const fieldName = headers['field-name'];

        if (fieldName === 'photo' && headers['filename']) {
          // Es un archivo
          fileBuffer = Buffer.from(content, 'binary');
          fileName = headers['filename'];
          contentType = headers['content-type'] || 'application/octet-stream';
          console.log('--- DEBUG: Archivo encontrado:', fileName, contentType, fileBuffer.length, 'bytes');
        } else if (fieldName) {
          // Es un campo de texto
          formData[fieldName] = content;
          console.log('--- DEBUG: Campo encontrado:', fieldName, '=', content);
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      // Fallback para otros formatos
      formData = req.body;
      console.log('--- DEBUG: Usando fallback para body object');
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
          bodyType: typeof req.body,
          contentType: req.headers['content-type'],
          hasBody: !!req.body,
          bodySize: req.body ? req.body.length : 0
        }
      });
    }

    // Convertir el archivo a base64
    const fileStr = `data:${contentType};base64,${fileBuffer.toString('base64')}`;

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
