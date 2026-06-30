// server.js
// Backend de FeedTap: registra cada toque NFC (fecha y hora exacta) y redirige
// al cliente a la página de reseñas de Google.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

// Clave simple para proteger el panel de estadísticas (cámbiala por la tuya)
const ADMIN_KEY = process.env.ADMIN_KEY || "cambia-esta-clave";

// ---------- Marca FeedTap ----------
const MARCA = {
  negro: "#111111",
  gris: "#6B6B6B",
  grisClaro: "#E5E5E5",
  fondo: "#FAFAFA",
  blanco: "#FFFFFF",
};

function logoFeedTap(tamano = 40) {
  return `
    <div style="width:${tamano}px;height:${tamano}px;border-radius:50%;background:${MARCA.blanco};
                border:2px solid ${MARCA.negro};display:flex;align-items:center;justify-content:center;
                font-family:Arial,sans-serif;font-weight:800;font-size:${tamano * 0.42}px;color:${MARCA.negro};">
      ft.
    </div>`;
}

// ---------- Configuración de negocios ----------
// Agrega aquí un negocio por cada tarjeta NFC que tengas en la calle.
// "slug" es lo que va en la URL del NFC, ej: /r/mi-negocio
const NEGOCIOS = {
  "mi-negocio": {
    nombre: "Mi Negocio",
    googleUrl: "https://g.page/r/REEMPLAZA_CON_TU_ENLACE/review",
  },
  // "otro-local": {
  //   nombre: "Otro Local",
  //   googleUrl: "https://g.page/r/OTRO_ENLACE/review",
  // },
};

// ---------- Almacenamiento simple en archivo JSON ----------
function leerDatos() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function guardarDatos(datos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(datos, null, 2));
}

function registrarToque(slug) {
  const datos = leerDatos();
  if (!datos[slug]) {
    datos[slug] = { total: 0, eventos: [] };
  }

  const ahora = new Date();
  const evento = {
    fechaISO: ahora.toISOString(),
    fechaLegible: ahora.toLocaleString("es-CO"),
  };

  datos[slug].total += 1;
  datos[slug].eventos.push(evento);

  // Para no crecer infinito, guardamos los últimos 5000 eventos por negocio
  if (datos[slug].eventos.length > 5000) {
    datos[slug].eventos = datos[slug].eventos.slice(-5000);
  }

  guardarDatos(datos);
}

// ---------- Rutas ----------

// Esta es la URL que se programa en el chip NFC Y que se codifica en el QR.
// No importa si el cliente llega tocando la tarjeta o escaneando el QR — ambos
// apuntan a esta misma URL, así que ambos quedan registrados igual como un toque.
// Ejemplo: https://tu-dominio.com/r/mi-negocio
app.get("/r/:slug", (req, res) => {
  const { slug } = req.params;
  const negocio = NEGOCIOS[slug];

  if (!negocio) {
    return res.status(404).send("Negocio no encontrado. Revisa el enlace del NFC.");
  }

  registrarToque(slug);
  res.redirect(302, negocio.googleUrl);
});

