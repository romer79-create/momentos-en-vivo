const express = require('express');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware de autenticación
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ message: 'API key inválida o faltante' });
    }
    next();
};

// Permite al servidor entender JSON que enviamos desde el panel de moderación
app.use(express.json());

// --- Configuración de Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdir(dir, { recursive: true }, (err) => {
                if (err) return cb(err);
                cb(null, 'uploads/');
            });
        } else {
            cb(null, 'uploads/');
        }
    },
    filename: (req, file, cb) => {
        // Mantener extensión original pero validar tipo
        const ext = file.originalname.split('.').pop().toLowerCase();
        cb(null, Date.now() + '.' + ext);
    }
});

// Filtro de archivos para validar tipo MIME
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido. Solo imágenes.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB límite
    }
});

// --- Carpetas Públicas ---
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/approved', express.static('approved')); // <-- LÍNEA NUEVA

// --- Rutas de la API ---

// Ruta para subir fotos desde el celular
app.post('/upload', (req, res) => {
    upload.single('photo')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ message: 'Archivo demasiado grande. Máximo 10MB.' });
                }
            }
            return res.status(400).json({ message: err.message || 'Error al subir la foto.' });
        }

        if (req.file) {
            console.log(`Foto recibida: ${req.file.filename}`);
            res.json({ message: '¡Foto subida con éxito!' });
        } else {
            res.status(400).json({ message: 'No se recibió ningún archivo.' });
        }
    });
});

// Ruta para listar fotos pendientes de moderación
app.get('/get-photos', authenticate, (req, res) => {
    const uploadDirectory = './uploads';
    fs.readdir(uploadDirectory, (err, files) => {
        if (err) {
            console.error('Error leyendo directorio uploads:', err);
            return res.status(500).json({ message: 'Error interno del servidor' });
        }
        const imageFiles = files.filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg') || file.endsWith('.gif'));
        res.json(imageFiles);
    });
});

// Ruta para listar fotos APROBADAS
app.get('/get-approved-photos', authenticate, (req, res) => {
    const approvedDirectory = './approved';
    fs.readdir(approvedDirectory, (err, files) => {
        if (err) {
            console.error('Error leyendo directorio approved:', err);
            return res.status(500).json({ message: 'Error interno del servidor' });
        }
        const imageFiles = files.filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg') || file.endsWith('.gif'));
        res.json(imageFiles);
    });
});


// Ruta para APROBAR una foto
app.post('/approve-photo', authenticate, (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).send('Falta el nombre del archivo.');
    const oldPath = `./uploads/${filename}`;
    const newPath = `./approved/${filename}`;
    const approvedDir = './approved';

    // Crear directorio de forma asíncrona si no existe
    if (!fs.existsSync(approvedDir)) {
        fs.mkdir(approvedDir, { recursive: true }, (err) => {
            if (err) return res.status(500).send('Error al crear directorio aprobado.');
            moveFile();
        });
    } else {
        moveFile();
    }

    function moveFile() {
        fs.rename(oldPath, newPath, (err) => {
            if (err) return res.status(500).send('Error al aprobar la foto.');
            console.log(`Foto aprobada: ${filename}`);
            res.send('Foto aprobada con éxito.');
        });
    }
});

// Ruta para RECHAZAR una foto
app.post('/reject-photo', authenticate, (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).send('Falta el nombre del archivo.');
    const filePath = `./uploads/${filename}`;
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).send('Error al rechazar la foto.');
        console.log(`Foto rechazada y borrada: ${filename}`);
        res.send('Foto rechazada con éxito.');
    });
});


// --- Arrancar el Servidor ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});