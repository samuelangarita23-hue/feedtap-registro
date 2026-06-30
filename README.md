# FeedTap — registro de toques y redirección a Google

Servidor simple en Node.js + Express, con la marca de FeedTap. Hace dos cosas:

1. Recibe la visita cuando alguien toca el NFC.
2. Registra la fecha y hora exacta del toque, y redirige automáticamente al cliente a la página de reseñas de Google.

## Configurar tus negocios

Abre `server.js` y edita el objeto `NEGOCIOS`:

```js
const NEGOCIOS = {
  "mi-negocio": {
    nombre: "Mi Negocio",
    googleUrl: "https://g.page/r/TU_ENLACE_REAL/review",
  },
};
```

- `mi-negocio` es el "slug": la parte de la URL que se programa en el NFC y se codifica en el QR.
- `googleUrl` es el enlace real a la página de reseñas de Google del negocio.
- Para varios negocios, agrega uno por cada uno dentro del mismo objeto.

## NFC y QR cuentan igual

La misma URL (`/r/mi-negocio`) sirve tanto para programar el chip NFC como para generar el código QR de respaldo. No importa si el cliente llega tocando la tarjeta o escaneando el QR — ambos casos quedan registrados exactamente igual como un toque, porque ambos apuntan a la misma ruta. No hace falta ninguna configuración adicional para esto.

Para generar el QR de cada negocio, pueden usar cualquier generador gratuito (ej. [qr-code-generator.com](https://www.qr-code-generator.com)) apuntando a `https://tu-dominio.com/r/mi-negocio`.

## Cómo correrlo localmente

```bash
npm install
npm start
```

El servidor queda corriendo en `http://localhost:3000`.

## Cómo ver el historial de toques

```
http://localhost:3000/stats?key=cambia-esta-clave
```

(Cambia `cambia-esta-clave` por el valor de `ADMIN_KEY` en `server.js`, o usa la variable de entorno `ADMIN_KEY`.)

Desde ahí puedes ver el historial detallado (fecha y hora de cada toque) o descargar un CSV.

## Cómo ponerlo en internet

1. Sube esta carpeta a un repositorio de GitHub.
2. Conéctalo en Render, Railway, o cualquier hosting que soporte Node.js.
3. Usa la URL pública resultante + `/r/mi-negocio` como el enlace que se programa en el chip NFC.
