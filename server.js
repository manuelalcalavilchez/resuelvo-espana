const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const fsp = require('fs').promises;
const bcrypt = require('bcrypt');
const translations = require('./translations');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Queens2024!';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '34600000000';
const APP_VERSION = Date.now().toString(); // Genera un ID único cada vez que reinicias el servidor

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
    console.error(`Error leyendo ${file}:`, err);
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'queens-secret-2024',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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

  res.locals.whatsapp = WHATSAPP_NUMBER; // Hacer accesible el número para el botón de "olvidé contraseña"
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
  if (changed > 0) { await savePerfiles(perfiles); console.log(`⏳ ${changed} expirado(s)`); }
};
checkExpirations();
cron.schedule('0 * * * *', checkExpirations);

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
  res.render('home', { ciudadesMap, ciudadesList, ciudadEjemplo });
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
    perfiles.sort((a, b) => (planOrder[a.plan] - planOrder[b.plan]) || (a.orden_manual - b.orden_manual));
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

app.get('/perfil/:id', (req, res) => {
  const perfil = getPerfiles().find(p => p.id === req.params.id && p.estado === 'activo');
  if (!perfil) return res.redirect('/inicio');
  const relacionados = getPerfiles()
    .filter(p => p.ciudad === perfil.ciudad && p.categoria === perfil.categoria && p.estado === 'activo' && p.id !== perfil.id)
    .slice(0, 4);
  res.render('profile', { perfil, relacionados });
});

app.get('/r/:id', (req, res) => {
  req.session.referralId = req.params.id;
  res.redirect('/registro');
});

app.get('/registro', (req, res) => res.render('registro', { provincias: PROVINCIAS }));

app.post('/registro', async (req, res) => {
  const { nombre, ciudad, telefono, categoria, lat, lng } = req.body;
  const id = generateId();
  const perfiles = getPerfiles();
  perfiles.push({
    id, nombre, ciudad, telefono, categoria,
    tipo_anunciante: 'independiente', agencia_id: null, plan: 'basica',
    estado: 'solicitud_recibida', disponibilidad: 'disponible',
    descripcion: null, edad: null, idiomas: 'Español', fotos: [], lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null,
    orden_manual: 99, fecha_inicio: null, fecha_fin: null,
    notas_internas: null, created_at: new Date().toISOString(), referidos_count: 0, recompensa: false
  });
  // referrals
  if (req.session.referralId) {
    const refIdx = perfiles.findIndex(p => p.id === req.session.referralId);
    if (refIdx !== -1) {
      perfiles[refIdx].referidos_count = (perfiles[refIdx].referidos_count || 0) + 1;
      if (perfiles[refIdx].referidos_count >= 10 && !perfiles[refIdx].recompensa) {
        perfiles[refIdx].recompensa = true;
        perfiles[refIdx].plan = 'destacada';
        const today = new Date();
        const fin = new Date(); fin.setDate(fin.getDate() + 30);
        perfiles[refIdx].fecha_inicio = today.toISOString().split('T')[0];
        perfiles[refIdx].fecha_fin = fin.toISOString().split('T')[0];
        perfiles[refIdx].estado = 'activo';
      }
    }
    req.session.referralId = null;
  }
  await savePerfiles(perfiles);
  const msg = `Hola! Soy ${nombre}, mi ID es ${id}. Quiero registrarme en Queens Escort. Ciudad: ${ciudad}. Categoría: ${categoria}.`;
  res.redirect(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`);
});

app.get('/ghost', (req, res) => res.render('ghost'));

// ─────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});
app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.user = { id: 'root', rol: 'admin' };
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Contraseña incorrecta.' });
});
app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

// ACCESO USUARIOS
app.get('/acceso/login', (req, res) => {
  if (req.session.user) return res.redirect('/panel');
  res.render('acceso/login', { error: null });
});
app.post('/acceso/login', async (req, res) => {
  const { email, password } = req.body;
  const user = getUsuarios().find(u => u.email === email && u.estado === 'activo');
  if (!user) return res.render('acceso/login', { error: 'Usuario o contraseña incorrectos' });
  const ok = await bcrypt.compare(password, user.password_hash || '');
  if (!ok) return res.render('acceso/login', { error: 'Usuario o contraseña incorrectos' });
  req.session.user = { id: user.id, rol: user.rol, agencia_id: user.agencia_id || null, perfil_id: user.perfil_id || null };
  res.redirect('/panel');
});
app.get('/acceso/registro', (req, res) => {
  res.render('acceso/registro', { error: null, agencias: getAgencias() });
});
app.post('/acceso/registro', async (req, res) => {
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
  res.render('admin/perfil-form', { perfil: null, provincias: PROVINCIAS, agencias, action: '/admin/perfil/nuevo' });
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
    descripcion: descripcion || null, edad: edad ? parseInt(edad) : null,
    idiomas: idiomas || 'Español', fotos: [], orden_manual: 99,
    fecha_inicio: fecha_inicio || null, fecha_fin: fecha_fin || null,
    notas_internas: notas_internas || null, created_at: new Date().toISOString(),
    referidos_count: 0, recompensa: false
  });
  savePerfiles(perfiles);
  res.redirect(`/admin/perfil/${id}/editar`); // Redirigir a editar para poder subir fotos inmediatamente
});

app.get('/admin/perfil/:id/editar', requireAuth, (req, res) => {
  const perfil = getPerfiles().find(p => p.id === req.params.id);
  if (!perfil) return res.redirect('/panel');
  if (!checkOwnership(perfil, req.session.user)) return res.status(403).send('Sin permiso');
  const agencias = req.session.user.rol === 'agencia'
    ? getAgencias().filter(a => a.id === req.session.user.agencia_id)
    : getAgencias();
  res.render('admin/perfil-form', { perfil, provincias: PROVINCIAS, agencias, action: `/admin/perfil/${perfil.id}/editar` });
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
    plan, estado, disponibilidad, descripcion: descripcion || null,
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

app.post('/admin/perfil/:id/fotos', requireAuth, upload.array('fotos', 10), (req, res) => {
  const perfiles = getPerfiles();
  const p = perfiles.find(p => p.id === req.params.id);
  if (p && checkOwnership(p, req.session.user)) { p.fotos = [...(p.fotos || []), ...req.files.map(f => `/uploads/${req.params.id}/${f.filename}`)]; savePerfiles(perfiles); }
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

app.listen(PORT, () => {
  console.log(`\n🏆 Queens Escort → http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel   → http://localhost:${PORT}/admin`);
  console.log(`🔑 Password      → ${ADMIN_PASSWORD}\n`);
});
