const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

admin.initializeApp();

// Inicializar Firestore explícitamente
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));

// Evitar interferencias con multipart/form-data:
// Aplicamos el parser JSON solo cuando NO es multipart.
const jsonParser = express.json({ limit: '15mb' });
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return next();
  return jsonParser(req, res, next);
});

// Middleware para procesar raw body en multipart requests
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    let data = [];
    req.on('data', chunk => {
      data.push(chunk);
    });
    req.on('end', () => {
      req.rawBody = Buffer.concat(data);
      next();
    });
  } else {
    next();
  }
});

// También habilitamos urlencoded para otros formularios simples
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Ensure compatibility whether the request comes via:
// - Hosting rewrite to "/api/**" (path keeps the "/api" prefix)
// - Direct Cloud Functions URL "/get-photos", "/upload", etc.
// This middleware strips the leading "/api" so our routes work in both cases.
app.use((req, _res, next) => {
  const before = { url: req.url, originalUrl: req.originalUrl };
  // Normalizar prefijos cuando se accede vía Hosting rewrite o URL directa:
  // Posibles rutas entrantes: /api/get-photos, /api1/api/get-photos, /api1/get-photos
  let url = req.url || '';
  if (url.startsWith('/api1/')) url = url.replace(/^\/api1/, '');
  if (url === '/api1') url = '/';
  if (url.startsWith('/api/')) url = url.replace(/^\/api/, '');
  if (url === '/api') url = '/';
  req.url = url;
  console.log('[ROUTE NORMALIZER]', before, '=>', { url: req.url });
  next();
});

// Configurar multer para manejo de archivos con configuración más simple
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

// Función de autenticación
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  // Para desarrollo local, también buscar en variables de entorno
  const expectedApiKey = functions.config().api?.key || process.env.API_KEY || 'MiClaveSuperSecreta2024!@#';

  console.log('[AUTH] API Key recibida:', apiKey);
  console.log('[AUTH] API Key esperada:', expectedApiKey);

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({
      message: 'API key inválida o faltante',
      received: apiKey ? 'API key presente pero inválida' : 'API key faltante',
      expected: expectedApiKey
    });
  }
  next();
};

// Función para validar archivos
const validateFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  }

  // Ampliamos tipos permitidos para evitar errores 400 en móviles (HEIC/HEIF/WEBP/AVIF)
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif'
  ];
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: 'Tipo de archivo no permitido. Formatos admitidos: JPEG, PNG, GIF, WEBP, HEIC/HEIF, AVIF.'
    });
  }

  next();
};

 // UPLOAD PHOTO (manejo explícito del callback de Multer para capturar errores como "Unexpected end of form")
app.post('/upload', authenticate, (req, res) => {
  console.log('[UPLOAD] content-type=', req.headers['content-type']);
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      console.error('[UPLOAD MULTER ERROR]', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'La imagen supera el tamaño máximo permitido (10MB).',
          code: err.code
        });
      }
      return res.status(400).json({
        error: 'Error procesando el formulario de subida',
        details: String(err?.message || err)
      });
    }

    try {
      // Validaciones manuales tras Multer
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
      }

      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/avif'
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: 'Tipo de archivo no permitido. Formatos admitidos: JPEG, PNG, GIF, WEBP, HEIC/HEIF, AVIF.'
        });
      }

      const bucket = admin.storage().bucket();
      const eventId = req.body.eventId || 'DEFAULT';
      const message = req.body.message || '';

      // Generar nombre único para el archivo
      const fileName = `photos/${eventId}/${Date.now()}_${req.file.originalname}`;
      const file = bucket.file(fileName);

      // Metadata para el archivo
      const metadata = {
        contentType: req.file.mimetype,
        metadata: {
          eventId: eventId,
          status: 'pending',
          message: message,
          uploadedAt: new Date().toISOString(),
          firebaseStorageDownloadTokens: Math.random().toString(36).substring(2)
        }
      };

      // Subir archivo a Firebase Storage (sin ACL pública, compatible con UBLA)
      await file.save(req.file.buffer, {
        metadata: metadata,
        validation: 'md5'
      });

      // Construir URL pública usando token
      const bucketName = admin.storage().bucket().name;
      const encodedPath = encodeURIComponent(fileName);
      const token = metadata.metadata.firebaseStorageDownloadTokens;
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;

      // Guardar metadata en Firestore para búsqueda
      const photoData = {
        fileName: fileName,
        url: url,
        eventId: eventId,
        status: 'pending',
        message: message,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        tags: [`event_${eventId}`, `pending_${eventId}`]
      };
      if (message) {
        photoData.tags.push(`msg:${message}`);
      }

      await admin.firestore().collection('photos').add(photoData);

      return res.json({
        message: '¡Foto subida con éxito!',
        imageUrl: url,
        fileName: fileName
      });
    } catch (error) {
      console.error('Error al subir foto:', error);
      return res.status(500).json({ error: 'Hubo un problema al subir la imagen.' });
    }
  });
});

