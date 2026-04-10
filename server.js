const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const multer = require('multer');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const fsp = require('fs').promises;
const bcrypt = require('bcrypt');
const translations = require('./translations');
const crypto = require('crypto');

// ─── LOGGER ───────────────────────────────────────────────
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
});

// ─── PRODUCTION SAFETY: secrets obligatorios ──────────────
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD) {
  const missing = [];
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (missing.length) {
    logger.fatal({ missing }, 'Faltan variables de entorno críticas en producción');
    console.error(`\n❌ FATAL: faltan env vars: ${missing.join(', ')}\n`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de proxy reverso (Easypanel/Traefik) → necesario para IP real en rate-limit
app.set('trust proxy', 1);

// ─── SECURITY HEADERS ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "https://flagcdn.com", "https://upload.wikimedia.org"],
      "media-src": ["'self'"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // Por defecto helmet pone "no-referrer", lo que impide la comprobación CSRF
  // basada en Referer (algunos formularios HTML no envían Origin). Usamos
  // "same-origin": se envía Referer solo en peticiones al propio dominio,
  // nunca hacia fuera → privacidad intacta + CSRF funcional.
  referrerPolicy: { policy: 'same-origin' }
}));

// Middleware
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url.startsWith('/uploads') || req.url.startsWith('/css') || req.url.startsWith('/js') || req.url.startsWith('/img') } }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Favicon inline (evita 404 sin necesidad de fichero)
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">👑</text></svg>`;
app.get('/favicon.ico', (req, res) => {
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=604800');
  res.send(FAVICON_SVG);
});
app.get('/favicon.svg', (req, res) => {
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=604800');
  res.send(FAVICON_SVG);
});

// ─── CSRF vía Origin/Referer + SameSite=Strict ────────────
// Alternativa simple a tokens CSRF: validamos que toda mutación venga del mismo host.
// Detrás de proxy (Traefik/Easypanel/Cloudflare) usamos req.hostname (respeta X-Forwarded-Host).
// ALLOWED_ORIGINS en .env permite añadir hosts extra separados por coma (ej: "queenviproyal.com,www.queenviproyal.com").
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const rawOrigin = req.get('Origin') || req.get('Referer') || '';
  // Origin "null" lo envían algunos navegadores en contextos sandbox o file:// — lo tratamos como ausente
  const origin = rawOrigin && rawOrigin !== 'null' ? rawOrigin : '';

  // Fallback moderno: Sec-Fetch-Site (enviado por todos los navegadores modernos desde 2020)
  // Si el navegador declara explícitamente que la petición es same-origin, confiamos.
  const secFetchSite = (req.get('Sec-Fetch-Site') || '').toLowerCase();
  if (!origin && (secFetchSite === 'same-origin' || secFetchSite === 'none')) {
    return next();
  }

  if (!origin) {
    logger.warn({ path: req.path, ua: req.get('User-Agent'), secFetchSite }, 'CSRF: sin Origin/Referer');
    return res.status(403).send('CSRF: origen ausente (activa las cookies y JavaScript, y envía el formulario desde la misma página).');
  }

  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch (_) {
    logger.warn({ rawOrigin, path: req.path }, 'CSRF: URL inválida');
    return res.status(403).send('CSRF: origen inválido');
  }

  // Candidatos aceptables: hostname del request (con proxy), host crudo, y cualquier alias en ALLOWED_ORIGINS
  const candidates = new Set();
  candidates.add((req.hostname || '').toLowerCase());          // respeta X-Forwarded-Host si trust proxy
  candidates.add((req.get('Host') || '').toLowerCase());       // header crudo
  // También aceptamos el host sin puerto (por si el proxy normaliza :443/:80)
  const stripPort = h => (h || '').split(':')[0];
  candidates.add(stripPort(req.hostname));
  candidates.add(stripPort(req.get('Host') || ''));
  ALLOWED_HOSTS.forEach(h => candidates.add(h));

  const originHostNoPort = stripPort(originHost);
  if (candidates.has(originHost) || candidates.has(originHostNoPort)) {
    return next();
  }

  logger.warn(
    { originHost, candidates: [...candidates], path: req.path },
    'CSRF bloqueado: host mismatch'
  );
  return res.status(403).send('CSRF: origen no autorizado');
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Queens2024!';
const APP_VERSION = Date.now().toString(); // Genera un ID único cada vez que reinicias el servidor

// ─── CONFIG (editable desde admin) ────────────────────────
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const DEFAULT_CONFIG = {
  whatsapp_number: process.env.WHATSAPP_NUMBER || '34600000000',
  // Mensajes automáticos de WhatsApp (editables desde /admin/config)
  msg_chica: 'Hola Queens, quiero inscribirme como CHICA. Envíame los pasos y precios, por favor.',
  msg_agencia: 'Hola Queens, quiero inscribir mi AGENCIA / CHALET. Envíame los pasos y precios, por favor.',
  msg_plan_destacada: 'Hola Queens, quiero contratar el plan DESTACADA. Envíame precios y pasos, por favor.',
  msg_plan_basica: 'Hola Queens, quiero contratar el plan CATÁLOGO. Envíame precios y pasos, por favor.',
  msg_registro: 'Hola! Soy {nombre}, mi ID es {id}. Quiero anunciarme en Queens. Ciudad: {ciudad}. Categoría: {categoria}.',
  msg_contacto_cliente: 'Encantado/a de contactar contigo. He llegado hasta aquí a través de QUEENVIP ROYAL. ¿Podemos hablar para concertar una cita?'
};
const getConfig = () => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch (err) {
    logger.error({ err }, 'Error leyendo config.json');
    return { ...DEFAULT_CONFIG };
  }
};
const saveConfig = async (cfg) => {
  const tmp = CONFIG_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(cfg, null, 2));
  await fsp.rename(tmp, CONFIG_FILE);
};
const getWhatsappNumber = () => (getConfig().whatsapp_number || '').replace(/\D/g, '');

