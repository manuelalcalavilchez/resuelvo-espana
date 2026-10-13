'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
}
if (IS_PROD && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD es obligatorio en producción.');
}

const dataDir = process.env.RESUELVO_DATA_DIR || path.join(__dirname, 'data');
const sessionsDir = path.join(dataDir, 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '32kb' }));
app.use(session({
  store: new FileStore({ path: sessionsDir, ttl: 86400, retries: 1, logFn: () => {} }),
  secret: SESSION_SECRET || 'development-only-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  name: 'ayuda-barrio.sid',
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD
  }
}));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'ayuda-en-el-barrio', version: 3 }));
app.get('/', (_req, res) => res.redirect(302, '/servicios'));
app.get('/admin', (_req, res) => res.redirect(302, '/servicios/admin/login'));
app.get('/admin/', (_req, res) => res.redirect(302, '/servicios/admin/login'));
app.get('/admin/login', (_req, res) => res.redirect(302, '/servicios/admin/login'));

app.use('/servicios', require('./marketplace').router);
app.use((req, res) => {
  res.status(404).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No encontrado · Ayuda en el Barrio</title><body style="font-family:system-ui;max-width:720px;margin:12vh auto;padding:24px;color:#18332f"><h1>No hemos encontrado esa página</h1><p>Prueba a volver al inicio de Ayuda en el Barrio.</p><a href="/servicios">Ir al inicio</a></body></html>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[Ayuda en el Barrio] servidor iniciado', { port: PORT, env: process.env.NODE_ENV || 'development' });
});