// UPLOAD PHOTO BASE64 (JSON)
app.post('/upload-base64', authenticate, async (req, res) => {
  try {
    const { imageBase64, eventId: rawEventId, message: rawMessage } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 es requerido' });
    }

    // Parsear Data URL (data:image/xxx;base64,...) o base64 plano
    let mime = 'image/jpeg';
    let base64Data = imageBase64;
    const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(imageBase64);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Límite de tamaño 10MB
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'La imagen supera el tamaño máximo permitido (10MB).' });
    }

    // Validar MIME permitido
    const allowedTypes = [
      'image/jpeg','image/jpg','image/png','image/gif',
      'image/webp','image/heic','image/heif','image/avif'
    ];
    if (!allowedTypes.includes(mime)) {
      return res.status(400).json({
        error: 'Tipo de archivo no permitido. Formatos admitidos: JPEG, PNG, GIF, WEBP, HEIC/HEIF, AVIF.'
      });
    }

    const eventId = rawEventId || 'DEFAULT';
    const message = rawMessage || '';

    const bucket = admin.storage().bucket();
    const extMap = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
      'image/heif': 'heif', 'image/avif': 'avif'
    };
    const ext = extMap[mime] || 'jpg';
    const fileName = `photos/${eventId}/${Date.now()}_upload.${ext}`;
    const file = bucket.file(fileName);

    // Metadata para el archivo
    const metadata = {
      contentType: mime,
      metadata: {
        eventId: eventId,
        status: 'pending',
        message: message,
        uploadedAt: new Date().toISOString(),
        firebaseStorageDownloadTokens: Math.random().toString(36).substring(2)
      }
    };

    // Subir archivo a Firebase Storage (sin ACL pública, compatible con UBLA)
    await file.save(buffer, {
      metadata: metadata,
      validation: 'md5'
    });

    // Construir URL pública usando token
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(fileName);
    const token = metadata.metadata.firebaseStorageDownloadTokens;
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;

    // Guardar metadata en Firestore para búsqueda
    const photoData = {
      fileName: fileName,
      url: url,
      eventId: eventId,
      status: 'pending',
      message: message,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      tags: [`event_${eventId}`, `pending_${eventId}`]
    };
    if (message) {
      photoData.tags.push(`msg:${message}`);
    }

    await admin.firestore().collection('photos').add(photoData);

    return res.json({
      message: '¡Foto subida con éxito!',
      imageUrl: url,
      fileName: fileName
    });
  } catch (err) {
    console.error('[UPLOAD-BASE64 ERROR]', err);
    return res.status(500).json({ error: 'Hubo un problema al subir la imagen.' });
  }
});