// ─── PLAN LIMITS ──────────────────────────────────────────
// Beneficios concretos por plan — usado en backend (enforce) y frontend (mostrar).
const PLAN_LIMITS = {
  destacada: {
    label: '👑 Destacada',
    price_hint: 'Premium',
    max_fotos: 12,
    allow_video: true,
    max_desc: 800,
    priority_sort: 1,     // aparece primero
    home_showcase: true,  // aparece en el carrusel de la portada
    stats_visible: true,  // estadísticas en el panel
    card_size: 'grande',
    badge: '👑 Corona',
    color: '#d4af37'
  },
  basica: {
    label: 'Catálogo',
    price_hint: 'Básico',
    max_fotos: 5,
    allow_video: false,
    max_desc: 250,
    priority_sort: 2,
    home_showcase: false,
    stats_visible: false,
    card_size: 'estándar',
    badge: null,
    color: '#888'
  }
};
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.basica;

// ─── DATA STORE ───────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
['./data', './public/uploads', './public/img'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const readDB = (file) => {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    logger.error({ err, file }, 'Error leyendo DB file');
    return [];
  }
};

const writeDB = async (file, data) => {
  const p = path.join(DATA_DIR, file);
  const tmp = p + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, p); // Operación atómica para evitar corrupción
};

const getPerfiles = () => readDB('perfiles.json');
const savePerfiles = async (d) => await writeDB('perfiles.json', d);
const getAgencias = () => readDB('agencias.json');
const saveAgencias = async (d) => await writeDB('agencias.json', d);
const getUsuarios = () => readDB('usuarios.json');
const saveUsuarios = async (d) => await writeDB('usuarios.json', d);

// ─── CLICK TRACKING ───────────────────────────────────────
const getClicks = () => readDB('clicks.json');
const saveClicks = async (d) => await writeDB('clicks.json', d);

const generateId = () => 'Q-' + crypto.randomBytes(2).toString('hex').toUpperCase();
const generateUserId = () => 'U-' + crypto.randomBytes(4).toString('hex').toUpperCase();

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── FILE UPLOAD ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads', req.params.id || 'temp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /jpeg|jpg|png|webp|mp4|mov/.test(path.extname(file.originalname).toLowerCase()));
  }
});

// ─── APP CONFIG ───────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 86400, retries: 1, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'queens-secret-2024',
  resave: false,
  saveUninitialized: false,
  name: 'queens.sid',
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD
  }
}));

// ─── RATE LIMITERS ────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.'
});
const formLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// All 50 Spanish provinces
const PROVINCIAS = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz',
  'Baleares', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón',
  'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca', 'Girona', 'Granada', 'Guadalajara',
  'Gipuzkoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo',
  'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Las Palmas',
  'Pontevedra', 'Salamanca', 'Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona',
  'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza'
];

// ─── AGE GATE 18+ ─────────────────────────────────────────
// Middleware que bloquea toda la navegación si no hay cookie de confirmación.
// La cookie se fija en POST /age-gate con una declaración expresa del usuario.
const AGE_GATE_COOKIE = 'queens_age_18';
const AGE_GATE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días
const AGE_GATE_EXEMPT = [
  '/age-gate',
  '/legal/',
  '/lang/',
  '/health',
  '/css/', '/js/', '/img/', '/uploads/', '/favicon.ico'
];
const isExemptFromAgeGate = (url) => AGE_GATE_EXEMPT.some(p => url.startsWith(p));

app.get('/age-gate', (req, res) => {
  const next = req.query.next && String(req.query.next).startsWith('/') ? req.query.next : '/';
  const lang = (req.session && req.session.lang) || 'es';
  const t = translations[lang] || translations.es;
  res.render('age-gate', { next, t, lang });
});
app.post('/age-gate', formLimiter, (req, res) => {
  if (req.body.confirm !== 'yes') {
    return res.status(400).send('Debes confirmar que eres mayor de 18 años para continuar.');
  }
  res.cookie(AGE_GATE_COOKIE, '1', {
    maxAge: AGE_GATE_TTL,
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD
  });
  const next = req.body.next && String(req.body.next).startsWith('/') ? req.body.next : '/';
  logger.info({ ip: req.ip }, 'Age gate aceptado');
  res.redirect(next);
});
app.post('/age-gate/reject', (req, res) => {
  res.clearCookie(AGE_GATE_COOKIE);
  res.redirect('https://www.google.com');
});

// Middleware: bloquea navegación si no hay cookie 18+
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (isExemptFromAgeGate(req.path)) return next();
  if (req.cookies && req.cookies[AGE_GATE_COOKIE] === '1') return next();
  // Fallback: parser simple de cookies si cookie-parser no está
  const raw = req.headers.cookie || '';
  if (raw.includes(`${AGE_GATE_COOKIE}=1`)) return next();
  return res.redirect('/age-gate?next=' + encodeURIComponent(req.originalUrl));
});

// Middleware: inject language into every request
app.use((req, res, next) => {
  const lang = req.session.lang || 'es';
  res.locals.t = translations[lang] || translations.es;
  res.locals.lang = lang;
  res.locals.v = APP_VERSION;

  const sess = req.session.user;
  if (sess) {
    let displayName = sess.email || 'Usuario';
    if (sess.rol === 'modelo' && sess.perfil_id) {
      const p = getPerfiles().find(x => x.id === sess.perfil_id);
      if (p) displayName = p.nombre;
    } else if (sess.rol === 'agencia' && sess.agencia_id) {
      const a = getAgencias().find(x => x.id === sess.agencia_id);
      if (a) displayName = a.nombre;
    }
    res.locals.user = { ...sess, displayName };
  } else {
    res.locals.user = null;
  }

  res.locals.whatsapp = getWhatsappNumber(); // Hacer accesible el número (editable desde admin/config)
  res.locals.waMessages = getConfig(); // Mensajes WhatsApp editables desde admin/config
  res.locals.PLAN_LIMITS = PLAN_LIMITS;
  next();
});

