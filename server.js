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
  verdeOk: "#1F8A4C",
};

function logoFeedTap(tamano = 40) {
  return `
    <div style="width:${tamano}px;height:${tamano}px;border-radius:50%;background:${MARCA.blanco};
                border:2px solid ${MARCA.negro};display:flex;align-items:center;justify-content:center;
                font-family:Arial,sans-serif;font-weight:800;font-size:${tamano * 0.42}px;color:${MARCA.negro};
                flex-shrink:0;">
      ft.
    </div>`;
}

// Estilos base compartidos por todas las páginas, para mantener el look consistente.
const ESTILO_BASE = `
  *{box-sizing:border-box;}
  body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:${MARCA.fondo};margin:0;color:${MARCA.negro};}
  a{color:${MARCA.negro};}
  .topbar{background:${MARCA.negro};padding:18px 28px;display:flex;align-items:center;gap:14px;}
  .topbar .nombre{color:${MARCA.blanco};font-weight:800;font-size:1.1rem;letter-spacing:-0.01em;}
  .content{padding:32px 24px 60px;max-width:880px;margin:0 auto;}
  .eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MARCA.gris};margin-bottom:6px;}
  .titulo-pagina{font-size:1.4rem;font-weight:800;margin:0 0 4px;letter-spacing:-0.01em;}
  .subtitulo{color:${MARCA.gris};font-size:0.9rem;margin-bottom:28px;}
  .back{color:${MARCA.gris};font-weight:600;font-size:0.85rem;text-decoration:none;}
`;

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

// Calcula toques de hoy y de los últimos 7 días, más un mini-histograma diario,
// igual que se ve en el panel principal.
function calcularResumen(eventos) {
  const ahora = new Date();
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - 6);

  let hoy = 0;
  let semana = 0;
  const dias7 = new Array(7).fill(0);

  for (const e of eventos) {
    const fecha = new Date(e.fechaISO);
    if (fecha >= inicioHoy) hoy++;
    if (fecha >= inicioSemana) semana++;

    const fechaSinHora = new Date(fecha);
    fechaSinHora.setHours(0, 0, 0, 0);
    const diffDias = Math.round((inicioHoy - fechaSinHora) / 86400000);
    if (diffDias >= 0 && diffDias < 7) {
      dias7[6 - diffDias]++;
    }
  }

  const ultimo = eventos.length ? eventos[eventos.length - 1] : null;
  return { hoy, semana, dias7, ultimo, total: eventos.length };
}

function diasSemanaCortos() {
  const nombres = [];
  const ahora = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(ahora);
    d.setDate(d.getDate() - i);
    nombres.push(d.toLocaleDateString("es-CO", { weekday: "short" }));
  }
  return nombres;
}

