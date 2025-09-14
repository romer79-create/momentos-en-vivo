import { IncomingForm } from 'formidable';
import { v2 as cloudinary } from 'cloudinary';

// Usamos las variables de entorno que configuraste en Vercel
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuración para que Vercel no interfiera con formidable
export const config = {
    api: {
        bodyParser: false,
    }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const data = await new Promise((resolve, reject) => {
            const form = new IncomingForm();
            form.parse(req, (err, fields, files) => {
                if (err) return reject(err);
                resolve({ fields, files });
            });
        });

        // 'formidable' agrupa los archivos en el objeto 'files'
        // y los campos de texto en 'fields'.
        const file = data.files.photo;

        if (!file) {
            return res.status(400).json({ message: 'No se recibió ningún archivo bajo la clave "photo".' });
        }

        // formidable guarda el archivo temporalmente y nos da su ruta (filepath)
        const uploadResult = await cloudinary.uploader.upload(file.filepath, {
            folder: 'momentos-en-vivo',
        });

        return res.status(200).json({
            message: '¡Foto subida con éxito!',
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        console.error('--- ERROR ATRAPADO EN UPLOAD ---:', error);
        return res.status(500).json({ error: 'Hubo un problema al subir la imagen.' });
    }
}