// GET APPROVED PHOTOS
app.get('/get-approved-photos', authenticate, async (req, res) => {
  try {
    const eventId = req.query.eventId || 'DEFAULT';
    console.log('[GET APPROVED] eventId=', eventId);

    const photosRef = admin.firestore().collection('photos');
    const snapshot = await photosRef
      .where('eventId', '==', eventId)
      .where('status', '==', 'approved')
      .limit(50)
      .get();

    let photos = [];
    snapshot.forEach(doc => {
      photos.push({
        public_id: doc.id,
        secure_url: doc.data().url,
        created_at: doc.data().uploadedAt?.toDate()?.toISOString(),
        tags: doc.data().tags || [],
        message: doc.data().message || ''
      });
    });

    // Ordenar en memoria para evitar requerir índices compuestos
    photos = photos.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json(photos);

  } catch (error) {
    console.error('Error al obtener fotos aprobadas:', error);
    res.status(500).json({ message: 'Error interno del servidor', details: String(error?.message || error) });
  }
});

// GET PENDING PHOTOS
app.get('/get-photos', authenticate, async (req, res) => {
  try {
    const eventId = req.query.eventId || 'DEFAULT';
    console.log('[GET PENDING] eventId=', eventId);

    const photosRef = admin.firestore().collection('photos');
    const snapshot = await photosRef
      .where('eventId', '==', eventId)
      .where('status', '==', 'pending')
      .limit(50)
      .get();

    let photos = [];
    snapshot.forEach(doc => {
      photos.push({
        public_id: doc.id,
        secure_url: doc.data().url,
        created_at: doc.data().uploadedAt?.toDate()?.toISOString(),
        tags: doc.data().tags || [],
        message: doc.data().message || ''
      });
    });

    // Ordenar en memoria para evitar requerir índices compuestos
    photos = photos.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json(photos);

  } catch (error) {
    console.error('Error al obtener fotos pendientes:', error);
    res.status(500).json({ message: 'Error interno del servidor', details: String(error?.message || error) });
  }
});

