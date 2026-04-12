# Jezreel Vet — Backend API 🐾

Backend Node.js para enviar **mensajes e imágenes por WhatsApp** desde la web de Jezreel Vet.

## Requisitos
- Node.js >= 18
- npm
- Cuenta Twilio (gratis) **o** Meta WhatsApp Business API

---

## Instalación

```bash
cd backend
npm install
cp .env.example .env
# Edita .env con tus credenciales
npm run dev      # desarrollo
npm start        # producción
```

---

## Opción A — Twilio (recomendado para empezar rápido)

1. Crea cuenta en https://console.twilio.com (gratis)
2. Ve a **Messaging → Try it out → Send a WhatsApp message**
3. Activa el Sandbox: escanea el QR y envía el código al número de sandbox
4. Copia `ACCOUNT_SID` y `AUTH_TOKEN` al `.env`
5. En desarrollo necesitas URL pública → instala **ngrok**:
   ```bash
   npm install -g ngrok
   ngrok http 3001
   # Copia la URL https://xxxx.ngrok.io a PUBLIC_BASE_URL en .env
   ```

---

## Opción B — Meta WhatsApp Business Cloud API (producción oficial)

1. Ve a https://developers.facebook.com → **My Apps → Create App**
2. Agrega el producto **WhatsApp**
3. Obtén `META_PHONE_ID` y `META_ACCESS_TOKEN`
4. Agrega el número de destino como número de prueba
5. Configura en `.env`: `WA_PROVIDER=meta`

---

## Endpoints

### `POST /api/send-cita`
Envía datos de cita + imagen del carnet de vacunas.

| Campo      | Tipo   | Descripción                        |
|------------|--------|------------------------------------|
| nombre     | text   | Nombre del propietario             |
| telefono   | text   | Teléfono de contacto               |
| mascota    | text   | Nombre de la mascota               |
| especie    | text   | Especie de la mascota              |
| servicio   | text   | Servicio solicitado                |
| precio     | text   | Precio del servicio                |
| fecha      | text   | Fecha y hora deseada               |
| notas      | text   | Notas adicionales                  |
| carnet     | file   | Imagen del carnet (opcional)       |

### `POST /api/send-pedido`
Envía pedido de tienda (JSON).

```json
{
  "nombre": "Juan Pérez",
  "telefono": "0991234567",
  "items": [{ "nombre": "Royal Canin", "qty": 2, "subtotal": 49.98 }],
  "total": 49.98
}
```

### `POST /api/send-imagen`
Envía cualquier imagen con un caption.

| Campo   | Tipo | Descripción                     |
|---------|------|---------------------------------|
| imagen  | file | Imagen a enviar (requerida)     |
| caption | text | Texto/caption (opcional)        |
| destino | text | Número destino (opcional)       |

### `GET /health`
Verifica que el servidor esté activo.

---

## Integración en el frontend

El frontend HTML ya incluye la función `enviarCitaAPI()`. 
Solo cambia `API_URL` en el HTML por tu URL del servidor:

```js
const API_URL = 'http://localhost:3001'; // desarrollo
// const API_URL = 'https://api.jezreelvet.com'; // producción
```

---

## Estructura de archivos

```
backend/
├── server.js          ← Servidor principal
├── package.json
├── .env.example       ← Copia a .env y configura
└── uploads/           ← Imágenes subidas (se crea automáticamente)
```