const requireAdmin = (req, res, next) =>
  req.session.isAdmin ? next() : res.redirect('/admin/login');

const requireAuth = (req, res, next) =>
  req.session.user ? next() : res.redirect('/acceso/login');

const requireRole = (...roles) => (req, res, next) => {
  if (!req.session.user || !roles.includes(req.session.user.rol)) {
    return res.status(403).send('Sin permiso');
  }
  next();
};

const checkOwnership = (perfil, user) => {
  if (!user || user.rol === 'admin') return true;
  if (user.rol === 'agencia') return perfil.agencia_id === user.agencia_id;
  if (user.rol === 'modelo') return perfil.id === user.perfil_id;
  return false;
};

// ─── EXPIRATION ───────────────────────────────────────────
const checkExpirations = async () => {
  const today = new Date().toISOString().split('T')[0];
  const perfiles = getPerfiles();
  let changed = 0;
  perfiles.forEach(p => {
    if (p.estado === 'activo' && p.fecha_fin && p.fecha_fin < today) {
      p.estado = 'expirado'; changed++;
    }
  });
  if (changed > 0) { await savePerfiles(perfiles); logger.info({ changed }, 'Perfiles expirados'); }
};
checkExpirations();
cron.schedule('0 * * * *', checkExpirations);

// ─── BACKUPS DIARIOS ──────────────────────────────────────
const BACKUPS_DIR = path.join(__dirname, 'data', 'backups');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
const runBackup = async () => {
  try {
    const stamp = new Date().toISOString().split('T')[0];
    const snapDir = path.join(BACKUPS_DIR, stamp);
    if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
    for (const f of ['perfiles.json', 'agencias.json', 'usuarios.json', 'config.json']) {
      const src = path.join(DATA_DIR, f);
      if (fs.existsSync(src)) {
        await fsp.copyFile(src, path.join(snapDir, f));
      }
    }
    // Retención: mantener últimos 14 backups
    const entries = (await fsp.readdir(BACKUPS_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
      .reverse();
    const toDelete = entries.slice(14);
    for (const d of toDelete) {
      await fsp.rm(path.join(BACKUPS_DIR, d), { recursive: true, force: true });
    }
    logger.info({ stamp, pruned: toDelete.length }, 'Backup diario completado');
  } catch (err) {
    logger.error({ err }, 'Error en backup diario');
  }
};
// Ejecuta 1 vez al arrancar (si no hay backup de hoy) y cada día a las 04:00
runBackup();
cron.schedule('0 4 * * *', runBackup);

// ─────────────────────────────────────────────────────────
// LANGUAGE ROUTE
// ─────────────────────────────────────────────────────────
app.get('/lang/:code', (req, res) => {
  const code = req.params.code;
  if (translations[code]) req.session.lang = code;
  const ref = req.get('Referer') || '/';
  res.redirect(ref);
});

// ─────────────────────────────────────────────────────────
// CLIENT ROUTES
// ─────────────────────────────────────────────────────────

// SPLASH / Entry page
app.get('/', (req, res) => {
  res.render('splash');
});

// HOME - Solo ciudades con al menos un perfil activo
app.get('/inicio', (req, res) => {
  const perfiles = getPerfiles().filter(p => p.estado === 'activo');
  const ciudadesMap = {};
  perfiles.forEach(p => {
    if (!p.ciudad) return;
    ciudadesMap[p.ciudad] = (ciudadesMap[p.ciudad] || 0) + 1;
  });
  const ciudadesList = Object.keys(ciudadesMap).sort((a, b) => a.localeCompare(b, 'es'));
  const ciudadEjemplo = ciudadesList[0] || 'Madrid';

  // Código de afiliada (ref) — validar que exista y esté activo
  let refCode = null;
  if (req.query.ref) {
    const refClean = String(req.query.ref).trim().toUpperCase();
    const refProfile = getPerfiles().find(p => p.id === refClean && p.estado === 'activo');
    if (refProfile) refCode = refClean;
  }

  res.render('home', { ciudadesMap, ciudadesList, ciudadEjemplo, refCode });
});

// Legacy referral link → redirige al nuevo sistema con ?ref=
app.get('/r/:id', (req, res) => {
  res.redirect('/inicio?ref=' + encodeURIComponent(req.params.id));
});

app.get('/ciudad/:nombre', (req, res) => {
  const { nombre } = req.params;
  const { categoria, disponibilidad, lat, lng, max_km } = req.query;
  let perfiles = getPerfiles().filter(p => p.estado === 'activo' && p.ciudad === nombre);
  if (categoria) perfiles = perfiles.filter(p => p.categoria === categoria);
  if (disponibilidad) perfiles = perfiles.filter(p => p.disponibilidad === disponibilidad);
  if (lat && lng) {
    perfiles = perfiles.map(p => {
      if (p.lat && p.lng) p.distancia = Math.round(haversineKm(parseFloat(lat), parseFloat(lng), p.lat, p.lng));
      return p;
    });
    if (max_km) perfiles = perfiles.filter(p => p.distancia !== undefined && p.distancia <= parseInt(max_km));
    perfiles.sort((a, b) => (a.distancia || 99999) - (b.distancia || 99999));
  } else {
    const planOrder = { destacada: 1, premium: 2, basica: 2 };
    perfiles.sort((a, b) => ((planOrder[a.plan] || 99) - (planOrder[b.plan] || 99)) || ((a.orden_manual || 99) - (b.orden_manual || 99)));
  }
  const agencias = getAgencias().filter(a => a.ciudad === nombre);
  res.render('city', {
    ciudad: nombre,
    destacadas: perfiles.filter(p => p.plan === 'destacada'),
    premium: [],
    basicas: perfiles.filter(p => p.plan === 'basica' || p.plan === 'premium'),
    agencias,
    filters: { categoria, disponibilidad, lat, lng, max_km }
  });
});

app.get('/perfil/:id', async (req, res) => {
  const perfiles = getPerfiles();
  const perfil = perfiles.find(p => p.id === req.params.id && p.estado === 'activo');
  if (!perfil) return res.redirect('/inicio');

  // Contador de visitas (solo 1 por sesión para evitar inflar con recargas)
  req.session.viewed = req.session.viewed || {};
  if (!req.session.viewed[perfil.id]) {
    perfil.views = (perfil.views || 0) + 1;
    req.session.viewed[perfil.id] = true;
    savePerfiles(perfiles).catch(() => {});
  }

  const relacionados = perfiles
    .filter(p => p.ciudad === perfil.ciudad && p.categoria === perfil.categoria && p.estado === 'activo' && p.id !== perfil.id)
    .slice(0, 4);
  res.render('profile', { perfil, relacionados, limits: getPlanLimits(perfil.plan) });
});

// Página informativa de comparación de planes
app.get('/planes', (req, res) => {
  res.render('planes');
});

// ─── LEGAL PAGES ──────────────────────────────────────────
app.get('/legal/privacidad', (req, res) => res.render('legal', { pageId: 'privacidad' }));
app.get('/legal/terminos', (req, res) => res.render('legal', { pageId: 'terminos' }));
app.get('/legal/cookies', (req, res) => res.render('legal', { pageId: 'cookies' }));
app.get('/legal/aviso', (req, res) => res.render('legal', { pageId: 'aviso' }));
app.get('/legal/anti-trata', (req, res) => res.render('legal', { pageId: 'anti-trata' }));
app.get('/legal/consentimiento', (req, res) => res.render('legal', { pageId: 'consentimiento' }));
app.get('/legal/dmca', (req, res) => res.render('legal', { pageId: 'dmca' }));

// Takedown / retirada de contenido (formulario público)
app.get('/legal/takedown', (req, res) => res.render('takedown', { sent: false, error: null }));
app.post('/legal/takedown', formLimiter, async (req, res) => {
  const { tipo, perfil_id, motivo, email_contacto, nombre_reclamante } = req.body;
  if (!tipo || !motivo || !email_contacto) {
    return res.render('takedown', { sent: false, error: 'Faltan campos obligatorios.' });
  }
  // Guardar en data/takedowns.json para el admin
  const takedownsFile = path.join(DATA_DIR, 'takedowns.json');
  let list = [];
  try { if (fs.existsSync(takedownsFile)) list = JSON.parse(fs.readFileSync(takedownsFile, 'utf8')); } catch (_) {}
  list.push({
    id: 'TD-' + Date.now(),
    tipo, perfil_id: perfil_id || null,
    motivo: String(motivo).slice(0, 5000),
    email_contacto,
    nombre_reclamante: nombre_reclamante || null,
    ip: req.ip,
    ua: req.get('User-Agent') || '',
    created_at: new Date().toISOString(),
    estado: 'pendiente'
  });
  const tmp = takedownsFile + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
  await fsp.rename(tmp, takedownsFile);
  logger.warn({ tipo, perfil_id, ip: req.ip }, 'Solicitud de takedown recibida');
  res.render('takedown', { sent: true, error: null });
});

// GDPR: Subject Access Request (SAR) — acceso/rectificación/borrado
app.get('/legal/mis-datos', (req, res) => res.render('gdpr-request', { sent: false, error: null }));
app.post('/legal/mis-datos', formLimiter, async (req, res) => {
  const { tipo_solicitud, perfil_id, email_contacto, descripcion } = req.body;
  if (!tipo_solicitud || !email_contacto) {
    return res.render('gdpr-request', { sent: false, error: 'Faltan campos obligatorios.' });
  }
  const gdprFile = path.join(DATA_DIR, 'gdpr_requests.json');
  let list = [];
  try { if (fs.existsSync(gdprFile)) list = JSON.parse(fs.readFileSync(gdprFile, 'utf8')); } catch (_) {}
  list.push({
    id: 'GDPR-' + Date.now(),
    tipo_solicitud, perfil_id: perfil_id || null,
    email_contacto,
    descripcion: String(descripcion || '').slice(0, 3000),
    ip: req.ip,
    created_at: new Date().toISOString(),
    estado: 'pendiente'
  });
  const tmp = gdprFile + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2));
  await fsp.rename(tmp, gdprFile);
  logger.info({ tipo_solicitud, ip: req.ip }, 'Solicitud GDPR recibida');
  res.render('gdpr-request', { sent: true, error: null });
});

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true, version: APP_VERSION, ts: Date.now() }));

