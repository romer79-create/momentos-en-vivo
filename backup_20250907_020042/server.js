const express = require('express');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Permite al servidor entender JSON que enviamos desde el panel de moderación
app.use(express.json());

// --- Configuración de Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '.jpg');
    }
});
const upload = multer({ storage: storage });

// --- Carpetas Públicas ---
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/approved', express.static('approved')); // <-- LÍNEA NUEVA

// --- Rutas de la API ---

// Ruta para subir fotos desde el celular
app.post('/upload', upload.single('photo'), (req, res) => {
    if (req.file) {
        console.log(`Foto recibida: ${req.file.filename}`);
        res.json({ message: '¡Foto subida con éxito!' });
    } else {
        res.status(400).json({ message: 'Error al subir la foto.' });
    }
});

// Ruta para listar fotos pendientes de moderación
app.get('/get-photos', (req, res) => {
    const uploadDirectory = './uploads';
    fs.readdir(uploadDirectory, (err, files) => {
        if (err) return res.json([]);
        const imageFiles = files.filter(file => file.endsWith('.jpg') || file.endsWith('.png'));
        res.json(imageFiles);
    });
});

// Ruta para listar fotos APROBADAS
app.get('/get-approved-photos', (req, res) => { // <-- RUTA NUEVA
    const approvedDirectory = './approved';
    fs.readdir(approvedDirectory, (err, files) => {
        if (err) return res.json([]);
        const imageFiles = files.filter(file => file.endsWith('.jpg') || file.endsWith('.png'));
        res.json(imageFiles);
    });
});


// Ruta para APROBAR una foto
app.post('/approve-photo', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).send('Falta el nombre del archivo.');
    const oldPath = `./uploads/${filename}`;
    const newPath = `./approved/${filename}`;
    const approvedDir = './approved';
    if (!fs.existsSync(approvedDir)) fs.mkdirSync(approvedDir);
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).send('Error al aprobar la foto.');
        console.log(`Foto aprobada: ${filename}`);
        res.send('Foto aprobada con éxito.');
    });
});

// Ruta para RECHAZAR una foto
app.post('/reject-photo', (req, res) => {
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