// Panel simple: lista de negocios con su total de toques y enlace al historial.
// Visítalo así: https://tu-dominio.com/stats?key=TU_CLAVE
app.get("/stats", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const datos = leerDatos();
  let filas = "";
  for (const slug in NEGOCIOS) {
    const total = datos[slug] ? datos[slug].total : 0;
    filas += `
      <tr>
        <td>${NEGOCIOS[slug].nombre}</td>
        <td>${slug}</td>
        <td>${total}</td>
        <td><a href="/historial/${slug}?key=${req.query.key}">Ver historial</a></td>
        <td><a href="/export/${slug}.csv?key=${req.query.key}">Descargar CSV</a></td>
      </tr>`;
  }

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FeedTap — Estadísticas</title>
        <style>
          *{box-sizing:border-box;}
          body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:${MARCA.fondo};margin:0;color:${MARCA.negro};}
          .topbar{background:${MARCA.negro};padding:18px 32px;display:flex;align-items:center;gap:14px;}
          .topbar .nombre{color:${MARCA.blanco};font-weight:800;font-size:1.1rem;letter-spacing:-0.01em;}
          .content{padding:32px;max-width:800px;margin:0 auto;}
          h1{font-size:1.3rem;margin:0 0 20px;}
          table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid ${MARCA.grisClaro};}
          th,td{padding:13px 16px;text-align:left;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.9rem;}
          th{background:${MARCA.negro};color:${MARCA.blanco};font-size:0.74rem;text-transform:uppercase;letter-spacing:0.04em;}
          a{color:${MARCA.negro};font-weight:700;text-decoration:underline;}
        </style>
      </head>
      <body>
        <div class="topbar">
          ${logoFeedTap(34)}
          <span class="nombre">FeedTap</span>
        </div>
        <div class="content">
          <h1>Toques registrados</h1>
          <table>
            <tr><th>Negocio</th><th>Slug</th><th>Total de toques</th><th></th><th></th></tr>
            ${filas}
          </table>
        </div>
      </body>
    </html>
  `);
});

// Historial detallado de un negocio: fecha y hora exacta de cada toque.
// Visítalo así: https://tu-dominio.com/historial/mi-negocio?key=TU_CLAVE
app.get("/historial/:slug", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const { slug } = req.params;
  const negocio = NEGOCIOS[slug];
  if (!negocio) return res.status(404).send("Negocio no encontrado.");

  const datos = leerDatos();
  const eventos = (datos[slug] && datos[slug].eventos) || [];

  const filas = eventos
    .slice()
    .reverse()
    .map((e, i) => `<tr><td>${eventos.length - i}</td><td>${e.fechaLegible}</td></tr>`)
    .join("");

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FeedTap — Historial de ${negocio.nombre}</title>
        <style>
          *{box-sizing:border-box;}
          body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:${MARCA.fondo};margin:0;color:${MARCA.negro};}
          .topbar{background:${MARCA.negro};padding:18px 32px;display:flex;align-items:center;gap:14px;}
          .topbar .nombre{color:${MARCA.blanco};font-weight:800;font-size:1.1rem;letter-spacing:-0.01em;}
          .content{padding:32px;max-width:600px;margin:0 auto;}
          h1{font-size:1.2rem;margin:14px 0 4px;}
          .back{color:${MARCA.gris};font-weight:600;font-size:0.85rem;text-decoration:none;}
          table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid ${MARCA.grisClaro};margin-top:14px;}
          th,td{padding:11px 16px;text-align:left;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.88rem;}
          th{background:${MARCA.negro};color:${MARCA.blanco};font-size:0.72rem;text-transform:uppercase;}
        </style>
      </head>
      <body>
        <div class="topbar">
          ${logoFeedTap(34)}
          <span class="nombre">FeedTap</span>
        </div>
        <div class="content">
          <a class="back" href="/stats?key=${req.query.key}">&larr; Volver</a>
          <h1>Historial — ${negocio.nombre}</h1>
          <p style="color:${MARCA.gris};font-size:0.88rem;">Total: <b style="color:${MARCA.negro}">${eventos.length}</b> toques registrados</p>
          <table>
            <tr><th>#</th><th>Fecha y hora</th></tr>
            ${filas || "<tr><td colspan='2'>Sin toques registrados todavía</td></tr>"}
          </table>
        </div>
      </body>
    </html>
  `);
});

// Exporta el historial completo de un negocio como archivo CSV.
// Visítalo así: https://tu-dominio.com/export/mi-negocio.csv?key=TU_CLAVE
app.get("/export/:slug.csv", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const { slug } = req.params;
  const negocio = NEGOCIOS[slug];
  if (!negocio) return res.status(404).send("Negocio no encontrado.");

  const datos = leerDatos();
  const eventos = (datos[slug] && datos[slug].eventos) || [];

  let csv = "Numero,Fecha y hora\n";
  eventos.forEach((e, i) => {
    csv += `${i + 1},"${e.fechaLegible}"\n`;
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="historial-${slug}.csv"`);
  res.send(csv);
});

app.get("/", (req, res) => {
  res.send("FeedTap — servidor activo. Usa /r/:slug para los NFC y /stats?key=... para ver el conteo.");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