app.get('/registro', (req, res) => res.render('registro', { provincias: PROVINCIAS }));

app.post('/registro', formLimiter, async (req, res) => {
  const { nombre, ciudad, telefono, categoria, descripcion, edad, lat, lng, ref } = req.body;
  const id = generateId();
  const perfiles = getPerfiles();

  // Validar código de afiliada
  let refCode = null;
  if (ref) {
    const refClean = String(ref).trim().toUpperCase();
    const refProfile = perfiles.find(p => p.id === refClean && p.estado === 'activo');
    if (refProfile) refCode = refClean;
  }

  const descLimit = getPlanLimits('basica').max_desc;
  perfiles.push({
    id, nombre, ciudad, telefono, categoria,
    tipo_anunciante: 'independiente', agencia_id: null, plan: 'basica',
    estado: 'solicitud_recibida', disponibilidad: 'disponible',
    descripcion: descripcion ? String(descripcion).slice(0, descLimit) : null,
    edad: edad ? parseInt(edad) : null,
    idiomas: 'Español', fotos: [], lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null,
    orden_manual: 99, fecha_inicio: null, fecha_fin: null,
    notas_internas: null, created_at: new Date().toISOString(),
    referidos_count: 0, recompensa: false,
    referida_por: refCode
  });
  await savePerfiles(perfiles);

  // IMPORTANTE: No acreditamos al referente aquí — sólo cuando el admin activa el perfil,
  // para evitar que cualquiera rellene formularios falsos. Ver applyAffiliateCredit().

  const refMsg = refCode ? ` Me recomendó la afiliada ${refCode}.` : '';
  const template = getConfig().msg_registro || DEFAULT_CONFIG.msg_registro;
  const msg = template
    .replace(/\{nombre\}/g, nombre || '')
    .replace(/\{id\}/g, id)
    .replace(/\{ciudad\}/g, ciudad || '')
    .replace(/\{categoria\}/g, categoria || '') + refMsg;
  res.redirect(`https://wa.me/${getWhatsappNumber()}?text=${encodeURIComponent(msg)}`);
});

