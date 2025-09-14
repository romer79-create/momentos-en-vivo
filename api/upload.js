import { IncomingForm } from 'formidable';

// Force redeploy trigger - formidable implementation
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
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Verificar variables de entorno
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('--- ERROR: Variables de entorno de Cloudinary no configuradas');
      return res.status(500).json({
        error: 'Variables de entorno de Cloudinary no configuradas',
        details: 'Por favor configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel'
      });
    }

    console.log('--- DEBUG: Iniciando parsing con formidable');

    const form = new IncomingForm({
      multiples: false,
      keepExtensions: true,
    });

    // Parsear el formulario
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('--- ERROR: Error parsing form:', err);
          reject(err);
        } else {
          console.log('--- DEBUG: Form parsed successfully');
          console.log('--- DEBUG: Fields:', fields);
          console.log('--- DEBUG: Files:', Object.keys(files));
          resolve([fields, files]);
        }
      });
    });

    // Extraer datos
    const eventId = fields.eventId?.[0] || fields.eventId || 'DEFAULT';
    const message = fields.message?.[0] || fields.message || '';
    const photoFile = files.photo?.[0] || files.photo;

    console.log('--- DEBUG: Extracted data:', { eventId, message, hasPhotoFile: !!photoFile });

    if (!photoFile) {
      console.log('--- ERROR: No se recibió archivo');
      return res.status(400).json({
        error: 'No se recibió ningún archivo.',
        debug: {
          fields: Object.keys(fields),
          files: Object.keys(files)
        }
      });
    }

    // Leer el archivo
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(photoFile.filepath);
    const fileName = photoFile.originalFilename || 'foto.jpg';
    const contentType = photoFile.mimetype || 'image/jpeg';

    console.log('--- DEBUG: File info:', {
      fileName,
      contentType,
      size: fileBuffer.length,
      path: photoFile.filepath
    });

    // Limpiar archivo temporal
    fs.unlinkSync(photoFile.filepath);

    // Convertir a base64 para Cloudinary
    const fileStr = `data:${contentType};base64,${fileBuffer.toString('base64')}`;

    // Configurar upload a Cloudinary
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

    console.log('--- DEBUG: Uploading to Cloudinary with options:', uploadOptions);

    const uploadResult = await cloudinary.uploader.upload(fileStr, uploadOptions);

    console.log('--- DEBUG: Upload successful:', uploadResult.secure_url);

    return res.status(200).json({
      message: '¡Foto subida con éxito!',
      imageUrl: uploadResult.secure_url,
      eventId: eventId
    });

  } catch (error) {
    console.error('--- ERROR: Exception in upload:', error);
    return res.status(500).json({
      error: 'Hubo un problema al subir la imagen.',
      details: error.message,
      stack: error.stack
    });
  }
}