// APPROVE PHOTO
app.post('/approve-photo', authenticate, async (req, res) => {
  try {
    const { photoId, eventId } = req.body;

    if (!photoId || !eventId) {
      return res.status(400).json({ error: 'photoId y eventId son requeridos' });
    }

    // Actualizar status en Firestore
    const photoRef = admin.firestore().collection('photos').doc(photoId);
    await photoRef.update({
      status: 'approved',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      tags: admin.firestore.FieldValue.arrayUnion(`approved_${eventId}`)
    });

    res.json({ message: 'Foto aprobada exitosamente' });

  } catch (error) {
    console.error('Error al aprobar foto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// REJECT PHOTO
app.post('/reject-photo', authenticate, async (req, res) => {
  try {
    const { photoId, eventId } = req.body;

    if (!photoId || !eventId) {
      return res.status(400).json({ error: 'photoId y eventId son requeridos' });
    }

    // Actualizar status en Firestore
    const photoRef = admin.firestore().collection('photos').doc(photoId);
    await photoRef.update({
      status: 'rejected',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      tags: admin.firestore.FieldValue.arrayUnion(`rejected_${eventId}`)
    });

    res.json({ message: 'Foto rechazada exitosamente' });

  } catch (error) {
    console.error('Error al rechazar foto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET DEMO PHOTOS
app.get('/get-demo-photos', authenticate, async (req, res) => {
  try {
    const eventId = req.query.eventId || 'DEFAULT';
    console.log('[GET DEMO] eventId=', eventId);

    // Para demo, devolver fotos de ejemplo o fotos existentes
    const photosRef = admin.firestore().collection('photos');
    const snapshot = await photosRef
      .where('eventId', '==', eventId)
      .limit(10)
      .get();

    let photos = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      photos.push({
        public_id: doc.id,
        secure_url: data.url,
        created_at: data.uploadedAt?.toDate()?.toISOString(),
        tags: data.tags || [],
        message: data.message || '',
        status: data.status || 'pending'
      });
    });

    // Ordenar en memoria
    photos = photos.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json(photos);

  } catch (error) {
    console.error('Error al obtener fotos demo:', error);
    res.status(500).json({ message: 'Error interno del servidor', details: String(error?.message || error) });
  }
});

// SOCIAL SHARE
app.get('/social-share', async (req, res) => {
  try {
    const { photoId } = req.query;

    if (!photoId) {
      return res.status(404).json({ error: 'photoId es requerido' });
    }

    const photoDoc = await admin.firestore().collection('photos').doc(photoId).get();

    if (!photoDoc.exists) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    const photoData = photoDoc.data();

    res.json({
      url: photoData.url,
      message: photoData.message || '',
      eventId: photoData.eventId
    });

  } catch (error) {
    console.error('Error en social share:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// TRACK PAGE VISIT
app.post('/track-visit', async (req, res) => {
  try {
    const { page, userAgent, referrer, timestamp } = req.body || {};

    // Crear documento de visita
    const visitData = {
      page: page || 'index',
      userAgent: userAgent || '',
      referrer: referrer || '',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      hour: new Date().getHours()
    };

    // Guardar en Firestore
    await admin.firestore().collection('pageVisits').add(visitData);

    res.json({ success: true });

  } catch (error) {
    console.error('Error tracking visit:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET VISIT STATISTICS
app.get('/get-visit-stats', authenticate, async (req, res) => {
  try {
    const { period = '30' } = req.query; // días
    const days = parseInt(period);

    // Calcular fecha límite
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - days);

    // Obtener visitas del período
    const visitsRef = admin.firestore().collection('pageVisits');
    const snapshot = await visitsRef
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(limitDate))
      .orderBy('timestamp', 'desc')
      .get();

    let visits = [];
    snapshot.forEach(doc => {
      visits.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Calcular estadísticas
    const totalVisits = visits.length;
    const uniqueIPs = [...new Set(visits.map(v => v.ip))].length;

    // Visitas por día (últimos 7 días)
    const visitsByDay = {};
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last7Days.push(dateStr);
      visitsByDay[dateStr] = 0;
    }

    visits.forEach(visit => {
      if (last7Days.includes(visit.date)) {
        visitsByDay[visit.date]++;
      }
    });

    // Visitas por hora (últimas 24 horas)
    const visitsByHour = {};
    for (let i = 23; i >= 0; i--) {
      const hour = (new Date().getHours() - i + 24) % 24;
      visitsByHour[hour] = 0;
    }

    visits.forEach(visit => {
      if (visit.hour !== undefined) {
        visitsByHour[visit.hour]++;
      }
    });

    // Páginas más visitadas
    const pageStats = {};
    visits.forEach(visit => {
      const page = visit.page || 'index';
      pageStats[page] = (pageStats[page] || 0) + 1;
    });

    res.json({
      totalVisits,
      uniqueVisitors: uniqueIPs,
      visitsByDay,
      visitsByHour,
      pageStats,
      period: `${days} días`
    });

  } catch (error) {
    console.error('Error getting visit stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Health check simple (rutas redundantes por si el normalizador no aplica en algún entorno)
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), route: '/health' });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), route: '/api/health' });
});
app.get('/api1/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), route: '/api1/health' });
});

// Manejo centralizado de errores (incluye errores de Multer como límite de tamaño)
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    console.error('[MULTER ERROR]', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'La imagen supera el tamaño máximo permitido (10MB).',
        code: err.code
      });
    }
    return res.status(400).json({
      error: 'Error en la carga del archivo.',
      code: err.code
    });
  }
  if (err) {
    console.error('[UNHANDLED ERROR]', err);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: String(err?.message || err)
    });
  }
  next();
});

// Fallback 404 para inspección de rutas no manejadas
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    url: req.url,
    originalUrl: req.originalUrl,
    note: 'Si ves /api o /api1 aquí, el normalizador no reescribió como se esperaba.'
  });
});

// Exportar la función de Firebase (Gen 1) alineada con firebase.json ("api1")
exports.api1 = functions.https.onRequest(app);