// ─── AFFILIATE TIER SYSTEM ────────────────────────────────
// Tiers: 1 → 7 días gratis, 3 → 15 días, 5 → 30 días Destacada
const AFFILIATE_TIERS = [
  { count: 1, days: 7,  plan: null },
  { count: 3, days: 15, plan: null },
  { count: 5, days: 30, plan: 'destacada' }
];
const addDaysToProfile = (perfil, days) => {
  const today = new Date();
  const base = perfil.fecha_fin && new Date(perfil.fecha_fin) > today
    ? new Date(perfil.fecha_fin) : today;
  base.setDate(base.getDate() + days);
  perfil.fecha_fin = base.toISOString().split('T')[0];
  if (!perfil.fecha_inicio) perfil.fecha_inicio = today.toISOString().split('T')[0];
  if (perfil.estado !== 'activo') perfil.estado = 'activo';
};
const applyAffiliateCredit = async (referenteId) => {
  const perfiles = getPerfiles();
  const idx = perfiles.findIndex(p => p.id === referenteId);
  if (idx === -1) return false;
  const p = perfiles[idx];
  p.referidos_count = (p.referidos_count || 0) + 1;
  p.tiers_cobrados = p.tiers_cobrados || [];
  // aplicar cualquier tier alcanzado aún no cobrado
  for (const tier of AFFILIATE_TIERS) {
    if (p.referidos_count >= tier.count && !p.tiers_cobrados.includes(tier.count)) {
      addDaysToProfile(p, tier.days);
      if (tier.plan) p.plan = tier.plan;
      p.tiers_cobrados.push(tier.count);
      if (tier.count >= 5) p.recompensa = true;
    }
  }
  await savePerfiles(perfiles);
  return true;
};

app.get('/ghost', (req, res) => res.render('ghost'));

// ─────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});
app.post('/admin/login', loginLimiter, (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.user = { id: 'root', rol: 'admin' };
    logger.info({ ip: req.ip }, 'Admin login exitoso');
    return res.redirect('/admin');
  }
  logger.warn({ ip: req.ip }, 'Admin login fallido');
  res.render('admin/login', { error: 'Contraseña incorrecta.' });
});
app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

// Admin: Config (WhatsApp, etc.)
app.get('/admin/config', requireAdmin, (req, res) => {
  res.render('admin/config', { config: getConfig(), success: req.query.ok === '1' });
});
app.post('/admin/config', requireAdmin, async (req, res) => {
  const cfg = getConfig();
  const numero = (req.body.whatsapp_number || '').replace(/\D/g, '');
  if (numero) cfg.whatsapp_number = numero;
  // Mensajes automáticos de WhatsApp (editables)
  const msgFields = ['msg_chica', 'msg_agencia', 'msg_plan_destacada', 'msg_plan_basica', 'msg_registro'];
  for (const f of msgFields) {
    if (typeof req.body[f] === 'string') {
      cfg[f] = String(req.body[f]).slice(0, 1000);
    }
  }
  await saveConfig(cfg);
  res.redirect('/admin/config?ok=1');
});

