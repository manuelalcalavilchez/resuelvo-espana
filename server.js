'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');

const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
}
if (IS_PROD && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD es obligatorio en producción.');
}

// Protección CSRF por comprobación de origen (OWASP): los navegadores envían Origin en
// todo POST entre sitios; si existe y no coincide con el host, se rechaza.
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Origin "null" (contextos opacos o algunas políticas de privacidad) se trata como ausente
  // y se recurre al Referer; si tampoco hay, decide la cookie SameSite=Lax.
  const origin = req.get('origin');
  const source = (origin && origin !== 'null') ? origin : req.get('referer');
  if (!source) return next();
  let host = '';
  try { host = new URL(source).host; } catch { host = ''; }
  if (host && host === req.get('host')) return next();
  return res.status(403).type('text').send('Origen no permitido.');
}

function createApp() {
  const { router, stripeWebhook } = require('./marketplace');
  const { page, FAVICON } = require('./lib/ui');
  const { version } = require('./package.json');
  const dataDir = process.env.RESUELVO_DATA_DIR || path.join(__dirname, 'data');
  const sessionsDir = path.join(dataDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: IS_PROD ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    // Con "no-referrer" (valor por defecto de Helmet) Chrome envía Origin: null en los POST.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  // Webhook de Stripe: necesita el cuerpo sin parsear para verificar la firma.
  app.post('/servicios/pagos/webhook', express.raw({ type: 'application/json', limit: '256kb' }), stripeWebhook);

  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(sameOrigin);
  app.use(session({
    store: new FileStore({ path: sessionsDir, ttl: 86400, retries: 1, logFn: () => {} }),
    secret: SESSION_SECRET || 'development-only-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    name: 'ayuda-barrio.sid',
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: IS_PROD }
  }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'ayuda-en-el-barrio', version }));
  app.get('/', (_req, res) => res.redirect(301, '/servicios'));
  app.get(['/admin', '/admin/', '/admin/login'], (_req, res) => res.redirect(302, '/servicios/admin/login'));
  app.get('/favicon.svg', (_req, res) => res.type('image/svg+xml').set('cache-control', 'public, max-age=604800').send(FAVICON));
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));

  const base = req => (process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nAllow: /servicios\nDisallow: /servicios/admin\nDisallow: /servicios/profesionales/panel\nDisallow: /servicios/profesionales/creditos\nDisallow: /servicios/profesionales/perfil\nDisallow: /servicios/api\nSitemap: ' + base(req) + '/sitemap.xml\n'));
  app.get('/sitemap.xml', (req, res) => {
    const urls = ['/servicios', '/servicios/profesionales/registro', '/servicios/privacidad/derechos', '/servicios/legal/aviso-legal', '/servicios/legal/privacidad', '/servicios/legal/cookies', '/servicios/legal/condiciones'];
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(u => '<url><loc>' + base(req) + u + '</loc></url>').join('') + '</urlset>');
  });

  app.use('/servicios', router);

  app.use((req, res) => {
    res.status(404).type('html').send(page('Página no encontrada', '<section class="card narrow"><h1 style="font-size:2rem">No hemos encontrado esa página</h1><p class="muted">Puede que el enlace haya cambiado.</p><a class="btn" href="/servicios">Ir al inicio</a></section>', { noindex: true }));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[ayuda-barrio] Error no controlado', { path: req.path, message: err && err.message });
    if (res.headersSent) return;
    res.status(500).type('html').send(page('Error', '<section class="card narrow"><h1 style="font-size:2rem">Algo ha fallado</h1><p class="muted">No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.</p><a class="btn alt" href="/servicios">Volver al inicio</a></section>', { noindex: true }));
  });
  return app;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  createApp().listen(PORT, '0.0.0.0', () => {
    console.log('[Ayuda en el Barrio] servidor iniciado', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
  process.on('unhandledRejection', err => console.error('[ayuda-barrio] Promesa rechazada sin capturar:', err && err.message));
}

module.exports = { createApp, sameOrigin };
