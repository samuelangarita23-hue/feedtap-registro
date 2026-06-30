// server.js
// Backend de FeedTap: registra cada toque NFC (fecha y hora exacta) y redirige
// al cliente a la página de reseñas de Google.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));
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

// Estilos base compartidos por todas las páginas — layout de barra lateral fija,
// filas de datos en monoespaciado y bordes rectos (sin tarjetas redondeadas con sombra).
const ESTILO_BASE = `
  *{box-sizing:border-box;}
  body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:${MARCA.blanco};margin:0;color:${MARCA.negro};}
  a{color:${MARCA.negro};}
  .layout{display:flex;min-height:100vh;}
  .sidebar{width:220px;flex-shrink:0;background:${MARCA.negro};padding:28px 22px;position:sticky;top:0;height:100vh;}
  .sidebar .marca{display:flex;align-items:center;gap:10px;margin-bottom:42px;}
  .sidebar .marca .nombre{color:${MARCA.blanco};font-weight:800;font-size:1.02rem;letter-spacing:-0.01em;}
  .sidebar nav a{display:block;color:#999;font-size:0.84rem;font-weight:600;text-decoration:none;
                 padding:10px 0;border-top:1px solid #2a2a2a;}
  .sidebar nav a:first-child{border-top:none;}
  .sidebar nav a:hover, .sidebar nav a.activo{color:${MARCA.blanco};}
  .main{flex:1;padding:38px 44px 70px;max-width:760px;}
  .eyebrow{font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9a9a9a;margin-bottom:8px;font-family:monospace;}
  .titulo-pagina{font-size:1.5rem;font-weight:800;margin:0 0 6px;letter-spacing:-0.015em;}
  .subtitulo{color:${MARCA.gris};font-size:0.88rem;margin-bottom:30px;}
  .back{color:${MARCA.gris};font-weight:600;font-size:0.8rem;text-decoration:none;font-family:monospace;}
  @media (max-width:760px){
    .layout{flex-direction:column;}
    .sidebar{width:100%;height:auto;position:relative;padding:18px 20px;}
    .sidebar nav{display:flex;gap:4px;overflow-x:auto;}
    .sidebar nav a{border-top:none;padding:6px 12px;white-space:nowrap;}
    .main{padding:26px 20px 50px;}
  }
`;

function sidebar(activo, key) {
  const item = (href, label, id) =>
    `<a href="${href}" class="${activo === id ? "activo" : ""}">${label}</a>`;
  return `
    <div class="sidebar">
      <div class="marca">${logoFeedTap(30)}<span class="nombre">FeedTap</span></div>
      <nav>
        ${item(`/stats?key=${key}`, "Estadísticas", "stats")}
        ${item(`/editar?key=${key}`, "Agregar negocio", "editar")}
      </nav>
    </div>`;
}

// ---------- Configuración de negocios ----------
// Los negocios de aquí abajo (NEGOCIOS) son los que vienen escritos directo en el código.
// También se pueden agregar negocios nuevos desde el navegador en /editar — esos se guardan
// en negocios.json y se combinan automáticamente con los de aquí.
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

const NEGOCIOS_FILE = path.join(__dirname, "negocios.json");