// ACCESO USUARIOS
app.get('/acceso/login', (req, res) => {
  if (req.session.user) return res.redirect('/panel');
  res.render('acceso/login', { error: null });
});
app.post('/acceso/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = getUsuarios().find(u => u.email === email && u.estado === 'activo');
  if (!user) {
    logger.warn({ ip: req.ip, email }, 'Login fallido: usuario no encontrado');
    return res.render('acceso/login', { error: 'Usuario o contraseña incorrectos' });
  }
  const ok = await bcrypt.compare(password, user.password_hash || '');
  if (!ok) {
    logger.warn({ ip: req.ip, email }, 'Login fallido: password incorrecta');
    return res.render('acceso/login', { error: 'Usuario o contraseña incorrectos' });
  }
  req.session.user = { id: user.id, rol: user.rol, agencia_id: user.agencia_id || null, perfil_id: user.perfil_id || null };
  logger.info({ userId: user.id, rol: user.rol }, 'Login exitoso');
  res.redirect('/panel');
});
app.get('/acceso/registro', (req, res) => {
  res.render('acceso/registro', { error: null, agencias: getAgencias() });
});
app.post('/acceso/registro', formLimiter, async (req, res) => {
  const { email, password, rol, agencia_id, perfil_id } = req.body;
  const usuarios = getUsuarios();
  if (usuarios.find(u => u.email === email)) {
    return res.render('acceso/registro', { error: 'Ese email ya existe', agencias: getAgencias() });
  }
  // Validar que el perfil_id exista si es modelo
  if (rol === 'modelo' && perfil_id) {
    const existe = getPerfiles().find(p => p.id === perfil_id);
    if (!existe) return res.render('acceso/registro', { error: 'El ID de Perfil no existe.', agencias: getAgencias() });
  }

  const id = generateUserId();
  const hash = await bcrypt.hash(password, 10);
  usuarios.push({
    id, email, password_hash: hash,
    rol: rol || 'agencia',
    agencia_id: rol === 'agencia' ? (agencia_id || null) : null,
    perfil_id: rol === 'modelo' ? (perfil_id || null) : null,
    estado: 'pendiente',
    created_at: new Date().toISOString()
  });
  saveUsuarios(usuarios);
  res.render('acceso/login', { error: 'Cuenta creada. Espera aprobación.' });
});
app.get('/acceso/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.get('/admin', requireAdmin, (req, res) => {
  const { estado, ciudad, plan } = req.query;
  let perfiles = getPerfiles();
  if (estado) perfiles = perfiles.filter(p => p.estado === estado);
  if (ciudad) perfiles = perfiles.filter(p => p.ciudad === ciudad);
  if (plan) perfiles = perfiles.filter(p => p.plan === plan);
  perfiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const all = getPerfiles();
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7str = in7.toISOString().split('T')[0];
  const stats = {
    total: all.length,
    activos: all.filter(p => p.estado === 'activo').length,
    pendientes: all.filter(p => !['activo', 'rechazado', 'expirado'].includes(p.estado)).length,
    expiran7: all.filter(p => p.estado === 'activo' && p.fecha_fin && p.fecha_fin >= today && p.fecha_fin <= in7str).length
  };
  const ciudadesLista = [...new Set(all.map(p => p.ciudad))].sort();
  res.render('admin/dashboard', { perfiles, stats, filters: { estado, ciudad, plan }, ciudadesLista });
});

// Usuarios (admin)
app.get('/admin/usuarios', requireAdmin, (req, res) => {
  const usuarios = getUsuarios();
  res.render('admin/usuarios', { usuarios });
});
app.post('/admin/usuarios/:id/estado', requireAdmin, async (req, res) => {
  const usuarios = getUsuarios();
  const u = usuarios.find(x => x.id === req.params.id);
  if (u) {
    u.estado = req.body.estado || u.estado;
    if (req.body.perfil_id !== undefined) u.perfil_id = req.body.perfil_id || null;
    if (req.body.agencia_id !== undefined) u.agencia_id = req.body.agencia_id || null;
    // Lógica para resetear contraseña desde el panel admin
    if (req.body.nueva_password && req.body.nueva_password.trim() !== '') {
      u.password_hash = await bcrypt.hash(req.body.nueva_password, 10);
    }
    saveUsuarios(usuarios);
  }
  res.redirect('/admin/usuarios');
});

// Panel para agencias/modelos
app.get('/panel', requireAuth, (req, res) => {
  const user = req.session.user;
  const { estado, ciudad, plan } = req.query;
  let scope = getPerfiles();

  let userProfile = null;
  if (user.rol === 'modelo') {
    userProfile = scope.find(p => p.id === user.perfil_id);
    scope = userProfile ? [userProfile] : [];
  } else if (user.rol === 'agencia') {
    scope = scope.filter(p => p.agencia_id === user.agencia_id);
  }

  const ciudadesLista = [...new Set(scope.map(p => p.ciudad).filter(Boolean))].sort();
  let perfiles = [...scope];
  if (estado) perfiles = perfiles.filter(p => p.estado === estado);
  if (ciudad) perfiles = perfiles.filter(p => p.ciudad === ciudad);
  if (plan) perfiles = perfiles.filter(p => p.plan === plan);
  perfiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7str = in7.toISOString().split('T')[0];
  const stats = {
    total: scope.length,
    activos: scope.filter(p => p.estado === 'activo').length,
    pendientes: scope.filter(p => !['activo', 'rechazado', 'expirado'].includes(p.estado)).length,
    expiran7: scope.filter(p => p.estado === 'activo' && p.fecha_fin && p.fecha_fin >= today && p.fecha_fin <= in7str).length
  };
  res.render('admin/dashboard', {
    perfiles,
    stats,
    filters: { estado, ciudad, plan },
    ciudadesLista,
    isPanel: true,
    userRole: user.rol,
    perfil: userProfile // Pasamos el perfil específico para modelos
  });
});