function barraSemana(dias7) {
  const max = Math.max(1, ...dias7);
  const dias = diasSemanaCortos();
  return dias7
    .map((v, i) => {
      const alturaPx = 6 + Math.round((v / max) * 44);
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
          <div style="font-size:0.62rem;color:${MARCA.gris};">${v}</div>
          <div style="width:100%;max-width:20px;height:${alturaPx}px;background:${MARCA.negro};border-radius:4px 4px 0 0;"></div>
          <div style="font-size:0.6rem;color:#999;text-transform:capitalize;">${dias[i]}</div>
        </div>`;
    })
    .join("");
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

// Panel principal: una tarjeta por negocio con totales y mini gráfica.
// Visítalo así: https://tu-dominio.com/stats?key=TU_CLAVE
app.get("/stats", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const datos = leerDatos();
  let totalNegocios = 0;
  let totalGlobal = 0;
  let hoyGlobal = 0;

  let tarjetas = "";
  for (const slug in NEGOCIOS) {
    const eventos = (datos[slug] && datos[slug].eventos) || [];
    const r = calcularResumen(eventos);
    totalNegocios++;
    totalGlobal += r.total;
    hoyGlobal += r.hoy;

    const ultimoTexto = r.ultimo ? r.ultimo.fechaLegible : "Sin toques todavía";

    tarjetas += `
      <div class="card">
        <div class="card-top">
          <div>
            <div class="card-nombre">${NEGOCIOS[slug].nombre}</div>
            <div class="card-slug">/r/${slug}</div>
          </div>
          <div class="card-total">${r.total}<span>toques totales</span></div>
        </div>
        <div class="card-metrics">
          <div class="metric"><div class="metric-num">${r.hoy}</div><div class="metric-lbl">Hoy</div></div>
          <div class="metric"><div class="metric-num">${r.semana}</div><div class="metric-lbl">7 días</div></div>
        </div>
        <div class="sparkline">${barraSemana(r.dias7)}</div>
        <div class="card-ultimo">Último toque: <b>${ultimoTexto}</b></div>
        <div class="card-actions">
          <a href="/historial/${slug}?key=${key}">Ver historial</a>
          <a href="/export/${slug}.pdf?key=${key}">Descargar PDF</a>
        </div>
      </div>`;
  }

  if (!tarjetas) {
    tarjetas = `<p style="color:${MARCA.gris}">No hay negocios configurados todavía en NEGOCIOS dentro de server.js.</p>`;
  }

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FeedTap — Estadísticas</title>
        <style>
          ${ESTILO_BASE}
          .resumen-grid{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px;}
          .resumen-box{background:#fff;border:1px solid ${MARCA.grisClaro};border-radius:12px;padding:18px 16px;text-align:center;flex:1;min-width:120px;}
          .resumen-num{font-size:1.7rem;font-weight:800;color:${MARCA.negro};line-height:1;}
          .resumen-lbl{font-size:0.7rem;color:${MARCA.gris};margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;}
          .lista-negocios{display:flex;flex-direction:column;gap:14px;}
          .card{background:#fff;border-radius:14px;padding:20px;border:1px solid ${MARCA.grisClaro};}
          .card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;}
          .card-nombre{font-weight:800;font-size:1.02rem;}
          .card-slug{font-size:0.74rem;color:${MARCA.gris};margin-top:2px;font-family:monospace;}
          .card-total{text-align:right;font-size:1.5rem;font-weight:800;color:${MARCA.negro};line-height:1;}
          .card-total span{display:block;font-size:0.58rem;font-weight:600;color:${MARCA.gris};margin-top:4px;letter-spacing:0.03em;text-transform:uppercase;}
          .card-metrics{display:flex;gap:10px;margin-bottom:16px;max-width:260px;}
          .metric{background:${MARCA.fondo};border:1px solid ${MARCA.grisClaro};border-radius:10px;padding:10px;flex:1;text-align:center;}
          .metric-num{font-size:1.15rem;font-weight:800;}
          .metric-lbl{font-size:0.65rem;color:${MARCA.gris};margin-top:2px;font-weight:600;text-transform:uppercase;}
          .sparkline{display:flex;align-items:flex-end;gap:4px;height:58px;margin-bottom:14px;max-width:280px;}
          .card-ultimo{font-size:0.8rem;color:${MARCA.gris};margin-bottom:14px;padding-top:12px;border-top:1px solid ${MARCA.grisClaro};}
          .card-ultimo b{color:${MARCA.negro};}
          .card-actions a{color:${MARCA.negro};font-weight:700;text-decoration:underline;font-size:0.8rem;margin-right:18px;}
        </style>
      </head>
      <body>
        <div class="topbar">
          ${logoFeedTap(34)}
          <span class="nombre">FeedTap</span>
        </div>
        <div class="content">
          <div class="eyebrow">Tiempo real</div>
          <h1 class="titulo-pagina">Estadísticas</h1>
          <div class="subtitulo">Resumen de toques por negocio.</div>

          <div class="resumen-grid">
            <div class="resumen-box"><div class="resumen-num">${totalNegocios}</div><div class="resumen-lbl">Negocios</div></div>
            <div class="resumen-box"><div class="resumen-num">${totalGlobal}</div><div class="resumen-lbl">Toques totales</div></div>
            <div class="resumen-box"><div class="resumen-num">${hoyGlobal}</div><div class="resumen-lbl">Toques hoy</div></div>
          </div>

          <div class="lista-negocios">
            ${tarjetas}
          </div>
        </div>
      </body>
    </html>
  `);
});

