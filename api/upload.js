import { IncomingForm } from 'formidable';
import { v2 as cloudinary } from 'cloudinary';

// Usamos las variables de entorno que configuraste en Vercel
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const config = {
  api: {
    bodyParser: false, // Desactivar el bodyParser de Next.js
  },
};

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

    // Leer el body como stream
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);
    console.log('--- DEBUG: Body buffer size:', bodyBuffer.length);

    // Verificar variables de entorno
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('--- ERROR: Variables de entorno de Cloudinary no configuradas');
      return res.status(500).json({
        error: 'Variables de entorno de Cloudinary no configuradas',
        details: 'Por favor configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel'
      });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        error: 'Content-Type debe ser multipart/form-data',
        received: contentType
      });
    }

    // Parsear boundary
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      return res.status(400).json({
        error: 'No se pudo encontrar boundary en Content-Type',
        contentType: contentType
      });
    }

    const boundary = '--' + boundaryMatch[1];
    console.log('--- DEBUG: Boundary:', boundary);

    // Convertir buffer a string y dividir por boundary
    const bodyStr = bodyBuffer.toString('binary');
    const parts = bodyStr.split(boundary).filter(part => {
      return part && part.trim() !== '' && part !== '--';
    });

    console.log('--- DEBUG: Número de partes encontradas:', parts.length);
    console.log('--- DEBUG: Primeros 200 caracteres del body:', bodyStr.substring(0, 200));

    let formData = {};
    let fileBuffer = null;
    let fileName = '';
    let fileContentType = 'application/octet-stream';

    // Procesar cada parte
    for (const part of parts) {
      console.log('--- DEBUG: Procesando parte:', part.substring(0, 100) + '...');

      // Dividir headers y contenido
      const doubleCRLF = '\r\n\r\n';
      const headerEndIndex = part.indexOf(doubleCRLF);

      if (headerEndIndex === -1) {
        console.log('--- DEBUG: Parte sin headers válidos, saltando');
        continue;
      }

      const headersStr = part.substring(0, headerEndIndex);
      const content = part.substring(headerEndIndex + doubleCRLF.length, part.length - 2); // Quitar CRLF final

      console.log('--- DEBUG: Headers encontrados:', headersStr.substring(0, 150));
      console.log('--- DEBUG: Content length:', content.length);

      // Parsear headers
      let fieldName = '';
      let isFile = false;

      for (const line of headersStr.split('\r\n')) {
        const trimmedLine = line.trim();
        console.log('--- DEBUG: Procesando header line:', trimmedLine);

        if (trimmedLine.startsWith('Content-Disposition:')) {
          console.log('--- DEBUG: Encontrado Content-Disposition');

          // Parsear name
          const nameMatch = trimmedLine.match(/name="([^"]+)"/);
          if (nameMatch) {
            fieldName = nameMatch[1];
            console.log('--- DEBUG: Field name encontrado:', fieldName);
          }

          // Parsear filename (si existe, es un archivo)
          const filenameMatch = trimmedLine.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            fileName = filenameMatch[1];
            isFile = true;
            console.log('--- DEBUG: Filename encontrado:', fileName, '- Es archivo!');
          }
        } else if (trimmedLine.startsWith('Content-Type:')) {
          fileContentType = trimmedLine.split(':')[1].trim();
          console.log('--- DEBUG: Content-Type encontrado:', fileContentType);
        }
      }

      console.log('--- DEBUG: Procesando campo final:', { fieldName, isFile, fileName, contentLength: content.length });

      // Procesar según el tipo de campo
      if (isFile && fieldName === 'photo') {
        fileBuffer = Buffer.from(content, 'binary');
        console.log('--- DEBUG: ARCHIVO ENCONTRADO:', fileName, fileContentType, fileBuffer.length, 'bytes');
        console.log('--- DEBUG: Primeros 50 bytes del archivo:', content.substring(0, 50));
      } else if (fieldName && !isFile) {
        formData[fieldName] = content;
        console.log('--- DEBUG: CAMPO DE TEXTO GUARDADO:', fieldName, '=', formData[fieldName]);
      } else if (fieldName && isFile) {
        console.log('--- DEBUG: Campo con archivo encontrado pero no es photo:', fieldName);
      } else {
        console.log('--- DEBUG: Campo sin name encontrado, ignorando');
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