app.get('/admin/perfil/nuevo', requireAuth, (req, res) => {
  if (req.session.user.rol === 'modelo') return res.redirect('/panel');
  const agencias = req.session.user.rol === 'agencia'
    ? getAgencias().filter(a => a.id === req.session.user.agencia_id)
    : getAgencias();
  res.render('admin/perfil-form', { perfil: null, provincias: PROVINCIAS, agencias, action: '/admin/perfil/nuevo', isAdmin: req.session.isAdmin === true, query: req.query });
});
app.post('/admin/perfil/nuevo', requireAuth, (req, res) => {
  if (req.session.user.rol === 'modelo') return res.redirect('/panel');
  const id = generateId();
  const { nombre, ciudad, telefono, categoria, tipo_anunciante, agencia_id, plan,
    disponibilidad, descripcion, edad, idiomas, fecha_inicio, fecha_fin, notas_internas } = req.body;
  const perfiles = getPerfiles();
  const ownerAgencia = req.session.user.rol === 'agencia' ? req.session.user.agencia_id : (agencia_id || null);
  perfiles.push({
    id, nombre, ciudad, telefono, categoria,
    tipo_anunciante: tipo_anunciante || 'independiente', agencia_id: ownerAgencia,
    plan: plan || 'basica', estado: 'activo', disponibilidad: disponibilidad || 'disponible',
    descripcion: descripcion ? String(descripcion).slice(0, getPlanLimits(plan || 'basica').max_desc) : null,
    edad: edad ? parseInt(edad) : null,
    idiomas: idiomas || 'Español', fotos: [], video: null, views: 0, orden_manual: 99,
    fecha_inicio: fecha_inicio || null, fecha_fin: fecha_fin || null,
    notas_internas: notas_internas || null, created_at: new Date().toISOString(),
    referidos_count: 0, recompensa: false, tiers_cobrados: []
  });
  savePerfiles(perfiles);
  res.redirect(`/admin/perfil/${id}/editar`); // Redirigir a editar para poder subir fotos inmediatamente
});

// Acreditar manualmente una referida a una afiliada (solo admin)
app.post('/admin/perfil/:id/acreditar-referida', requireAdmin, async (req, res) => {
  const nuevaReferidaId = req.params.id; // perfil que fue traído
  const referenteId = (req.body.referente_id || '').trim().toUpperCase();
  const perfiles = getPerfiles();
  const nueva = perfiles.find(p => p.id === nuevaReferidaId);
  const referente = perfiles.find(p => p.id === referenteId);
  if (!nueva || !referente) {
    return res.status(400).send('Perfil o referente no encontrado. <a href="javascript:history.back()">Volver</a>');
  }
  if (nueva.referida_por) {
    return res.status(400).send(`Esta modelo ya tenía acreditada a ${nueva.referida_por}. <a href="javascript:history.back()">Volver</a>`);
  }
  nueva.referida_por = referenteId;
  await savePerfiles(perfiles);
  await applyAffiliateCredit(referenteId);
  res.redirect(`/admin/perfil/${nuevaReferidaId}/editar`);
});

app.get('/admin/perfil/:id/editar', requireAuth, (req, res) => {
  const perfil = getPerfiles().find(p => p.id === req.params.id);
  if (!perfil) return res.redirect('/panel');
  if (!checkOwnership(perfil, req.session.user)) return res.status(403).send('Sin permiso');
  const agencias = req.session.user.rol === 'agencia'
    ? getAgencias().filter(a => a.id === req.session.user.agencia_id)
    : getAgencias();
  res.render('admin/perfil-form', { perfil, provincias: PROVINCIAS, agencias, action: `/admin/perfil/${perfil.id}/editar`, isAdmin: req.session.isAdmin === true, query: req.query });
});
app.post('/admin/perfil/:id/editar', requireAuth, (req, res) => {
  const perfiles = getPerfiles();
  const idx = perfiles.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.redirect('/panel');
  if (!checkOwnership(perfiles[idx], req.session.user)) return res.status(403).send('Sin permiso');
  const { nombre, ciudad, telefono, categoria, tipo_anunciante, agencia_id, plan, estado,
    disponibilidad, descripcion, edad, idiomas, fecha_inicio, fecha_fin, notas_internas, orden_manual } = req.body;
  perfiles[idx] = {
    ...perfiles[idx], nombre, ciudad, telefono, categoria,
    tipo_anunciante: tipo_anunciante || 'independiente',
    agencia_id: req.session.user.rol === 'agencia' ? req.session.user.agencia_id : (agencia_id || null),
    plan,
    estado, disponibilidad,
    descripcion: descripcion ? String(descripcion).slice(0, getPlanLimits(plan).max_desc) : null,
    edad: edad ? parseInt(edad) : null, idiomas: idiomas || 'Español',
    fecha_inicio: fecha_inicio || null, fecha_fin: fecha_fin || null,
    notas_internas: notas_internas || null, orden_manual: parseInt(orden_manual) || 99
  };
  savePerfiles(perfiles);
  res.redirect('/panel');
});

app.post('/admin/perfil/:id/estado', requireAuth, (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (p && checkOwnership(p, req.session.user)) {
    p.estado = req.body.estado;
    if (req.body.fecha_fin) { p.fecha_fin = req.body.fecha_fin; p.fecha_inicio = new Date().toISOString().split('T')[0]; }
    savePerfiles(perfiles);
  }
  res.redirect(req.get('Referer') || '/panel');
});

app.post('/admin/perfil/:id/disponibilidad', requireAuth, async (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (p && checkOwnership(p, req.session.user)) {
    p.disponibilidad = req.body.disponibilidad;
    await savePerfiles(perfiles);
  }
  res.redirect(req.get('Referer') || '/panel');
});

app.post('/admin/perfil/:id/eliminar', requireAuth, (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(x => x.id === req.params.id);
  if (p && checkOwnership(p, req.session.user)) {
    savePerfiles(perfiles.filter(x => x.id !== req.params.id));
  }
  res.redirect('/panel');
});

app.post('/admin/perfil/:id/fotos', requireAuth, upload.array('fotos', 15), async (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (!p || !checkOwnership(p, req.session.user)) return res.redirect('/panel');

  const limits = getPlanLimits(p.plan);
  const current = (p.fotos || []).length;
  const incoming = req.files || [];
  const allowedSlots = Math.max(0, limits.max_fotos - current);

  // Los que entran dentro del límite se aceptan; los sobrantes se borran del disco
  const accepted = incoming.slice(0, allowedSlots);
  const rejected = incoming.slice(allowedSlots);
  for (const f of rejected) {
    try { fs.unlinkSync(f.path); } catch (_) {}
  }

  p.fotos = [...(p.fotos || []), ...accepted.map(f => `/uploads/${req.params.id}/${f.filename}`)];
  await savePerfiles(perfiles);

  const warn = rejected.length > 0
    ? `?warn=${encodeURIComponent(`Plan ${limits.label}: máximo ${limits.max_fotos} fotos. Se ignoraron ${rejected.length}.`)}`
    : '';
  res.redirect(`/admin/perfil/${req.params.id}/editar${warn}`);
});