// Historial detallado de un negocio: fecha y hora exacta de cada toque.
// Visítalo así: https://tu-dominio.com/historial/mi-negocio?key=TU_CLAVE
app.get("/historial/:slug", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
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
          ${ESTILO_BASE}
          .content{max-width:560px;}
          table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid ${MARCA.grisClaro};margin-top:18px;}
          th,td{padding:11px 16px;text-align:left;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.88rem;}
          th{background:${MARCA.negro};color:${MARCA.blanco};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.03em;}
        </style>
      </head>
      <body>
        <div class="topbar">
          ${logoFeedTap(34)}
          <span class="nombre">FeedTap</span>
        </div>
        <div class="content">
          <a class="back" href="/stats?key=${key}">&larr; Volver</a>
          <h1 class="titulo-pagina" style="margin-top:14px;">${negocio.nombre}</h1>
          <div class="subtitulo">Total: <b style="color:${MARCA.negro}">${eventos.length}</b> toques registrados</div>
          <table>
            <tr><th>#</th><th>Fecha y hora</th></tr>
            ${filas || "<tr><td colspan='2'>Sin toques registrados todavía</td></tr>"}
          </table>
        </div>
      </body>
    </html>
  `);
});

// Exporta el historial completo de un negocio como PDF, con diseño FeedTap.
// Visítalo así: https://tu-dominio.com/export/mi-negocio.pdf?key=TU_CLAVE
app.get("/export/:slug.pdf", async (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const { slug } = req.params;
  const negocio = NEGOCIOS[slug];
  if (!negocio) return res.status(404).send("Negocio no encontrado.");

  const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

  const datos = leerDatos();
  const eventos = (datos[slug] && datos[slug].eventos) || [];
  const r = calcularResumen(eventos);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const negro = rgb(0.07, 0.07, 0.07);
  const gris = rgb(0.42, 0.42, 0.42);
  const grisClaro = rgb(0.9, 0.9, 0.9);

  let y = 790;

  // Encabezado: círculo "ft." dibujado a mano con líneas, + nombre FeedTap
  page.drawEllipse({ x: 64, y: y - 6, xScale: 16, yScale: 16, borderColor: negro, borderWidth: 1.5, color: rgb(1, 1, 1) });
  page.drawText("ft.", { x: 56, y: y - 11, size: 11, font: fontBold, color: negro });
  page.drawText("FeedTap", { x: 90, y: y - 10, size: 14, font: fontBold, color: negro });

  y -= 50;
  page.drawText("Reporte de actividad", { x: 50, y, size: 20, font: fontBold, color: negro });
  y -= 24;
  page.drawText(negocio.nombre, { x: 50, y, size: 13, font, color: gris });
  y -= 16;
  page.drawText(`Generado el ${new Date().toLocaleDateString("es-CO")}`, { x: 50, y, size: 9, font, color: gris });

  y -= 46;
  const metrics = [
    ["Toques totales", r.total],
    ["Toques hoy", r.hoy],
    ["Últimos 7 días", r.semana],
  ];
  let x = 50;
  metrics.forEach(([label, val]) => {
    page.drawRectangle({ x, y: y - 50, width: 150, height: 60, color: rgb(0.97, 0.97, 0.97), borderColor: grisClaro, borderWidth: 1 });
    page.drawText(String(val), { x: x + 14, y: y - 18, size: 22, font: fontBold, color: negro });
    page.drawText(label, { x: x + 14, y: y - 40, size: 9, font, color: gris });
    x += 165;
  });

  y -= 90;
  page.drawText("Toques por día (últimos 7 días)", { x: 50, y, size: 12, font: fontBold, color: negro });
  y -= 20;

  const max = Math.max(1, ...r.dias7);
  const nombresDias = diasSemanaCortos();
  const barAreaTop = y;
  const barAreaHeight = 90;
  r.dias7.forEach((v, i) => {
    const barHeight = (v / max) * barAreaHeight;
    const bx = 50 + i * 70;
    page.drawRectangle({ x: bx, y: barAreaTop - barAreaHeight, width: 36, height: barHeight || 1, color: negro });
    page.drawText(String(v), { x: bx + 12, y: barAreaTop - barAreaHeight - 14, size: 9, font, color: gris });
    page.drawText(nombresDias[i], { x: bx, y: barAreaTop - barAreaHeight - 28, size: 9, font, color: negro });
  });

  y = barAreaTop - barAreaHeight - 60;
  page.drawText("Últimas interacciones", { x: 50, y, size: 12, font: fontBold, color: negro });
  y -= 18;

  const recientes = eventos.slice(-25).reverse();
  recientes.forEach((e) => {
    if (y < 50) return;
    page.drawText(e.fechaLegible, { x: 50, y, size: 9, font, color: gris });
    y -= 14;
  });

  const pdfBytes = await pdfDoc.save();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="feedtap-reporte-${slug}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

app.get("/", (req, res) => {
  res.send("FeedTap — servidor activo. Usa /r/:slug para los NFC y /stats?key=... para ver el conteo.");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
