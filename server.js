const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// Opción A: Twilio (recomendado para sandbox rápido)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'HXb5b62575e6e4ff6129ad7c8efe1f983e';
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN  || 'ACca9de9299162af130d0b8729c4233d4a';
const TWILIO_WA_FROM      = process.env.TWILIO_WA_FROM     || 'whatsapp:+14155238886'; // número Twilio sandbox
const CLINICA_WA_NUMBER   = process.env.CLINICA_WA_NUMBER  || '+593958601411';         // número destino

// Opción B: Meta WhatsApp Business Cloud API
const META_PHONE_ID    = process.env.META_PHONE_ID    || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';

// Directorio de subidas
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));   // expone archivos públicamente

// Multer: guarda la imagen en disco
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB máx (límite WA)
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Solo imágenes y PDF están permitidos'));
  },
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Devuelve la URL pública del archivo.
 * En producción usa tu dominio real; en desarrollo usa ngrok o similar.
 */
function publicUrl(filename) {
  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
  return `${base}/uploads/${filename}`;
}

/**
 * Envía mensaje + imagen vía Twilio WhatsApp
 */
async function sendViaTwilio({ to, body, mediaUrl }) {
  const client = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const params = {
    from: TWILIO_WA_FROM,
    to: `whatsapp:${to}`,
    body,
  };
  if (mediaUrl) params.mediaUrl = [mediaUrl];
  return client.messages.create(params);
}

/**
 * Envía mensaje + imagen vía Meta Cloud API
 * Primero sube la imagen al servidor de Meta, luego envía el mensaje.
 */
async function sendViaMeta({ to, body, localFilePath, mimeType }) {
  // Paso 1: subir imagen a Meta
  let imageId = null;
  if (localFilePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(localFilePath), {
      contentType: mimeType || 'image/jpeg',
    });
    form.append('messaging_product', 'whatsapp');
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v19.0/${META_PHONE_ID}/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        },
      }
    );
    imageId = uploadRes.data.id;
  }

  // Paso 2: enviar mensaje
  const messagePayload = {
    messaging_product: 'whatsapp',
    to,
    type: imageId ? 'image' : 'text',
  };

  if (imageId) {
    messagePayload.image = { id: imageId, caption: body };
  } else {
    messagePayload.text = { body };
  }

  return axios.post(
    `https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`,
    messagePayload,
    {
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/**
 * POST /api/send-cita
 * Body (multipart/form-data):
 *   - nombre, telefono, mascota, especie, servicio, precio, fecha, notas  (texto)
 *   - carnet  (archivo opcional)
 */
app.post('/api/send-cita', upload.single('carnet'), async (req, res) => {
  try {
    const { nombre, telefono, mascota, especie, servicio, precio, fecha, notas } = req.body;

    const texto =
      `*Nueva Cita - Jezreel Vet*\n\n` +
      `👤 *Propietario:* ${nombre || '—'}\n` +
      `📱 *Teléfono:* ${telefono || '—'}\n` +
      `🐾 *Mascota:* ${mascota || '—'} (${especie || '—'})\n` +
      `🩺 *Servicio:* ${servicio || '—'}\n` +
      `💲 *Precio:* ${precio || '—'}\n` +
      `📅 *Fecha:* ${fecha || 'Por confirmar'}\n` +
      `📝 *Notas:* ${notas || 'Ninguna'}\n\n` +
      `_Gracias por elegir Jezreel Vet!_`;

    const provider = process.env.WA_PROVIDER || 'twilio'; // 'twilio' | 'meta'

    if (provider === 'meta') {
      await sendViaMeta({
        to: CLINICA_WA_NUMBER,
        body: texto,
        localFilePath: req.file ? req.file.path : null,
        mimeType: req.file ? req.file.mimetype : null,
      });
    } else {
      // Twilio necesita URL pública
      const mediaUrl = req.file ? publicUrl(req.file.filename) : null;
      await sendViaTwilio({ to: CLINICA_WA_NUMBER, body: texto, mediaUrl });
    }

    res.json({ ok: true, message: 'Cita enviada a WhatsApp correctamente' });
  } catch (err) {
    console.error('[send-cita]', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/send-pedido
 * Body (application/json):
 *   - nombre, telefono, items (array), total
 */
app.post('/api/send-pedido', async (req, res) => {
  try {
    const { nombre, telefono, items = [], total } = req.body;

    const lineas = items
      .map((i) => `  • ${i.nombre} x${i.qty} = $${parseFloat(i.subtotal).toFixed(2)}`)
      .join('\n');

    const texto =
      `*Pedido - Jezreel Vet Pet Store*\n\n` +
      `👤 *Cliente:* ${nombre || '—'}\n` +
      `📱 *Teléfono:* ${telefono || '—'}\n\n` +
      `🛒 *Productos:*\n${lineas}\n\n` +
      `💰 *Total: $${parseFloat(total).toFixed(2)}*\n\n` +
      `_Gracias por tu compra en Jezreel Vet!_`;

    const provider = process.env.WA_PROVIDER || 'twilio';
    if (provider === 'meta') {
      await sendViaMeta({ to: CLINICA_WA_NUMBER, body: texto });
    } else {
      await sendViaTwilio({ to: CLINICA_WA_NUMBER, body: texto });
    }

    res.json({ ok: true, message: 'Pedido enviado a WhatsApp' });
  } catch (err) {
    console.error('[send-pedido]', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/send-imagen
 * Uso genérico: sube una imagen y la envía por WhatsApp con un caption.
 * Body (multipart/form-data):
 *   - imagen  (archivo requerido)
 *   - caption (texto opcional)
 *   - destino (número opcional, si no usa el número de la clínica)
 */
app.post('/api/send-imagen', upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió imagen' });

  try {
    const caption  = req.body.caption  || 'Imagen enviada desde Jezreel Vet';
    const destino  = req.body.destino  || CLINICA_WA_NUMBER;
    const provider = process.env.WA_PROVIDER || 'twilio';

    if (provider === 'meta') {
      await sendViaMeta({
        to: destino,
        body: caption,
        localFilePath: req.file.path,
        mimeType: req.file.mimetype,
      });
    } else {
      const mediaUrl = publicUrl(req.file.filename);
      await sendViaTwilio({ to: destino, body: caption, mediaUrl });
    }

    res.json({ ok: true, url: publicUrl(req.file.filename) });
  } catch (err) {
    console.error('[send-imagen]', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🐾 Jezreel Vet API corriendo en http://localhost:${PORT}`);
  console.log(`   Proveedor WA: ${process.env.WA_PROVIDER || 'twilio'}`);
  console.log(`   Número clínica: ${CLINICA_WA_NUMBER}\n`);
});