// Subida de vídeo (solo Destacada)
app.post('/admin/perfil/:id/video', requireAuth, upload.single('video'), async (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (!p || !checkOwnership(p, req.session.user)) return res.redirect('/panel');
  const limits = getPlanLimits(p.plan);
  if (!limits.allow_video) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    return res.redirect(`/admin/perfil/${req.params.id}/editar?warn=${encodeURIComponent('El vídeo solo está disponible en plan Destacada.')}`);
  }
  if (req.file) {
    // Borrar vídeo anterior si existía
    if (p.video) {
      const old = path.join(__dirname, 'public', p.video);
      if (fs.existsSync(old)) { try { fs.unlinkSync(old); } catch (_) {} }
    }
    p.video = `/uploads/${req.params.id}/${req.file.filename}`;
    await savePerfiles(perfiles);
  }
  res.redirect(`/admin/perfil/${req.params.id}/editar`);
});

app.post('/admin/perfil/:id/foto-eliminar', requireAuth, (req, res) => {
  const { foto } = req.body;
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (p && checkOwnership(p, req.session.user)) { p.fotos = (p.fotos || []).filter(f => f !== foto); savePerfiles(perfiles); }
  const filePath = path.join(__dirname, 'public', foto);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.redirect(`/admin/perfil/${req.params.id}/editar`);
});

app.get('/admin/recordatorios', requireAdmin, (req, res) => {
  const today = new Date();
  const ds = (d) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0]; };
  const activos = getPerfiles().filter(p => p.estado === 'activo' && p.fecha_fin);
  res.render('admin/recordatorios', {
    expiran1: activos.filter(p => p.fecha_fin === ds(1)),
    expiran3: activos.filter(p => p.fecha_fin >= ds(2) && p.fecha_fin <= ds(3)),
    expiran7: activos.filter(p => p.fecha_fin >= ds(4) && p.fecha_fin <= ds(7))
  });
});

app.get('/admin/agencias', requireAdmin, (req, res) => {
  res.render('admin/agencias', { agencias: getAgencias(), provincias: PROVINCIAS });
});
app.post('/admin/agencias/nueva', requireAdmin, (req, res) => {
  const { nombre, ciudad, descripcion, contacto } = req.body;
  const agencias = getAgencias();
  agencias.push({ id: 'AG-' + Date.now(), nombre, ciudad, descripcion: descripcion || null, contacto: contacto || null, created_at: new Date().toISOString() });
  saveAgencias(agencias);
  res.redirect('/admin/agencias');
});
app.post('/admin/agencias/:id/eliminar', requireAdmin, (req, res) => {
  saveAgencias(getAgencias().filter(a => a.id !== req.params.id));
  res.redirect('/admin/agencias');
});

// ─── CLICK TRACKING ROUTE ─────────────────────────────────
app.get('/perfil/:id/contacto', async (req, res) => {
  const { tipo } = req.query; // 'whatsapp' o 'telefono'
  const perfil = getPerfiles().find(p => p.id === req.params.id && p.estado === 'activo');
  if (!perfil) return res.redirect('/inicio');

  // Registrar el clic
  const clicks = getClicks();
  clicks.push({
    id: 'CLK-' + Date.now(),
    perfil_id: perfil.id,
    perfil_nombre: perfil.nombre,
    tipo: tipo || 'whatsapp',
    ip: req.ip,
    ua: req.get('User-Agent') || '',
    created_at: new Date().toISOString()
  });
  saveClicks(clicks).catch(() => {});

  // Actualizar contador en el perfil
  const perfiles = getPerfiles();
  const p = perfiles.find(x => x.id === req.params.id);
  if (p) {
    if (tipo === 'telefono') {
      p.calls = (p.calls || 0) + 1;
    } else {
      p.whatsapps = (p.whatsapps || 0) + 1;
    }
    savePerfiles(perfiles).catch(() => {});
  }

  // Construir el mensaje prellenado de WhatsApp
  if (tipo === 'whatsapp') {
    const config = getConfig();
    const msg = config.msg_contacto_cliente || 'Encantado/a de contactar contigo. He llegado hasta aquí a través de QUEENVIP ROYAL. ¿Podemos hablar para concertar una cita?';
    const waUrl = `https://wa.me/${(perfil.telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    return res.redirect(waUrl);
  }

  // Para teléfono: redirigir a tel:
  return res.redirect(`tel:${(perfil.telefono || '').replace(/\s/g, '')}`);
});

// ─── ADMIN CLICKS VIEW ────────────────────────────────────
app.get('/admin/clicks', requireAdmin, (req, res) => {
  const clicks = getClicks()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 500); // últimos 500
  res.render('admin/clicks', { clicks });
});

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Queens server iniciado');
  if (!IS_PROD) {
    console.log(`\n🏆 Queens → http://localhost:${PORT}`);
    console.log(`🔑 Admin Panel   → http://localhost:${PORT}/admin`);
    console.log(`🔑 Password      → ${ADMIN_PASSWORD}\n`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => { logger.info('SIGTERM recibido, cerrando'); process.exit(0); });
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaughtException'); process.exit(1); });
process.on('unhandledRejection', (err) => { logger.error({ err }, 'unhandledRejection'); });