function leerNegociosDinamicos() {
  if (!fs.existsSync(NEGOCIOS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(NEGOCIOS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function guardarNegociosDinamicos(negocios) {
  fs.writeFileSync(NEGOCIOS_FILE, JSON.stringify(negocios, null, 2));
}

// Junta los negocios escritos en el código con los creados desde /editar.
function todosLosNegocios() {
  return { ...NEGOCIOS, ...leerNegociosDinamicos() };
}

function obtenerNegocio(slug) {
  return todosLosNegocios()[slug] || null;
}

// Genera un slug simple y único a partir del nombre del negocio (ej: "Café Sol" -> "cafe-sol").
function generarSlug(nombre) {
  const base = nombre
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const todos = todosLosNegocios();
  let slug = base || "negocio";
  let i = 2;
  while (todos[slug]) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

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
      const tamano = 5 + Math.round((v / max) * 13); // diámetro del punto, 5 a 18px
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;">
          <div style="font-size:0.6rem;color:#9a9a9a;font-family:monospace;">${v}</div>
          <div style="width:100%;height:18px;display:flex;align-items:center;justify-content:center;position:relative;">
            <div style="width:100%;height:1px;background:${MARCA.grisClaro};position:absolute;"></div>
            <div style="width:${tamano}px;height:${tamano}px;border-radius:50%;background:${MARCA.negro};position:relative;z-index:1;"></div>
          </div>
          <div style="font-size:0.58rem;color:#999;text-transform:uppercase;font-family:monospace;">${dias[i]}</div>
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
  const negocio = obtenerNegocio(slug);

  if (!negocio) {
    return res.status(404).send("Negocio no encontrado. Revisa el enlace del NFC.");
  }

  registrarToque(slug);
  res.redirect(302, negocio.googleUrl);
});

// Página para agregar negocios nuevos desde el navegador, sin tocar código.
// Visítalo así: https://tu-dominio.com/editar?key=TU_CLAVE
app.get("/editar", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const NEGOCIOS_TOTAL = todosLosNegocios();

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FeedTap — Agregar negocio</title>
        <style>
          ${ESTILO_BASE}
          .main{max-width:560px;}
          .form-card{border:1px solid ${MARCA.negro};padding:24px;margin-bottom:36px;}
          label{font-size:0.74rem;font-weight:700;color:${MARCA.gris};display:block;margin:16px 0 6px;
                text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;}
          label:first-of-type{margin-top:0;}
          input{width:100%;padding:11px 0;border:none;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.95rem;
                font-family:inherit;background:transparent;}
          input:focus{outline:none;border-bottom-color:${MARCA.negro};}
          button{margin-top:24px;width:100%;background:${MARCA.negro};color:#fff;border:none;
                 padding:13px;font-size:0.85rem;font-weight:700;cursor:pointer;text-transform:uppercase;
                 letter-spacing:0.05em;font-family:monospace;}
          .fila-tabla{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.86rem;}
          .fila-tabla:first-child{border-top:1px solid ${MARCA.negro};}
          code{font-size:0.8rem;color:${MARCA.gris};}
        </style>
      </head>
      <body>
        <div class="layout">
          ${sidebar("editar", key)}
          <div class="main">
            <a class="back" href="/stats?key=${key}">&larr; volver</a>
            <div class="eyebrow" style="margin-top:14px;">/editar</div>
            <h1 class="titulo-pagina">Agregar negocio</h1>
            <div class="subtitulo">Queda activo de inmediato, listo para programar su tarjeta NFC.</div>

            <div class="form-card">
              <form method="POST" action="/editar?key=${key}">
                <label>Nombre del negocio</label>
                <input type="text" name="nombre" required placeholder="Ej: Restaurante Los Corales">
                <label>Enlace de reseñas de Google</label>
                <input type="url" name="googleUrl" required placeholder="https://g.page/r/.../review">
                <button type="submit">Guardar negocio</button>
              </form>
            </div>

            <div class="eyebrow">Negocios actuales</div>
            ${
              Object.entries(NEGOCIOS_TOTAL).length
                ? Object.entries(NEGOCIOS_TOTAL)
                    .map(([slug, n]) => `<div class="fila-tabla"><span>${n.nombre}</span><code>/r/${slug}</code></div>`)
                    .join("")
                : `<p style="color:${MARCA.gris};font-size:0.86rem;">Sin negocios todavía.</p>`
            }
          </div>
        </div>
      </body>
    </html>
  `);
});

app.post("/editar", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado.");
  }
  const { nombre, googleUrl } = req.body;
  if (!nombre || !googleUrl) {
    return res.status(400).send("Faltan datos: nombre y enlace de Google son obligatorios.");
  }

  const slug = generarSlug(nombre);
  const dinamicos = leerNegociosDinamicos();
  dinamicos[slug] = { nombre, googleUrl };
  guardarNegociosDinamicos(dinamicos);

  res.redirect(`/editar?key=${key}`);
});

// Panel principal: una tarjeta por negocio con totales y mini gráfica.
// Visítalo así: https://tu-dominio.com/stats?key=TU_CLAVE
app.get("/stats", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).send("No autorizado. Agrega ?key=TU_CLAVE a la URL.");
  }

  const datos = leerDatos();
  const NEGOCIOS_TOTAL = todosLosNegocios();
  let totalNegocios = 0;
  let totalGlobal = 0;
  let hoyGlobal = 0;

  let filasNegocios = "";
  for (const slug in NEGOCIOS_TOTAL) {
    const eventos = (datos[slug] && datos[slug].eventos) || [];
    const r = calcularResumen(eventos);
    totalNegocios++;
    totalGlobal += r.total;
    hoyGlobal += r.hoy;

    const ultimoTexto = r.ultimo ? r.ultimo.fechaLegible : "Sin toques todavía";

    filasNegocios += `
      <div class="fila-negocio">
        <div class="fn-encabezado">
          <div>
            <div class="fn-nombre">${NEGOCIOS_TOTAL[slug].nombre}</div>
            <div class="fn-slug">/r/${slug}</div>
          </div>
          <div class="fn-total">${r.total}</div>
        </div>
        <div class="fn-cuerpo">
          <div class="fn-stats">
            <div class="fn-stat"><span>${r.hoy}</span> hoy</div>
            <div class="fn-stat"><span>${r.semana}</span> 7 días</div>
            <div class="fn-ultimo">Último: ${ultimoTexto}</div>
          </div>
          <div class="sparkline">${barraSemana(r.dias7)}</div>
        </div>
        <div class="fn-actions">
          <a href="/historial/${slug}?key=${key}">historial →</a>
          <a href="/export/${slug}.pdf?key=${key}">descargar pdf →</a>
        </div>
      </div>`;
  }

  if (!filasNegocios) {
    filasNegocios = `<p style="color:${MARCA.gris}">No hay negocios configurados todavía. Agrega uno desde "Agregar negocio".</p>`;
  }

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>FeedTap — Estadísticas</title>
        <style>
          ${ESTILO_BASE}
          .resumen-fila{display:flex;border-top:1px solid ${MARCA.negro};border-bottom:1px solid ${MARCA.negro};margin-bottom:36px;}
          .resumen-celda{flex:1;padding:16px 0;text-align:left;}
          .resumen-celda:not(:first-child){border-left:1px solid ${MARCA.grisClaro};padding-left:18px;}
          .resumen-num{font-size:1.9rem;font-weight:800;font-family:monospace;line-height:1;}
          .resumen-lbl{font-size:0.68rem;color:${MARCA.gris};margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;}
          .fila-negocio{border-bottom:1px solid ${MARCA.grisClaro};padding:22px 0;}
          .fila-negocio:first-child{border-top:1px solid ${MARCA.grisClaro};}
          .fn-encabezado{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;}
          .fn-nombre{font-weight:800;font-size:1.05rem;}
          .fn-slug{font-size:0.74rem;color:${MARCA.gris};font-family:monospace;margin-top:2px;}
          .fn-total{font-size:1.6rem;font-weight:800;font-family:monospace;}
          .fn-cuerpo{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px;flex-wrap:wrap;}
          .fn-stats{display:flex;flex-direction:column;gap:6px;}
          .fn-stat{font-size:0.82rem;color:${MARCA.gris};}
          .fn-stat span{font-weight:800;color:${MARCA.negro};font-family:monospace;margin-right:4px;}
          .fn-ultimo{font-size:0.76rem;color:#9a9a9a;margin-top:4px;}
          .sparkline{display:flex;gap:10px;max-width:260px;flex:1;min-width:200px;}
          .fn-actions a{color:${MARCA.negro};font-weight:700;text-decoration:none;font-size:0.78rem;
                        font-family:monospace;margin-right:22px;border-bottom:1px solid ${MARCA.negro};padding-bottom:1px;}
        </style>
      </head>
      <body>
        <div class="layout">
          ${sidebar("stats", key)}
          <div class="main">
            <div class="eyebrow">/stats</div>
            <h1 class="titulo-pagina">Estadísticas</h1>
            <div class="subtitulo">Resumen de toques por negocio.</div>

            <div class="resumen-fila">
              <div class="resumen-celda"><div class="resumen-num">${totalNegocios}</div><div class="resumen-lbl">Negocios</div></div>
              <div class="resumen-celda"><div class="resumen-num">${totalGlobal}</div><div class="resumen-lbl">Toques totales</div></div>
              <div class="resumen-celda"><div class="resumen-num">${hoyGlobal}</div><div class="resumen-lbl">Toques hoy</div></div>
            </div>

            ${filasNegocios}
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
  const negocio = obtenerNegocio(slug);
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
          .main{max-width:560px;}
          table{border-collapse:collapse;width:100%;border:1px solid ${MARCA.grisClaro};margin-top:18px;}
          th,td{padding:11px 16px;text-align:left;border-bottom:1px solid ${MARCA.grisClaro};font-size:0.88rem;font-family:monospace;}
          th{background:${MARCA.negro};color:${MARCA.blanco};font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;}
        </style>
      </head>
      <body>
        <div class="layout">
          ${sidebar("stats", key)}
          <div class="main">
            <a class="back" href="/stats?key=${key}">&larr; volver</a>
            <div class="eyebrow" style="margin-top:14px;">/historial</div>
            <h1 class="titulo-pagina">${negocio.nombre}</h1>
            <div class="subtitulo">Total: <b style="color:${MARCA.negro}">${eventos.length}</b> toques registrados</div>
            <table>
              <tr><th>#</th><th>Fecha y hora</th></tr>
              ${filas || "<tr><td colspan='2'>Sin toques registrados todavía</td></tr>"}
            </table>
          </div>
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
  const negocio = obtenerNegocio(slug);
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
