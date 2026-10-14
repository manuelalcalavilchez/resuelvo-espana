'use strict';
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { provincias, categorias, urgencias, category, categoryName } = require('./lib/catalog');
const store = require('./lib/store');
const { read, write, audit, balance, balances } = store;
const { esc, icon, page, notice, badge, eur, fecha, hace } = require('./lib/ui');
const payments = require('./lib/payments');
const legal = require('./lib/legal');
const notify = require('./lib/notify');
const { version } = require('./package.json');

const router = express.Router();
const MAX_PROS_PER_LEAD = 3;
const OPEN_STATES = ['nuevo', 'asignado'];
const REFUND_WINDOW_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 30;

// Los handlers async deben propagar errores a Express 4 (si no, el proceso se cae).
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
const limiter = (windowMs, limit) => rateLimit({
  windowMs, limit, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => message(res, 'Demasiados intentos', 'Has hecho demasiadas peticiones seguidas. Espera unos minutos y vuelve a intentarlo.', 429)
});
const mutationLimiter = limiter(15 * 60 * 1000, 60);
const authLimiter = limiter(15 * 60 * 1000, 8);
const publicFormLimiter = limiter(60 * 60 * 1000, 10);
router.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' || req.path === '/pagos/webhook') ? next() : mutationLimiter(req, res, next));

const now = () => new Date().toISOString();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const list = v => [].concat(v || []).map(String);
const digits = s => String(s || '').replace(/\D/g, '');

function message(res, title, text, status = 200, opts = {}) {
  const back = opts.back || ['/servicios', 'Volver al inicio'];
  return res.status(status).type('html').send(page(title,
    '<section class="card narrow"><h1 style="font-size:2rem">' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><a class="btn alt" href="' + back[0] + '">' + esc(back[1]) + '</a></section>',
    { ctx: opts.ctx, noindex: true }));
}

const FLASH = {
  desbloqueado: ['ok', 'Contacto desbloqueado. Ya puedes llamar o escribir al cliente.'],
  reporte: ['ok', 'Hemos recibido tu aviso. Revisaremos el contacto y, si procede, te devolveremos los créditos.'],
  perfil: ['ok', 'Perfil actualizado.'],
  password: ['ok', 'Contraseña cambiada.'],
  ok: ['ok', 'Cambios guardados.'],
  credito: ['ok', 'Ajuste de créditos aplicado.']
};
function flash(req) { const f = FLASH[req.query.m]; return f ? notice(f[0], icon('check', 18) + ' ' + esc(f[1])) : ''; }

function currentPro(req) {
  if (!req.session || !req.session.marketplaceProId) return null;
  return read('pros').find(p => p.id === req.session.marketplaceProId && p.status === 'approved') || null;
}
function requirePro(req, res, next) { const p = currentPro(req); if (!p) return res.redirect('/servicios/profesionales/entrar'); req.marketplacePro = p; next(); }
function requireAdmin(req, res, next) { if (req.session && req.session.resuelvoAdmin === true) return next(); return res.redirect('/servicios/admin/login'); }
function creditCost(lead) { return Math.max(0, Number(lead.precio_referencia_lead_eur) || 0); }
function regenerate(req) { return new Promise((ok, ko) => req.session.regenerate(e => e ? ko(e) : ok())); }
function saveSession(req) { return new Promise((ok, ko) => req.session.save(e => e ? ko(e) : ok())); }
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const honeypot = '<div class="hp" aria-hidden="true"><label for="web">No rellenar</label><input id="web" name="web" tabindex="-1" autocomplete="off"></div>';
function waLink(tel) { let d = digits(tel); if (d.length === 9 && /^[67]/.test(d)) d = '34' + d; return d.length >= 11 ? 'https://wa.me/' + d : ''; }
function contactBlock(c) {
  const wa = waLink(c.telefono);
  return '<div class="contact">' + icon('user', 18) + ' ' + esc(c.nombre)
    + (c.telefono ? '<a href="tel:' + esc(digits(c.telefono)) + '">' + icon('phone', 18) + esc(c.telefono) + '</a>' : '')
    + (wa ? '<a href="' + esc(wa) + '" rel="noopener" target="_blank">WhatsApp</a>' : '')
    + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + icon('mail', 18) + esc(c.email) + '</a>' : '') + '</div>';
}
function choices(name, items, selected = []) {
  return '<div class="choices">' + items.map(([v, l]) => '<label><input type="checkbox" name="' + name + '" value="' + esc(v) + '"' + (selected.includes(v) ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') + '</div>';
}
function field(name, label, { type = 'text', required = true, value = '', attrs = '', hint = '' } = {}) {
  return '<div class="field"><label for="' + name + '">' + esc(label) + (required ? ' *' : '') + (hint ? ' <span class="hint">' + esc(hint) + '</span>' : '') + '</label><input id="' + name + '" name="' + name + '" type="' + type + '"' + (required ? ' required' : '') + (value ? ' value="' + esc(value) + '"' : '') + ' ' + attrs + '></div>';
}

/* ───────────────────────── Portada y solicitudes ───────────────────────── */

router.get('/', (req, res) => {
  const pre = category(req.query.servicio) ? req.query.servicio : '';
  const preProv = provincias.includes(req.query.provincia) ? req.query.provincia : '';
  const opts = categorias.map(c => '<option value="' + c[0] + '"' + (c[0] === pre ? ' selected' : '') + '>' + esc(c[1]) + '</option>').join('');
  const prov = provincias.slice().sort((a, b) => a.localeCompare(b, 'es')).map(p => '<option' + (p === preProv ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
  const minPrice = Math.min(...categorias.map(c => c[2]));
  const body = '<section class="hero"><div><span class="pill">' + icon('pin', 15) + ' Profesionales cerca de ti</span>'
    + '<h1>Lo necesitas.<br><em>Lo resolvemos.</em></h1>'
    + '<p class="lead">Cuéntanos qué necesitas y hasta tres profesionales de tu zona te contactarán. Gratis y sin compromiso.</p>'
    + '<ol class="steps"><li><b>1</b> Describe el trabajo</li><li><b>2</b> Te contactan</li><li><b>3</b> Tú decides</li></ol></div>'
    + '<form class="hero-form" id="pedir" method="post" action="/servicios/solicitud">'
    + '<h2>¿Qué necesitas resolver?</h2><p class="small" style="margin-bottom:18px">Pedir ayuda es gratis. Tarda menos de un minuto.</p>'
    + '<div class="field"><label for="servicio">Servicio *</label><select id="servicio" name="servicio" required><option value="">Elige una categoría</option>' + opts + '</select></div>'
    + '<div class="grid"><div class="field"><label for="provincia">Provincia *</label><select id="provincia" name="provincia" required><option value="">Selecciona</option>' + prov + '</select></div>'
    + field('municipio', 'Municipio', { attrs: 'maxlength="80" placeholder="Tu localidad" autocomplete="address-level2"' }) + '</div>'
    + '<div class="field"><label for="urgencia">¿Para cuándo?</label><select id="urgencia" name="urgencia">' + Object.entries(urgencias).map(([k, v]) => '<option value="' + k + '"' + (k === 'esta_semana' ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></div>'
    + '<div class="field"><label for="descripcion">Describe lo que necesitas *</label><textarea id="descripcion" name="descripcion" maxlength="2000" minlength="8" placeholder="Ejemplo: tengo un grifo de la cocina que gotea y quiero cambiarlo." required></textarea></div>'
    + '<div class="grid">' + field('nombre', 'Tu nombre', { attrs: 'maxlength="80" autocomplete="name"' }) + field('telefono', 'Teléfono', { type: 'tel', attrs: 'maxlength="24" inputmode="tel" autocomplete="tel" placeholder="600 000 000"' })
    + '<div class="full">' + field('email', 'Email', { type: 'email', required: false, hint: '(opcional)', attrs: 'maxlength="160" autocomplete="email"' }) + '</div></div>'
    + honeypot
    + '<div class="field"><label class="check"><input type="checkbox" name="consentimiento" value="si" required> <span>Acepto que mis datos se compartan con un máximo de 3 profesionales compatibles para responder a esta solicitud, según la <a href="/servicios/legal/privacidad">política de privacidad</a>. *</span></label></div>'
    + '<button class="block" type="submit">Encontrar profesionales ' + icon('arrow', 18) + '</button>'
    + '<p class="small" style="margin:12px 0 0">Tu teléfono no se publica. Enviar no garantiza disponibilidad ni presupuesto.</p></form></section>'
    + '<section class="section-head"><h2>Encuentra ayuda para casi cualquier cosa</h2><p class="muted">Elige un servicio y te llevamos directamente al formulario.</p></section>'
    + '<section class="cats">' + categorias.filter(c => c[0] !== 'otros').map(c => '<a class="cat" href="/servicios?servicio=' + c[0] + '#pedir"><span class="tile">' + icon(c[0]) + '</span><span><strong>' + esc(c[1]) + '</strong><span class="go">Pedir ayuda ' + icon('arrow', 14) + '</span></span></a>').join('') + '</section>'
    + '<section class="section-head"><h2>Una forma más sencilla de resolverlo</h2></section>'
    + '<section class="grid3"><article class="trust">' + icon('lock', 26) + '<b>Tus datos, bajo control</b><p>Solo los ven, como máximo, tres profesionales compatibles con tu solicitud, y solo con tu consentimiento.</p></article>'
    + '<article class="trust">' + icon('shield', 26) + '<b>Profesionales revisados</b><p>Revisamos cada cuenta antes de que pueda acceder a solicitudes de clientes.</p></article>'
    + '<article class="trust">' + icon('check', 26) + '<b>Sin compromiso</b><p>Recibir respuesta no te obliga a contratar. Compara y decide con tranquilidad.</p></article></section>'
    + '<section class="pro-band"><div><span class="pill dark">Para profesionales</span><h2 style="margin-top:14px">Clientes de tu zona, sin cuotas fijas</h2>'
    + '<ul><li>' + icon('check', 20) + ' Solo ves trabajos de tus servicios y provincias.</li><li>' + icon('check', 20) + ' Pagas únicamente por los contactos que eliges.</li><li>' + icon('check', 20) + ' Cada solicitud se comparte con un máximo de tres profesionales.</li><li>' + icon('check', 20) + ' Si un contacto no es válido, te devolvemos los créditos.</li></ul>'
    + '<a class="btn dark" href="/servicios/profesionales/registro">Darme de alta ' + icon('arrow', 18) + '</a></div>'
    + '<div class="price-card"><small>Precio por contacto</small><div style="font-size:2.6rem;font-weight:900;letter-spacing:-.05em;margin:6px 0">desde ' + eur(minPrice) + '</div><p style="margin:0;color:#c4d3cc;line-height:1.6">Sin permanencia ni cuota mensual. El precio depende del tipo de trabajo y se muestra antes de desbloquear.</p></div></section>'
    + '<section class="section-head"><h2>Preguntas frecuentes</h2></section><section class="card">'
    + '<details><summary>¿Cuánto cuesta pedir ayuda?</summary><p class="muted">Nada. Pedir ayuda es gratis para los clientes. Los profesionales pagan por acceder a los contactos.</p></details>'
    + '<details><summary>¿Quién verá mis datos?</summary><p class="muted">Como máximo tres profesionales aprobados que trabajan en tu provincia y en el servicio que has pedido. Nadie más.</p></details>'
    + '<details><summary>¿Cuándo me contactarán?</summary><p class="muted">Depende de la disponibilidad en tu zona. Las solicitudes urgentes se destacan a los profesionales.</p></details>'
    + '<details><summary>¿Puedo borrar mis datos?</summary><p class="muted">Sí. Puedes pedirlo desde <a href="/servicios/privacidad/derechos">esta página</a>. Además, las solicitudes se eliminan automáticamente a los 180 días.</p></details></section>';
  res.type('html').send(page('Profesionales de confianza en tu barrio', body, { ctx: currentPro(req) ? 'pro' : 'public', canonical: '/servicios' }));
});

router.post('/solicitud', publicFormLimiter, (req, res) => {
  const b = req.body || {};
  if (b.web) return res.status(201).type('html').send(page('Solicitud recibida', '<section class="success"><div class="badge">' + icon('check', 36) + '</div><h1>Solicitud recibida</h1><p class="lead" style="margin:auto">Gracias. Te contactarán en cuanto haya profesionales disponibles.</p></section>', { noindex: true }));
  const servicio = String(b.servicio || ''), provincia = String(b.provincia || ''), municipio = str(b.municipio, 80), nombre = str(b.nombre, 80);
  const telefono = String(b.telefono || '').replace(/[^+\d ()-]/g, '').trim().slice(0, 24), descripcion = str(b.descripcion, 2000), email = str(b.email, 160).toLowerCase();
  const cat = category(servicio);
  if (!cat || !provincias.includes(provincia) || !municipio || !nombre || digits(telefono).length < 9 || descripcion.length < 8 || b.consentimiento !== 'si' || (email && !EMAIL_RE.test(email))) {
    return message(res, 'Revisa la solicitud', 'Faltan campos obligatorios o alguno no es válido (teléfono de al menos 9 cifras, descripción de al menos 8 caracteres y consentimiento marcado).', 400, { back: ['/servicios#pedir', 'Volver al formulario'] });
  }
  const leads = read('leads'), t = now();
  const lead = {
    id: 'LEAD-' + crypto.randomBytes(5).toString('hex').toUpperCase(), servicio, nombre_categoria: cat[1], precio_referencia_lead_eur: cat[2], provincia, municipio,
    urgencia: Object.hasOwn(urgencias, b.urgencia) ? b.urgencia : 'esta_semana', descripcion, cliente: { nombre, telefono, email },
    consentimiento_contacto: true, estado: 'nuevo', asignaciones: [], created_at: t, updated_at: t, retention_until: new Date(Date.now() + 180 * 86400000).toISOString()
  };
  leads.push(lead); write('leads', leads); audit('lead.created', 'customer', { leadId: lead.id, category: servicio, province: provincia });
  notify.leadCreated(lead, read('pros').filter(p => p.status === 'approved' && (p.provincias || []).includes(provincia) && (p.categorias || []).includes(servicio)));
  res.status(201).type('html').send(page('Solicitud recibida', '<section class="success"><div class="badge">' + icon('check', 36) + '</div><h1>Solicitud recibida</h1>'
    + '<p class="lead" style="margin:0 auto 18px">Hemos guardado tu solicitud de ' + esc(cat[1].toLowerCase()) + ' en ' + esc(municipio) + ' (' + esc(provincia) + ').</p>'
    + '<p>Tu referencia: <span class="ref">' + esc(lead.id) + '</span></p>'
    + '<div class="card" style="text-align:left;margin-top:26px"><h2>¿Qué pasa ahora?</h2><ol class="muted" style="padding-left:20px;margin:0"><li>Avisamos a los profesionales aprobados de tu zona.</li><li>Hasta tres de ellos podrán ver tus datos y te llamarán o escribirán.</li><li>Compara, pide presupuesto y decide sin compromiso.</li></ol>'
    + '<p class="small" style="margin:14px 0 0">Guarda la referencia si quieres ejercer tus derechos de privacidad sobre esta solicitud.</p></div>'
    + '<a class="btn alt" href="/servicios">Volver al inicio</a></section>', { noindex: true }));
});

/* ───────────────────────── Profesionales: alta y acceso ───────────────────────── */

router.get('/profesionales', (req, res) => res.redirect('/servicios/profesionales/registro'));
router.get('/profesionales/registro', (req, res) => {
  const body = '<div class="grid" style="align-items:start;gap:32px"><div><span class="pill">Para profesionales</span><h1 style="margin-top:14px">Recibe clientes de tu zona</h1><p class="lead">Date de alta gratis. Revisamos tu cuenta y, una vez aprobada, verás las solicitudes de tus servicios y provincias.</p>'
    + '<div class="stack" style="margin-top:22px"><div class="row">' + icon('check') + ' <span>Sin cuota mensual ni permanencia</span></div><div class="row">' + icon('check') + ' <span>Pagas solo por los contactos que eliges</span></div><div class="row">' + icon('check') + ' <span>Máximo tres profesionales por solicitud</span></div><div class="row">' + icon('check') + ' <span>Devolución si el contacto no es válido</span></div></div></div>'
    + '<form class="card" method="post" action="/servicios/profesionales/registro"><h2>Crear cuenta profesional</h2>'
    + '<div class="grid">' + field('empresa', 'Nombre comercial', { attrs: 'maxlength="100" autocomplete="organization"' }) + field('nombre_contacto', 'Persona de contacto', { attrs: 'maxlength="80" autocomplete="name"' })
    + field('email', 'Email', { type: 'email', attrs: 'maxlength="160" autocomplete="email"' }) + field('telefono', 'Teléfono', { type: 'tel', attrs: 'maxlength="24" autocomplete="tel"' })
    + '<div class="full">' + field('password', 'Contraseña', { type: 'password', hint: '(mínimo 12 caracteres)', attrs: 'minlength="12" maxlength="72" autocomplete="new-password"' }) + '</div></div>'
    + '<fieldset><legend>Servicios que ofreces *</legend>' + choices('categorias', categorias.map(c => [c[0], c[1]])) + '</fieldset>'
    + '<fieldset><legend>Provincias donde trabajas *</legend>' + choices('provincias', provincias.slice().sort((a, b) => a.localeCompare(b, 'es')).map(p => [p, p])) + '</fieldset>'
    + honeypot
    + '<div class="field"><label class="check"><input type="checkbox" name="acepta" value="si" required> <span>Acepto las <a href="/servicios/legal/condiciones">condiciones para profesionales</a> y la <a href="/servicios/legal/privacidad">política de privacidad</a>. *</span></label></div>'
    + '<button class="block" type="submit">Enviar para revisión</button><p class="small" style="margin:12px 0 0">¿Ya tienes cuenta? <a href="/servicios/profesionales/entrar">Entra aquí</a>.</p></form></div>';
  res.type('html').send(page('Alta de profesionales', body, { current: '/servicios/profesionales/registro', canonical: '/servicios/profesionales/registro', description: 'Date de alta gratis en Ayuda en el Barrio y recibe solicitudes de clientes de tu zona. Sin cuotas: paga solo por los contactos que elijas.' }));
});

router.post('/profesionales/registro', authLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.web) return message(res, 'Solicitud enviada', 'Tu cuenta está pendiente de revisión.');
  const email = str(b.email, 160).toLowerCase(), empresa = str(b.empresa, 100), nombre = str(b.nombre_contacto, 80), telefono = str(b.telefono, 24), password = String(b.password || '');
  const cats = list(b.categorias).filter(x => category(x)), provs = list(b.provincias).filter(x => provincias.includes(x));
  if (!EMAIL_RE.test(email) || !empresa || !nombre || digits(telefono).length < 9 || password.length < 12 || password.length > 72 || !cats.length || !provs.length || b.acepta !== 'si') {
    return message(res, 'Datos incompletos', 'Revisa email, teléfono, contraseña (entre 12 y 72 caracteres), servicios, provincias y la aceptación de condiciones.', 400, { back: ['/servicios/profesionales/registro', 'Volver al formulario'] });
  }
  if (read('pros').some(p => p.email === email)) return message(res, 'Cuenta existente', 'Ya hay una cuenta con ese email. Prueba a iniciar sesión.', 409, { back: ['/servicios/profesionales/entrar', 'Iniciar sesión'] });
  const password_hash = await bcrypt.hash(password, 12);
  const pros = read('pros'); // releer tras el await
  if (pros.some(p => p.email === email)) return message(res, 'Cuenta existente', 'Ya hay una cuenta con ese email. Prueba a iniciar sesión.', 409, { back: ['/servicios/profesionales/entrar', 'Iniciar sesión'] });
  const t = now();
  const pro = { id: 'PRO-' + crypto.randomBytes(6).toString('hex').toUpperCase(), empresa, nombre_contacto: nombre, email, telefono, password_hash, categorias: cats, provincias: provs, status: 'pending', verified: false, created_at: t, updated_at: t, consentimiento_at: t };
  pros.push(pro); write('pros', pros); audit('professional.registered', pro.id, { categories: cats.length, provinces: provs.length });
  notify.professionalRegistered(pro);
  return message(res, 'Solicitud enviada', 'Tu cuenta está pendiente de revisión. Podrás iniciar sesión cuando el equipo la apruebe.');
}));

router.get('/profesionales/entrar', (req, res) => {
  if (currentPro(req)) return res.redirect('/servicios/profesionales/panel');
  const body = '<section class="card narrow"><span class="pill">Acceso profesional</span><h1 style="font-size:2.2rem;margin-top:14px">Entra en tu panel</h1>'
    + '<form method="post" action="/servicios/profesionales/entrar">' + field('email', 'Email', { type: 'email', attrs: 'autocomplete="email"' }) + field('password', 'Contraseña', { type: 'password', attrs: 'autocomplete="current-password"' })
    + '<button class="block" type="submit">Entrar</button></form><p class="small" style="margin:16px 0 0">¿Aún no tienes cuenta? <a href="/servicios/profesionales/registro">Date de alta gratis</a>. <a href="/servicios/profesionales/recuperar">¿Has olvidado la contraseña?</a></p></section>';
  res.type('html').send(page('Acceso profesional', body, { noindex: true }));
});

router.post('/profesionales/entrar', authLimiter, wrap(async (req, res) => {
  const email = str(req.body.email, 160).toLowerCase(), password = String(req.body.password || ''), pro = read('pros').find(p => p.email === email);
  if (!pro || !(await bcrypt.compare(password, pro.password_hash || ''))) { audit('professional.login_failed', 'anonymous'); return message(res, 'No se pudo iniciar sesión', 'Email o contraseña incorrectos.', 401, { back: ['/servicios/profesionales/entrar', 'Volver a intentarlo'] }); }
  if (pro.status !== 'approved') {
    const text = { rejected: 'La solicitud no ha sido aprobada. Contacta con soporte.', suspended: 'La cuenta está suspendida. Contacta con soporte.' }[pro.status] || 'La cuenta está pendiente de aprobación. Te avisaremos cuando esté activa.';
    return message(res, 'Cuenta no activa', text, 403);
  }
  await regenerate(req); // evita fijación de sesión
  req.session.marketplaceProId = pro.id;
  await saveSession(req);
  audit('professional.login', pro.id);
  res.redirect('/servicios/profesionales/panel');
}));

function logoutPro(req, res) { if (req.session) delete req.session.marketplaceProId; res.redirect('/servicios'); }
router.post('/profesionales/salir', logoutPro);
router.get('/profesionales/salir', (req, res) => res.type('html').send(page('Salir', '<section class="card narrow"><h1 style="font-size:2rem">¿Cerrar sesión?</h1><form method="post" action="/servicios/profesionales/salir"><button type="submit">Cerrar sesión</button></form></section>', { noindex: true })));

/* ───────────────────────── Recuperación de contraseña ───────────────────────── */

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

router.get('/profesionales/recuperar', (req, res) => {
  const contacto = legal.titular().email;
  const body = '<section class="card narrow"><span class="pill">Acceso profesional</span><h1 style="font-size:2.1rem;margin-top:14px">Recuperar contraseña</h1>'
    + (notify.mailEnabled()
      ? '<p class="muted">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p><form method="post" action="/servicios/profesionales/recuperar">' + field('email', 'Email', { type: 'email', attrs: 'autocomplete="email"' }) + honeypot + '<button class="block" type="submit">Enviar enlace</button></form>'
      : '<p class="muted">Escríbenos' + (contacto ? ' a <a href="mailto:' + esc(contacto) + '">' + esc(contacto) + '</a>' : '') + ' desde el email de tu cuenta y te ayudaremos a recuperar el acceso.</p>')
    + '<p class="small" style="margin:16px 0 0"><a href="/servicios/profesionales/entrar">Volver a entrar</a></p></section>';
  res.type('html').send(page('Recuperar contraseña', body, { noindex: true }));
});

router.post('/profesionales/recuperar', authLimiter, wrap(async (req, res) => {
  const generic = () => message(res, 'Revisa tu correo', 'Si existe una cuenta activa con ese email, recibirás un enlace para cambiar la contraseña en unos minutos. Caduca en 1 hora.', 200, { back: ['/servicios/profesionales/entrar', 'Volver a entrar'] });
  const email = str(req.body.email, 160).toLowerCase();
  if (req.body.web || !notify.mailEnabled() || !EMAIL_RE.test(email)) return generic();
  const pros = read('pros'), pro = pros.find(p => p.email === email && p.status === 'approved');
  if (!pro) { audit('professional.reset_unknown', 'anonymous'); return generic(); }
  const token = crypto.randomBytes(32).toString('base64url');
  pro.reset = { hash: sha256(token), expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString() };
  write('pros', pros); audit('professional.reset_requested', pro.id);
  const baseUrl = (process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
  await notify.passwordReset(pro, baseUrl + '/servicios/profesionales/restablecer?token=' + encodeURIComponent(token));
  return generic();
}));

function proByResetToken(token) {
  if (!token || typeof token !== 'string') return { pros: [], pro: null };
  const pros = read('pros'), h = sha256(token);
  const pro = pros.find(p => p.reset && p.reset.hash && p.reset.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(p.reset.hash), Buffer.from(h)) && Date.parse(p.reset.expires_at) > Date.now());
  return { pros, pro: pro || null };
}

router.get('/profesionales/restablecer', (req, res) => {
  const token = String(req.query.token || '');
  if (!proByResetToken(token).pro) return message(res, 'Enlace no válido', 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.', 400, { back: ['/servicios/profesionales/recuperar', 'Pedir otro enlace'] });
  const body = '<section class="card narrow"><h1 style="font-size:2.1rem">Elige una contraseña nueva</h1><form method="post" action="/servicios/profesionales/restablecer"><input type="hidden" name="token" value="' + esc(token) + '">'
    + field('nueva', 'Nueva contraseña', { type: 'password', hint: '(12–72 caracteres)', attrs: 'minlength="12" maxlength="72" autocomplete="new-password"' }) + '<button class="block" type="submit">Guardar contraseña</button></form></section>';
  res.set('referrer-policy', 'no-referrer').type('html').send(page('Nueva contraseña', body, { noindex: true }));
});

router.post('/profesionales/restablecer', authLimiter, wrap(async (req, res) => {
  const nueva = String(req.body.nueva || '');
  if (nueva.length < 12 || nueva.length > 72) return message(res, 'Contraseña no válida', 'La contraseña debe tener entre 12 y 72 caracteres.', 400, { back: ['/servicios/profesionales/recuperar', 'Volver'] });
  const hash = await bcrypt.hash(nueva, 12);
  const { pros, pro } = proByResetToken(String(req.body.token || ''));
  if (!pro) return message(res, 'Enlace no válido', 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.', 400, { back: ['/servicios/profesionales/recuperar', 'Pedir otro enlace'] });
  pro.password_hash = hash; delete pro.reset; pro.updated_at = now();
  write('pros', pros); audit('professional.password_reset', pro.id);
  return message(res, 'Contraseña cambiada', 'Ya puedes entrar con tu nueva contraseña.', 200, { back: ['/servicios/profesionales/entrar', 'Entrar'] });
}));

/* ───────────────────────── Panel profesional ───────────────────────── */

function leadAvailableFor(l, pro) {
  const asg = l.asignaciones || [];
  return OPEN_STATES.includes(l.estado) && pro.provincias.includes(l.provincia) && pro.categorias.includes(l.servicio) && !asg.some(a => a.proId === pro.id) && asg.length < MAX_PROS_PER_LEAD;
}

router.get('/profesionales/panel', requirePro, (req, res) => {
  const pro = req.marketplacePro, leads = read('leads'), bal = balance(pro.id), refunds = read('refunds').filter(r => r.proId === pro.id);
  const available = leads.filter(l => leadAvailableFor(l, pro)).sort((a, b) => (b.urgencia === 'hoy') - (a.urgencia === 'hoy') || String(b.created_at).localeCompare(String(a.created_at)));
  const unlocked = leads.filter(l => (l.asignaciones || []).some(a => a.proId === pro.id)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const opp = l => {
    const cost = creditCost(l), n = (l.asignaciones || []).length;
    return '<article class="item opp"><span class="tile">' + icon(l.servicio) + '</span><div><div class="row" style="margin-bottom:8px"><h3 style="margin:0">' + esc(l.nombre_categoria) + '</h3>' + (l.urgencia === 'hoy' ? '<span class="pill bad">Urgente</span>' : '') + '</div>'
      + '<p class="small meta">' + icon('pin', 16) + esc(l.municipio) + ', ' + esc(l.provincia) + ' · ' + icon('clock', 16) + esc(urgencias[l.urgencia] || l.urgencia) + ' · ' + esc(hace(l.created_at)) + ' · ' + n + '/' + MAX_PROS_PER_LEAD + ' profesionales</p>'
      + '<p style="margin:0;line-height:1.6">' + esc(l.descripcion) + '</p></div>'
      + '<div style="text-align:right"><div class="price">' + eur(cost) + '</div><small>en créditos</small>'
      + (bal >= cost ? '<form method="post" action="/servicios/profesionales/leads/' + encodeURIComponent(l.id) + '/desbloquear" style="margin-top:10px"><button class="sm" type="submit">Desbloquear contacto</button></form>'
        : '<div style="margin-top:10px"><a class="btn sm alt" href="/servicios/profesionales/creditos">Saldo insuficiente · Recargar</a></div>') + '</div></article>';
  };
  const mine = l => {
    const a = (l.asignaciones || []).find(x => x.proId === pro.id) || {}, r = refunds.find(x => x.leadId === l.id);
    const canReport = !r && Date.now() - Date.parse(a.at || 0) < REFUND_WINDOW_DAYS * 86400000 && l.estado !== 'eliminado';
    return '<article class="item"><div class="row between" style="margin-bottom:8px"><div class="row"><h3 style="margin:0">' + esc(l.nombre_categoria) + '</h3><span class="small mono">' + esc(l.id) + '</span></div><span class="small">Desbloqueado ' + esc(hace(a.at)) + ' · ' + eur(a.cost) + '</span></div>'
      + '<div class="small" style="margin-bottom:8px">' + esc(l.municipio) + ', ' + esc(l.provincia) + ' · ' + esc(urgencias[l.urgencia] || '') + '</div><p style="line-height:1.6">' + esc(l.descripcion) + '</p>'
      + (l.estado === 'eliminado' ? notice('warn', 'El cliente ha pedido suprimir sus datos.') : contactBlock(l.cliente || {}))
      + (r ? '<p class="small" style="margin:10px 0 0">Aviso de contacto no válido: ' + badge(r.estado) + '</p>' : '')
      + (canReport ? '<details style="padding-bottom:0"><summary class="small">¿El contacto no es válido?</summary><form method="post" action="/servicios/profesionales/leads/' + encodeURIComponent(l.id) + '/reportar" style="margin-top:12px"><div class="grid"><div class="field"><label for="motivo-' + esc(l.id) + '">Motivo</label><select id="motivo-' + esc(l.id) + '" name="motivo"><option value="telefono_erroneo">Teléfono erróneo</option><option value="no_responde">No responde en 48 h</option><option value="spam">Solicitud falsa o spam</option><option value="ya_resuelto">Ya estaba resuelto</option><option value="otro">Otro</option></select></div><div class="field"><label for="detalle-' + esc(l.id) + '">Detalle</label><input id="detalle-' + esc(l.id) + '" name="detalle" maxlength="500"></div></div><button class="sm alt" type="submit">Solicitar devolución</button></form></details>' : '')
      + '</article>';
  };
  const body = '<div class="row between" style="margin-bottom:18px"><div><h1 style="margin-bottom:6px">Hola, ' + esc(pro.nombre_contacto || pro.empresa) + '</h1><p class="muted" style="margin:0">' + esc(pro.empresa) + ' · ' + badge('approved') + ' ' + (pro.verified ? '<span class="pill dark">' + icon('shield', 14) + ' Verificado</span>' : '') + '</p></div></div>'
    + flash(req)
    + '<section class="grid4" style="margin-bottom:18px"><div class="stat dark"><small>Saldo</small><strong>' + eur(bal) + '</strong></div><div class="stat"><small>Oportunidades</small><strong>' + available.length + '</strong></div><div class="stat"><small>Contactos</small><strong>' + unlocked.length + '</strong></div><div class="stat"><small>Zonas</small><strong>' + pro.provincias.length + '</strong></div></section>'
    + (bal <= 0 ? notice('warn', icon('coins', 18) + ' <span>No tienes saldo. <a href="/servicios/profesionales/creditos">Recarga créditos</a> para desbloquear contactos.</span>') : '')
    + '<section class="card"><h2>Oportunidades para ti</h2><p class="small">Solicitudes abiertas de tus servicios y provincias. El precio se descuenta de tu saldo al desbloquear.</p>'
    + (available.length ? available.map(opp).join('') : '<div class="empty">' + icon('clock', 30) + '<p>No hay solicitudes nuevas que encajen ahora mismo. Vuelve más tarde o <a href="/servicios/profesionales/perfil">amplía tus zonas y servicios</a>.</p></div>') + '</section>'
    + '<section class="card"><h2>Mis contactos</h2>' + (unlocked.length ? unlocked.map(mine).join('') : '<div class="empty"><p>Aún no has desbloqueado contactos.</p></div>') + '</section>';
  res.type('html').send(page('Panel profesional', body, { ctx: 'pro', current: '/servicios/profesionales/panel' }));
});

router.post('/profesionales/leads/:id/desbloquear', requirePro, (req, res) => {
  const pro = req.marketplacePro, leads = read('leads'), lead = leads.find(l => l.id === req.params.id);
  if (!lead || !OPEN_STATES.includes(lead.estado)) return message(res, 'Solicitud no disponible', 'Esta solicitud ya no está abierta.', 404, { ctx: 'pro', back: ['/servicios/profesionales/panel', 'Volver al panel'] });
  if (!pro.provincias.includes(lead.provincia) || !pro.categorias.includes(lead.servicio)) return message(res, 'No compatible', 'Esta solicitud no coincide con tus zonas y servicios.', 403, { ctx: 'pro', back: ['/servicios/profesionales/panel', 'Volver al panel'] });
  lead.asignaciones = lead.asignaciones || [];
  if (lead.asignaciones.some(a => a.proId === pro.id)) return res.redirect('/servicios/profesionales/panel');
  if (lead.asignaciones.length >= MAX_PROS_PER_LEAD) return message(res, 'Cupo completo', 'Esta solicitud ya ha alcanzado el límite de profesionales.', 409, { ctx: 'pro', back: ['/servicios/profesionales/panel', 'Volver al panel'] });
  const cost = creditCost(lead), ledger = read('ledger');
  if (balance(pro.id, ledger) < cost) return message(res, 'Saldo insuficiente', 'No tienes créditos suficientes para desbloquear este contacto.', 402, { ctx: 'pro', back: ['/servicios/profesionales/creditos', 'Recargar créditos'] });
  const previousLedger = ledger.slice(), t = now();
  ledger.push({ id: crypto.randomUUID(), proId: pro.id, leadId: lead.id, amount: -cost, type: 'lead_unlock', at: t });
  lead.asignaciones.push({ proId: pro.id, at: t, cost });
  if (lead.estado === 'nuevo') lead.estado = 'asignado';
  lead.updated_at = t;
  try { write('ledger', ledger); write('leads', leads); }
  catch (err) { try { write('ledger', previousLedger); } catch (e) { console.error('[ayuda-barrio] Falló la reversión de crédito:', e.message); } throw err; }
  audit('lead.unlocked', pro.id, { leadId: lead.id, cost });
  res.redirect('/servicios/profesionales/panel?m=desbloqueado');
});

const MOTIVOS = { telefono_erroneo: 'Teléfono erróneo', no_responde: 'No responde', spam: 'Falsa o spam', ya_resuelto: 'Ya resuelto', otro: 'Otro' };
router.post('/profesionales/leads/:id/reportar', requirePro, (req, res) => {
  const pro = req.marketplacePro, lead = read('leads').find(l => l.id === req.params.id);
  const a = lead && (lead.asignaciones || []).find(x => x.proId === pro.id);
  const back = { ctx: 'pro', back: ['/servicios/profesionales/panel', 'Volver al panel'] };
  if (!a) return message(res, 'No disponible', 'Solo puedes avisar de contactos que hayas desbloqueado.', 404, back);
  const refunds = read('refunds');
  if (refunds.some(r => r.proId === pro.id && r.leadId === lead.id)) return message(res, 'Ya enviado', 'Ya enviaste un aviso para este contacto.', 409, back);
  if (Date.now() - Date.parse(a.at) > REFUND_WINDOW_DAYS * 86400000) return message(res, 'Fuera de plazo', 'Solo se aceptan avisos en los ' + REFUND_WINDOW_DAYS + ' días siguientes al desbloqueo.', 400, back);
  const motivo = Object.hasOwn(MOTIVOS, req.body.motivo) ? req.body.motivo : 'otro';
  refunds.push({ id: 'REF-' + crypto.randomBytes(5).toString('hex').toUpperCase(), proId: pro.id, leadId: lead.id, amount: Number(a.cost) || 0, motivo, detalle: str(req.body.detalle, 500), estado: 'pendiente', created_at: now() });
  write('refunds', refunds); audit('refund.requested', pro.id, { leadId: lead.id, motivo });
  res.redirect('/servicios/profesionales/panel?m=reporte');
});

/* ───────────────────────── Créditos y pagos ───────────────────────── */

const LEDGER_TYPES = { lead_unlock: 'Contacto desbloqueado', purchase: 'Recarga', refund: 'Devolución', admin_adjust: 'Ajuste', admin_test_credit: 'Crédito de prueba', test_credit: 'Crédito de prueba', welcome: 'Bienvenida' };
router.get('/profesionales/creditos', requirePro, (req, res) => {
  const pro = req.marketplacePro, bal = balance(pro.id), mov = read('ledger').filter(x => x.proId === pro.id).reverse().slice(0, 100), on = payments.enabled(), contacto = legal.titular().email;
  const status = req.query.pago === 'ok' ? notice('ok', icon('check', 18) + ' Pago recibido. Los créditos aparecerán en tu saldo en unos segundos.') : req.query.pago === 'cancelado' ? notice('warn', 'Pago cancelado. No se ha realizado ningún cargo.') : '';
  const body = '<h1>Créditos</h1>' + status
    + '<section class="grid3" style="margin-bottom:18px"><div class="stat dark"><small>Saldo disponible</small><strong>' + eur(bal) + '</strong></div><div class="stat"><small>1 crédito</small><strong>1 €</strong></div><div class="stat"><small>Contacto desde</small><strong>' + eur(Math.min(...categorias.map(c => c[2]))) + '</strong></div></section>'
    + '<section class="card"><h2>Recargar saldo</h2>' + (on ? '<p class="small">Pago seguro con tarjeta a través de Stripe. IVA incluido.</p>' : notice('warn', 'La recarga con tarjeta estará disponible próximamente.' + (contacto ? ' Mientras tanto, escríbenos a <a href="mailto:' + esc(contacto) + '">' + esc(contacto) + '</a> para recargar por transferencia.' : '')))
    + '<div class="grid3">' + payments.PACKS.map((p, i) => '<form class="pack' + (i === 1 ? ' best' : '') + '" method="post" action="/servicios/profesionales/creditos/checkout"><input type="hidden" name="pack" value="' + p.id + '"><span class="row between"><b>' + esc(p.label) + '</b>' + (i === 1 ? '<span class="pill lime">Más elegido</span>' : '') + '</span><span class="amount">' + eur(p.price) + '</span><span class="muted">' + p.credits + ' créditos' + (p.bonus ? ' · <b style="color:var(--green)">' + esc(p.bonus) + '</b>' : '') + '</span><button class="block" type="submit"' + (on ? '' : ' disabled') + ' style="margin-top:10px">' + (on ? 'Comprar' : 'Próximamente') + '</button></form>').join('') + '</div></section>'
    + '<section class="card"><h2>Movimientos</h2>' + (mov.length ? '<div class="tbl"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Referencia</th><th style="text-align:right">Importe</th></tr></thead><tbody>' + mov.map(x => '<tr><td>' + esc(fecha(x.at)) + '</td><td>' + esc(LEDGER_TYPES[x.type] || x.type) + (x.note ? '<br><span class="small">' + esc(x.note) + '</span>' : '') + '</td><td class="mono">' + esc(x.leadId || '') + '</td><td style="text-align:right;font-weight:800;color:' + (x.amount < 0 ? 'var(--bad)' : 'var(--green)') + '">' + (x.amount > 0 ? '+' : '') + eur(x.amount) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty"><p>Sin movimientos todavía.</p></div>') + '</section>';
  res.type('html').send(page('Créditos', body, { ctx: 'pro', current: '/servicios/profesionales/creditos' }));
});

router.post('/profesionales/creditos/checkout', requirePro, wrap(async (req, res) => {
  const back = { ctx: 'pro', back: ['/servicios/profesionales/creditos', 'Volver a créditos'] };
  if (!payments.enabled()) return message(res, 'Pagos no disponibles', 'La recarga con tarjeta todavía no está activada.', 503, back);
  const p = payments.pack(req.body.pack);
  if (!p) return message(res, 'Paquete no válido', 'Elige uno de los paquetes disponibles.', 400, back);
  const baseUrl = (process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
  const session = await payments.createCheckout({ pack: p, pro: req.marketplacePro, baseUrl });
  const pays = read('payments');
  pays.push({ id: session.id, proId: req.marketplacePro.id, pack: p.id, amount: p.price, credits: p.credits, estado: 'iniciado', created_at: now() });
  write('payments', pays); audit('payment.checkout_created', req.marketplacePro.id, { pack: p.id });
  res.redirect(303, session.url);
}));

// Montado en server.js con express.raw() ANTES de los parsers globales.
function stripeWebhook(req, res) {
  if (!payments.enabled()) return res.status(404).json({ error: 'disabled' });
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!payments.verifySignature(raw, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: 'bad signature' });
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'bad json' }); }
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return res.json({ received: true });
  const s = event.data && event.data.object || {};
  if (s.payment_status !== 'paid') return res.json({ received: true });
  const p = payments.pack(s.metadata && s.metadata.pack), proId = s.metadata && s.metadata.proId;
  if (!p || s.amount_total !== p.price * 100 || s.currency !== 'eur' || !read('pros').some(x => x.id === proId)) { audit('payment.rejected', 'stripe', { session: s.id }); return res.status(400).json({ error: 'mismatch' }); }
  const pays = read('payments'); let pay = pays.find(x => x.id === s.id);
  if (pay && pay.estado === 'pagado') return res.json({ received: true, duplicate: true });
  const ledger = read('ledger');
  // Si el crédito llegó a escribirse pero falló el pago, el reintento de Stripe
  // termina el segundo paso en vez de reconocer un pago que no aparece en el panel.
  if (ledger.some(x => x.paymentId === s.id)) {
    if (!pay) { pay = { id: s.id, proId, pack: p.id, amount: p.price, credits: p.credits, created_at: now() }; pays.push(pay); }
    pay.estado = 'pagado'; pay.paid_at = pay.paid_at || now(); write('payments', pays);
    audit('payment.reconciled', 'stripe', { proId, pack: p.id, amount: p.price });
    return res.json({ received: true, duplicate: true });
  }
  ledger.push({ id: crypto.randomUUID(), proId, amount: p.credits, type: 'purchase', paymentId: s.id, note: 'Paquete ' + p.label + ' (' + eur(p.price) + ')', at: now() });
  write('ledger', ledger);
  if (!pay) { pay = { id: s.id, proId, pack: p.id, amount: p.price, credits: p.credits, created_at: now() }; pays.push(pay); }
  pay.estado = 'pagado'; pay.paid_at = now(); write('payments', pays);
  audit('payment.paid', 'stripe', { proId, pack: p.id, amount: p.price });
  notify.paymentPaid(proId, p);
  res.json({ received: true });
}

/* ───────────────────────── Perfil profesional ───────────────────────── */

router.get('/profesionales/perfil', requirePro, (req, res) => {
  const pro = req.marketplacePro;
  const body = '<h1>Mi perfil</h1>' + flash(req)
    + '<div class="grid" style="align-items:start"><form class="card" method="post" action="/servicios/profesionales/perfil"><h2>Datos y zonas</h2>'
    + '<dl class="kv" style="margin:0 0 18px"><dt>Empresa</dt><dd>' + esc(pro.empresa) + '</dd><dt>Email</dt><dd>' + esc(pro.email) + '</dd><dt>ID</dt><dd class="mono">' + esc(pro.id) + '</dd></dl>'
    + field('nombre_contacto', 'Persona de contacto', { value: pro.nombre_contacto, attrs: 'maxlength="80"' }) + field('telefono', 'Teléfono', { type: 'tel', value: pro.telefono, attrs: 'maxlength="24"' })
    + '<fieldset><legend>Servicios</legend>' + choices('categorias', categorias.map(c => [c[0], c[1]]), pro.categorias) + '</fieldset>'
    + '<fieldset><legend>Provincias</legend>' + choices('provincias', provincias.slice().sort((a, b) => a.localeCompare(b, 'es')).map(p => [p, p]), pro.provincias) + '</fieldset>'
    + '<button type="submit">Guardar cambios</button><p class="small" style="margin:12px 0 0">Para cambiar el nombre comercial o el email, contacta con soporte.</p></form>'
    + '<form class="card" method="post" action="/servicios/profesionales/password"><h2>Cambiar contraseña</h2>' + field('actual', 'Contraseña actual', { type: 'password', attrs: 'autocomplete="current-password"' }) + field('nueva', 'Nueva contraseña', { type: 'password', hint: '(12–72 caracteres)', attrs: 'minlength="12" maxlength="72" autocomplete="new-password"' }) + '<button class="dark" type="submit">Cambiar contraseña</button></form></div>';
  res.type('html').send(page('Mi perfil', body, { ctx: 'pro', current: '/servicios/profesionales/perfil' }));
});

router.post('/profesionales/perfil', requirePro, (req, res) => {
  const back = { ctx: 'pro', back: ['/servicios/profesionales/perfil', 'Volver al perfil'] };
  const nombre = str(req.body.nombre_contacto, 80), telefono = str(req.body.telefono, 24);
  const cats = list(req.body.categorias).filter(x => category(x)), provs = list(req.body.provincias).filter(x => provincias.includes(x));
  if (!nombre || digits(telefono).length < 9 || !cats.length || !provs.length) return message(res, 'Datos incompletos', 'Indica persona de contacto, teléfono válido y al menos un servicio y una provincia.', 400, back);
  const pros = read('pros'), pro = pros.find(p => p.id === req.marketplacePro.id);
  Object.assign(pro, { nombre_contacto: nombre, telefono, categorias: cats, provincias: provs, updated_at: now() });
  write('pros', pros); audit('professional.profile_updated', pro.id, { categories: cats.length, provinces: provs.length });
  res.redirect('/servicios/profesionales/perfil?m=perfil');
});

router.post('/profesionales/password', authLimiter, requirePro, wrap(async (req, res) => {
  const back = { ctx: 'pro', back: ['/servicios/profesionales/perfil', 'Volver al perfil'] };
  const nueva = String(req.body.nueva || '');
  if (!(await bcrypt.compare(String(req.body.actual || ''), req.marketplacePro.password_hash || ''))) return message(res, 'Contraseña incorrecta', 'La contraseña actual no es correcta.', 401, back);
  if (nueva.length < 12 || nueva.length > 72) return message(res, 'Contraseña no válida', 'La nueva contraseña debe tener entre 12 y 72 caracteres.', 400, back);
  const hash = await bcrypt.hash(nueva, 12);
  const pros = read('pros'), pro = pros.find(p => p.id === req.marketplacePro.id);
  pro.password_hash = hash; pro.updated_at = now(); write('pros', pros); audit('professional.password_changed', pro.id);
  res.redirect('/servicios/profesionales/perfil?m=password');
}));

/* ───────────────────────── Administración ───────────────────────── */

router.get('/admin', (req, res) => res.redirect('/servicios/admin/leads'));
router.get('/admin/login', (req, res) => {
  if (req.session && req.session.resuelvoAdmin === true) return res.redirect('/servicios/admin/leads');
  const body = '<section class="card narrow"><span class="pill">Ayuda en el Barrio · Administración</span><h1 style="font-size:2.2rem;margin-top:14px">Acceso de administración</h1>'
    + (req.query.error === '1' ? notice('bad', 'Contraseña incorrecta o acceso no configurado.') : '')
    + '<form method="post" action="/servicios/admin/login">' + field('password', 'Contraseña', { type: 'password', attrs: 'autocomplete="current-password"' }) + '<button class="block dark" type="submit">Entrar al panel</button></form></section>';
  res.type('html').send(page('Acceso de administración', body, { noindex: true }));
});
router.post('/admin/login', authLimiter, wrap(async (req, res) => {
  const expected = process.env.ADMIN_PASSWORD, given = req.body.password;
  if (!expected || typeof given !== 'string' || !given || !safeEqual(given, expected)) { audit('admin.login_failed', 'anonymous'); return res.redirect('/servicios/admin/login?error=1'); }
  await regenerate(req);
  req.session.resuelvoAdmin = true;
  req.session.user = { id: 'resuelvo-admin', rol: 'admin' };
  await saveSession(req);
  audit('admin.login', 'resuelvo-admin');
  res.redirect('/servicios/admin/leads');
}));
function logoutAdmin(req, res) {
  if (!req.session) return res.redirect('/servicios/admin/login');
  delete req.session.resuelvoAdmin; delete req.session.user;
  req.session.save(() => res.redirect('/servicios/admin/login'));
}
router.post('/admin/logout', logoutAdmin);
router.get('/admin/logout', (req, res) => res.type('html').send(page('Salir', '<section class="card narrow"><h1 style="font-size:2rem">¿Cerrar sesión de administración?</h1><form method="post" action="/servicios/admin/logout"><button class="dark" type="submit">Cerrar sesión</button></form></section>', { noindex: true })));

function adminPage(res, title, current, body) { res.type('html').send(page(title, body, { ctx: 'admin', current })); }
function tabs(base, current, items) { return '<nav class="tabs" aria-label="Filtro">' + items.map(([v, l]) => '<a href="' + base + (v ? (base.includes('?') ? '&' : '?') + 'estado=' + v : '') + '"' + (v === current ? ' aria-current="page"' : '') + '>' + esc(l) + '</a>').join('') + '</nav>'; }
function pager(base, pageNo, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)); if (pages === 1) return '';
  const sep = base.includes('?') ? '&' : '?';
  return '<div class="row" style="margin-top:14px">' + (pageNo > 1 ? '<a class="btn sm alt" href="' + base + sep + 'p=' + (pageNo - 1) + '">← Anterior</a>' : '') + '<span class="small">Página ' + pageNo + ' de ' + pages + '</span>' + (pageNo < pages ? '<a class="btn sm alt" href="' + base + sep + 'p=' + (pageNo + 1) + '">Siguiente →</a>' : '') + '</div>';
}

router.get('/admin/leads', requireAdmin, (req, res) => {
  const leads = read('leads'), pros = read('pros'), refunds = read('refunds'), privacy = read('privacy');
  const proName = new Map(pros.map(p => [p.id, p.empresa]));
  const estado = ['nuevo', 'asignado', 'cerrado', 'eliminado'].includes(req.query.estado) ? req.query.estado : '';
  const q = str(req.query.q, 80).toLowerCase();
  let rows = leads.slice().reverse().filter(l => !estado || l.estado === estado);
  if (q) rows = rows.filter(l => [l.id, l.municipio, l.provincia, l.nombre_categoria, l.cliente && l.cliente.nombre, l.cliente && l.cliente.telefono].some(v => String(v || '').toLowerCase().includes(q)));
  const pageNo = Math.max(1, parseInt(req.query.p, 10) || 1), slice = rows.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  const pend = pros.filter(p => p.status === 'pending').length, refPend = refunds.filter(r => r.estado === 'pendiente').length, privPend = privacy.filter(r => r.estado === 'pendiente').length;
  const ingresos = read('payments').filter(p => p.estado === 'pagado').reduce((s, p) => s + Number(p.amount || 0), 0);
  const base = '/servicios/admin/leads' + (q ? '?q=' + encodeURIComponent(q) : '');
  const leadItem = l => '<article class="item"><div class="row between"><div class="row"><b class="mono">' + esc(l.id) + '</b> ' + badge(l.estado) + ' <span class="pill">' + esc(l.nombre_categoria) + '</span>' + (l.urgencia === 'hoy' ? '<span class="pill bad">Urgente</span>' : '') + '</div><span class="small">' + esc(fecha(l.created_at)) + '</span></div>'
    + '<p class="small" style="margin:8px 0">' + esc(l.municipio) + ', ' + esc(l.provincia) + ' · ' + esc(urgencias[l.urgencia] || l.urgencia) + ' · ' + eur(creditCost(l)) + ' por contacto</p>'
    + '<p style="line-height:1.6">' + esc(l.descripcion) + '</p>' + (l.estado === 'eliminado' ? '' : contactBlock(l.cliente || {}))
    + '<p class="small" style="margin:10px 0">Profesionales: ' + ((l.asignaciones || []).length ? (l.asignaciones || []).map(a => esc(proName.get(a.proId) || a.proId)).join(', ') : 'ninguno') + ' (' + (l.asignaciones || []).length + '/' + MAX_PROS_PER_LEAD + ')</p>'
    + (l.estado === 'eliminado' ? '<p class="small">Datos suprimidos el ' + esc(fecha(l.suprimido_at || l.updated_at)) + '. Estado definitivo.</p>' : '<form class="row" method="post" action="/servicios/admin/leads/' + encodeURIComponent(l.id) + '/estado"><label class="hp" for="e-' + esc(l.id) + '">Estado</label><select id="e-' + esc(l.id) + '" name="estado" style="width:auto">' + [['nuevo', 'Nueva'], ['asignado', 'Asignada'], ['cerrado', 'Cerrada'], ['eliminado', 'Suprimir datos personales (irreversible)']].map(([v, t]) => '<option value="' + v + '"' + (v === l.estado ? ' selected' : '') + '>' + t + '</option>').join('') + '</select><button class="sm alt" type="submit">Actualizar</button></form>') + '</article>';
  const body = '<h1>Administración</h1>' + flash(req)
    + '<section class="grid4" style="margin-bottom:16px"><div class="stat dark"><small>Solicitudes nuevas</small><strong>' + leads.filter(l => l.estado === 'nuevo').length + '</strong></div><a class="stat" style="text-decoration:none;color:inherit" href="/servicios/admin/profesionales?estado=pending"><small>Profesionales pendientes</small><strong>' + pend + '</strong></a><a class="stat" style="text-decoration:none;color:inherit" href="/servicios/admin/reembolsos"><small>Reembolsos pendientes</small><strong>' + refPend + '</strong></a><a class="stat" style="text-decoration:none;color:inherit" href="/servicios/admin/pagos"><small>Ingresos (Stripe)</small><strong>' + eur(ingresos) + '</strong></a></section>'
    + (privPend ? notice('warn', '<span>Hay ' + privPend + ' petición(es) de privacidad pendientes. <a href="/servicios/admin/privacidad">Revisar</a> (plazo legal: 1 mes).</span>') : '')
    + (!legal.completo() ? notice('warn', 'Faltan datos del titular en las páginas legales. Configura LEGAL_TITULAR, LEGAL_NIF, LEGAL_DOMICILIO y LEGAL_EMAIL.') : '')
    + (!notify.mailEnabled() ? notice('', 'Los emails están desactivados (avisos de solicitudes, altas y recuperación de contraseña). Configura SMTP_HOST, MAIL_FROM y ADMIN_EMAIL.') : '')
    + '<section class="card"><div class="row between"><h2 style="margin:0">Solicitudes de clientes</h2><form class="row" method="get" action="/servicios/admin/leads"><label class="hp" for="q">Buscar</label><input id="q" name="q" value="' + esc(q) + '" placeholder="ID, municipio, nombre, teléfono" style="width:260px"><button class="sm alt" type="submit">Buscar</button></form></div><div style="margin-top:14px">'
    + tabs(base, estado, [['', 'Todas (' + leads.length + ')'], ['nuevo', 'Nuevas'], ['asignado', 'Asignadas'], ['cerrado', 'Cerradas'], ['eliminado', 'Suprimidas']]) + '</div>'
    + (slice.length ? slice.map(leadItem).join('') : '<div class="empty"><p>No hay solicitudes con este filtro.</p></div>') + pager(base + (estado ? (base.includes('?') ? '&' : '?') + 'estado=' + estado : ''), pageNo, rows.length) + '</section>';
  adminPage(res, 'Administración de solicitudes', '/servicios/admin/leads', body);
});

router.post('/admin/leads/:id/estado', requireAdmin, (req, res) => {
  const leads = read('leads'), lead = leads.find(l => l.id === req.params.id), estado = String(req.body.estado || '');
  if (!lead || lead.estado === 'eliminado' || !['nuevo', 'asignado', 'cerrado', 'eliminado'].includes(estado)) return message(res, 'No se pudo actualizar', 'Solicitud no válida o ya suprimida.', 400, { ctx: 'admin', back: ['/servicios/admin/leads', 'Volver'] });
  lead.estado = estado; lead.updated_at = now();
  if (estado === 'eliminado') { lead.cliente = { nombre: '[suprimido]', telefono: '', email: '' }; lead.descripcion = '[suprimido a petición]'; lead.municipio = '[suprimido]'; lead.suprimido_at = now(); }
  write('leads', leads); audit('lead.status_changed', 'admin', { leadId: lead.id, status: estado });
  res.redirect('/servicios/admin/leads?m=ok');
});

router.get('/admin/profesionales', requireAdmin, (req, res) => {
  const pros = read('pros'), bals = balances();
  const counts = s => pros.filter(p => p.status === s).length;
  const estado = ['pending', 'approved', 'suspended', 'rejected', 'todos'].includes(req.query.estado) ? req.query.estado : (counts('pending') ? 'pending' : 'approved');
  const q = str(req.query.q, 80).toLowerCase();
  let rows = pros.filter(p => estado === 'todos' || p.status === estado).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (q) rows = rows.filter(p => [p.id, p.empresa, p.email, p.telefono, p.nombre_contacto].some(v => String(v || '').toLowerCase().includes(q)));
  const act = (p, st, label, cls = 'alt') => '<form class="inline" method="post" action="/servicios/admin/profesionales/' + encodeURIComponent(p.id) + '/estado"><input type="hidden" name="estado" value="' + st + '"><input type="hidden" name="vuelta" value="' + estado + '"><button class="sm ' + cls + '" type="submit">' + label + '</button></form>';
  const item = p => '<article class="item"><div class="row between"><div class="row"><h3 style="margin:0">' + esc(p.empresa) + '</h3>' + badge(p.status) + (p.verified ? '<span class="pill dark">Verificado</span>' : '') + '</div><span class="price" style="font-size:1.15rem">' + eur(bals.get(p.id) || 0) + '</span></div>'
    + '<dl class="kv" style="margin:12px 0"><dt>ID</dt><dd class="mono">' + esc(p.id) + '</dd><dt>Contacto</dt><dd>' + esc(p.nombre_contacto) + ' · ' + esc(p.email) + ' · ' + esc(p.telefono) + '</dd><dt>Servicios</dt><dd>' + esc((p.categorias || []).map(categoryName).join(', ')) + '</dd><dt>Provincias</dt><dd>' + esc((p.provincias || []).join(', ')) + '</dd><dt>Alta</dt><dd>' + esc(fecha(p.created_at)) + '</dd></dl>'
    + '<div class="row">' + (p.status === 'pending' ? act(p, 'approved', 'Aprobar', '') + act(p, 'rejected', 'Rechazar', 'danger') : '') + (p.status === 'approved' ? act(p, 'suspended', 'Suspender', 'danger') : '') + (p.status === 'suspended' || p.status === 'rejected' ? act(p, 'approved', 'Reactivar / aprobar', '') : '')
    + '<form class="inline" method="post" action="/servicios/admin/profesionales/' + encodeURIComponent(p.id) + '/verificado"><input type="hidden" name="valor" value="' + (p.verified ? 'no' : 'si') + '"><input type="hidden" name="vuelta" value="' + estado + '"><button class="sm alt" type="submit">' + (p.verified ? 'Quitar verificación' : 'Marcar verificado') + '</button></form></div>'
    + '<details style="padding-bottom:0;margin-top:10px"><summary class="small">Ajustar créditos</summary><form method="post" action="/servicios/admin/creditos" style="margin-top:12px"><input type="hidden" name="proId" value="' + esc(p.id) + '"><input type="hidden" name="vuelta" value="' + estado + '"><div class="grid">' + field('amount-' + p.id, 'Importe (€, negativo para descontar)', { type: 'number', attrs: 'name="amount" step="0.01" min="-10000" max="10000"' }).replace('name="amount-' + p.id + '" ', '') + field('motivo-' + p.id, 'Motivo', { required: false, attrs: 'name="motivo" maxlength="160" placeholder="Transferencia recibida, bienvenida…"' }).replace('name="motivo-' + p.id + '" ', '') + '</div><button class="sm" type="submit">Aplicar ajuste</button></form></details></article>';
  const base = '/servicios/admin/profesionales' + (q ? '?q=' + encodeURIComponent(q) : '');
  const body = '<h1>Profesionales</h1>' + flash(req)
    + '<section class="card"><div class="row between"><div>' + tabs(base, estado, [['pending', 'Pendientes (' + counts('pending') + ')'], ['approved', 'Aprobados (' + counts('approved') + ')'], ['suspended', 'Suspendidos (' + counts('suspended') + ')'], ['rejected', 'Rechazados (' + counts('rejected') + ')'], ['todos', 'Todos']]) + '</div>'
    + '<form class="row" method="get" action="/servicios/admin/profesionales" style="margin-bottom:18px"><input type="hidden" name="estado" value="' + esc(estado) + '"><label class="hp" for="q">Buscar</label><input id="q" name="q" value="' + esc(q) + '" placeholder="Empresa, email, ID" style="width:240px"><button class="sm alt" type="submit">Buscar</button></form></div>'
    + (rows.length ? rows.map(item).join('') : '<div class="empty"><p>No hay profesionales en este estado.</p></div>') + '</section>';
  adminPage(res, 'Profesionales', '/servicios/admin/profesionales', body);
});

const backToPros = req => '/servicios/admin/profesionales?estado=' + encodeURIComponent(['pending', 'approved', 'suspended', 'rejected', 'todos'].includes(req.body.vuelta) ? req.body.vuelta : 'todos');
router.post('/admin/profesionales/:id/estado', requireAdmin, (req, res) => {
  const pros = read('pros'), pro = pros.find(p => p.id === req.params.id), estado = String(req.body.estado || '');
  if (!pro || !['approved', 'rejected', 'pending', 'suspended'].includes(estado)) return message(res, 'No se pudo actualizar', 'Profesional o estado no válido.', 400, { ctx: 'admin', back: ['/servicios/admin/profesionales', 'Volver'] });
  const previous = pro.status;
  pro.status = estado; pro.updated_at = now(); write('pros', pros); audit('professional.status_changed', 'admin', { proId: pro.id, status: estado });
  if (previous !== estado) notify.professionalStatus(pro, estado);
  res.redirect(backToPros(req) + '&m=ok');
});
router.post('/admin/profesionales/:id/verificado', requireAdmin, (req, res) => {
  const pros = read('pros'), pro = pros.find(p => p.id === req.params.id);
  if (!pro) return message(res, 'No encontrado', 'Profesional no válido.', 404, { ctx: 'admin', back: ['/servicios/admin/profesionales', 'Volver'] });
  pro.verified = req.body.valor === 'si'; pro.updated_at = now(); write('pros', pros); audit('professional.verified_changed', 'admin', { proId: pro.id, verified: pro.verified });
  res.redirect(backToPros(req) + '&m=ok');
});
router.post('/admin/creditos', requireAdmin, (req, res) => {
  const proId = String(req.body.proId || ''), amount = Math.round(Number(req.body.amount) * 100) / 100, pro = read('pros').find(p => p.id === proId), back = { ctx: 'admin', back: ['/servicios/admin/profesionales', 'Volver'] };
  if (!pro || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000) return message(res, 'Crédito no aplicado', 'Comprueba el profesional y el importe (distinto de 0 y como máximo 10.000 €).', 400, back);
  const ledger = read('ledger');
  if (balance(proId, ledger) + amount < 0) return message(res, 'Crédito no aplicado', 'El ajuste dejaría el saldo en negativo.', 400, back);
  ledger.push({ id: crypto.randomUUID(), proId, amount, type: 'admin_adjust', note: str(req.body.motivo, 160), at: now() });
  write('ledger', ledger); audit('credits.manual_adjust', 'admin', { proId, amount });
  res.redirect(backToPros(req) + '&m=credito');
});

router.get('/admin/reembolsos', requireAdmin, (req, res) => {
  const refunds = read('refunds').slice().reverse(), pros = new Map(read('pros').map(p => [p.id, p])), leads = new Map(read('leads').map(l => [l.id, l]));
  const item = r => { const p = pros.get(r.proId) || {}, l = leads.get(r.leadId) || {};
    return '<article class="item"><div class="row between"><div class="row"><b class="mono">' + esc(r.id) + '</b>' + badge(r.estado) + '<span class="pill">' + esc(MOTIVOS[r.motivo] || r.motivo) + '</span></div><span class="price" style="font-size:1.15rem">' + eur(r.amount) + '</span></div>'
      + '<p class="small" style="margin:8px 0">' + esc(p.empresa || r.proId) + ' · solicitud <span class="mono">' + esc(r.leadId) + '</span> (' + esc(l.nombre_categoria || '') + ', ' + esc(l.municipio || '') + ') · ' + esc(fecha(r.created_at)) + '</p>' + (r.detalle ? '<p>' + esc(r.detalle) + '</p>' : '')
      + (l.cliente && l.estado !== 'eliminado' ? contactBlock(l.cliente) : '')
      + (r.estado === 'pendiente' ? '<form class="row" method="post" action="/servicios/admin/reembolsos/' + encodeURIComponent(r.id) + '" style="margin-top:12px"><button class="sm" name="decision" value="aprobar" type="submit">Devolver ' + eur(r.amount) + '</button><button class="sm danger" name="decision" value="rechazar" type="submit">Rechazar</button></form>' : '') + '</article>'; };
  adminPage(res, 'Reembolsos', '/servicios/admin/reembolsos', '<h1>Reembolsos</h1>' + flash(req) + '<section class="card"><p class="small">Avisos de contactos no válidos enviados por profesionales en los ' + REFUND_WINDOW_DAYS + ' días siguientes al desbloqueo.</p>' + (refunds.length ? refunds.map(item).join('') : '<div class="empty"><p>No hay avisos.</p></div>') + '</section>');
});
router.post('/admin/reembolsos/:id', requireAdmin, (req, res) => {
  const refunds = read('refunds'), r = refunds.find(x => x.id === req.params.id), decision = req.body.decision;
  if (!r || r.estado !== 'pendiente' || !['aprobar', 'rechazar'].includes(decision)) return message(res, 'No se pudo procesar', 'Aviso no válido o ya resuelto.', 400, { ctx: 'admin', back: ['/servicios/admin/reembolsos', 'Volver'] });
  if (decision === 'aprobar') {
    const ledger = read('ledger');
    // Si el fichero de reembolsos falló tras escribir el libro, no volvemos a acreditar.
    if (!ledger.some(x => x.refundId === r.id)) {
      ledger.push({ id: crypto.randomUUID(), refundId: r.id, proId: r.proId, leadId: r.leadId, amount: r.amount, type: 'refund', note: 'Contacto no válido: ' + (MOTIVOS[r.motivo] || r.motivo), at: now() });
      write('ledger', ledger);
    }
  }
  r.estado = decision === 'aprobar' ? 'aprobado' : 'rechazado'; r.resolved_at = now(); write('refunds', refunds); audit('refund.' + r.estado, 'admin', { refundId: r.id, proId: r.proId });
  notify.refundResolved(read('pros').find(p => p.id === r.proId), r);
  res.redirect('/servicios/admin/reembolsos?m=ok');
});

const TIPOS_DERECHO = { acceso: 'Acceso', rectificacion: 'Rectificación', supresion: 'Supresión', oposicion: 'Oposición', limitacion: 'Limitación', portabilidad: 'Portabilidad' };
router.get('/admin/privacidad', requireAdmin, (req, res) => {
  const rows = read('privacy').slice().reverse();
  const item = r => '<article class="item"><div class="row between"><div class="row"><b>' + esc(TIPOS_DERECHO[r.tipo] || r.tipo) + '</b>' + badge(r.estado) + '</div><span class="small">' + esc(fecha(r.created_at)) + ' · vence ' + esc(fecha(new Date(Date.parse(r.created_at) + 30 * 86400000).toISOString())) + '</span></div><p class="small" style="margin:8px 0">' + esc(r.email) + (r.referencia ? ' · ref. <span class="mono">' + esc(r.referencia) + '</span>' : '') + '</p>' + (r.mensaje ? '<p>' + esc(r.mensaje) + '</p>' : '')
    + (r.estado === 'pendiente' ? '<form method="post" action="/servicios/admin/privacidad/' + encodeURIComponent(r.id) + '"><button class="sm alt" type="submit">Marcar como atendida</button></form>' : '') + '</article>';
  adminPage(res, 'Privacidad', '/servicios/admin/privacidad', '<h1>Peticiones de privacidad</h1>' + flash(req) + '<section class="card">' + notice('', 'Verifica la identidad antes de actuar. Para suprimir una solicitud, búscala por referencia o teléfono en Solicitudes y usa «Suprimir datos personales».') + (rows.length ? rows.map(item).join('') : '<div class="empty"><p>No hay peticiones.</p></div>') + '</section>');
});
router.post('/admin/privacidad/:id', requireAdmin, (req, res) => {
  const rows = read('privacy'), r = rows.find(x => x.id === req.params.id);
  if (!r) return message(res, 'No encontrado', 'Petición no válida.', 404, { ctx: 'admin', back: ['/servicios/admin/privacidad', 'Volver'] });
  r.estado = 'atendida'; r.resolved_at = now(); write('privacy', rows); audit('privacy.resolved', 'admin', { id: r.id });
  res.redirect('/servicios/admin/privacidad?m=ok');
});

router.get('/admin/pagos', requireAdmin, (req, res) => {
  const pays = read('payments').slice().reverse(), pros = new Map(read('pros').map(p => [p.id, p.empresa]));
  adminPage(res, 'Pagos', '/servicios/admin/pagos', '<h1>Pagos</h1>' + (payments.enabled() ? notice('ok', 'Stripe activo.') : notice('warn', 'Stripe desactivado. Configura STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET y apunta el webhook de Stripe a /servicios/pagos/webhook (evento checkout.session.completed).'))
    + '<section class="card">' + (pays.length ? '<div class="tbl"><table><thead><tr><th>Fecha</th><th>Profesional</th><th>Paquete</th><th>Estado</th><th style="text-align:right">Importe</th></tr></thead><tbody>' + pays.map(p => '<tr><td>' + esc(fecha(p.paid_at || p.created_at)) + '</td><td>' + esc(pros.get(p.proId) || p.proId) + '</td><td>' + esc(p.credits) + ' créditos</td><td>' + badge(p.estado) + '</td><td style="text-align:right;font-weight:800">' + eur(p.amount) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty"><p>Aún no hay pagos.</p></div>') + '</section>');
});

/* ───────────────────────── Privacidad y legal ───────────────────────── */

router.get('/privacidad/derechos', (req, res) => {
  const body = '<div class="grid" style="align-items:start;gap:32px"><div><h1>Ejercer tus derechos</h1><p class="lead">Puedes pedir acceso, rectificación, supresión, oposición, limitación o portabilidad de tus datos. Responderemos en el plazo máximo de un mes.</p><p class="muted">Indica la referencia de tu solicitud (empieza por LEAD-) si la tienes. Antes de actuar comprobaremos tu identidad.</p></div>'
    + '<form class="card" method="post" action="/servicios/privacidad/solicitud">' + field('email', 'Email de contacto', { type: 'email', attrs: 'maxlength="160" autocomplete="email"' })
    + '<div class="field"><label for="tipo">Derecho que quieres ejercer *</label><select id="tipo" name="tipo" required>' + Object.entries(TIPOS_DERECHO).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></div>'
    + field('referencia', 'Referencia de la solicitud', { required: false, hint: '(opcional)', attrs: 'maxlength="20" placeholder="LEAD-XXXXXXXXXX"' })
    + '<div class="field"><label for="mensaje">Detalles <span class="hint">(opcional)</span></label><textarea id="mensaje" name="mensaje" maxlength="1000"></textarea></div>' + honeypot
    + '<button class="block" type="submit">Enviar petición</button></form></div>';
  res.type('html').send(page('Ejercer tus derechos de privacidad', body, { canonical: '/servicios/privacidad/derechos' }));
});

router.post('/privacidad/solicitud', publicFormLimiter, (req, res) => {
  if (req.body.web) return message(res, 'Solicitud registrada', 'Hemos registrado tu petición.');
  const email = str(req.body.email, 160).toLowerCase(), tipo = String(req.body.tipo || '');
  if (!EMAIL_RE.test(email) || !Object.hasOwn(TIPOS_DERECHO, tipo)) return message(res, 'Solicitud no válida', 'Indica un email válido y el tipo de petición.', 400, { back: ['/servicios/privacidad/derechos', 'Volver al formulario'] });
  const rows = read('privacy');
  const row = { id: crypto.randomUUID(), email, tipo, referencia: str(req.body.referencia, 20).toUpperCase(), mensaje: str(req.body.mensaje, 1000), estado: 'pendiente', created_at: now() };
  rows.push(row); write('privacy', rows); audit('privacy.request', 'customer', { type: tipo });
  notify.privacyRequest(row);
  return message(res, 'Solicitud registrada', 'Hemos registrado tu petición. Comprobaremos tu identidad y te responderemos en un plazo máximo de un mes.');
});

function titularHtml() {
  const t = legal.titular(), p = '<em>pendiente de completar</em>';
  return '<ul><li><b>Titular:</b> ' + (t.nombre ? esc(t.nombre) : p) + '</li><li><b>NIF:</b> ' + (t.nif ? esc(t.nif) : p) + '</li><li><b>Domicilio:</b> ' + (t.domicilio ? esc(t.domicilio) : p) + '</li><li><b>Email:</b> ' + (t.email ? '<a href="mailto:' + esc(t.email) + '">' + esc(t.email) + '</a>' : p) + '</li></ul>';
}
const LEGAL = {
  'aviso-legal': ['Aviso legal', () => '<h2>Datos identificativos</h2><p>En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), se informa de los datos del titular de este sitio web:</p>' + titularHtml()
    + '<h2>Objeto</h2><p>Ayuda en el Barrio es una plataforma que pone en contacto a personas que necesitan un servicio con profesionales independientes de su zona. Ayuda en el Barrio no presta los servicios ni es parte del contrato entre cliente y profesional.</p>'
    + '<h2>Responsabilidad</h2><p>Cada profesional es responsable de sus servicios, presupuestos, facturas y del cumplimiento de la normativa aplicable a su actividad. El titular revisa las cuentas profesionales antes de activarlas, pero no garantiza la disponibilidad, el precio ni la calidad de los trabajos.</p>'
    + '<h2>Propiedad intelectual</h2><p>Los contenidos, diseño y código de este sitio pertenecen al titular o se usan con licencia. No se permite su reproducción sin autorización.</p><h2>Legislación aplicable</h2><p>Este aviso se rige por la legislación española.</p>'],
  privacidad: ['Política de privacidad', () => '<h2>Responsable del tratamiento</h2>' + titularHtml()
    + '<h2>Qué datos tratamos y para qué</h2><ul><li><b>Clientes:</b> nombre, teléfono, email opcional, localidad y descripción de la necesidad, para ponerte en contacto con hasta tres profesionales compatibles.</li><li><b>Profesionales:</b> datos de empresa y contacto, servicios, zonas y movimientos de créditos, para gestionar la cuenta, la facturación y el acceso a solicitudes.</li><li><b>Registros técnicos y de seguridad</b> mínimos para prevenir abusos.</li></ul>'
    + '<h2>Base jurídica</h2><p>Tu consentimiento al enviar la solicitud (art. 6.1.a RGPD) y, para profesionales, la ejecución del contrato (art. 6.1.b) y las obligaciones legales de facturación (art. 6.1.c).</p>'
    + '<h2>Destinatarios</h2><p>Los datos de una solicitud se comunican como máximo a tres profesionales aprobados que trabajan en tu provincia y en el servicio solicitado. Los pagos de profesionales se procesan mediante Stripe Payments Europe, Ltd. No se venden datos a terceros.</p>'
    + '<h2>Conservación</h2><p>Las solicitudes se eliminan automáticamente a los 180 días. Los datos de profesionales se conservan mientras la cuenta esté activa y, después, durante los plazos legales de facturación.</p>'
    + '<h2>Tus derechos</h2><p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad desde <a href="/servicios/privacidad/derechos">este formulario</a>. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>'],
  cookies: ['Política de cookies', () => '<p>Este sitio solo usa una cookie técnica, <code>ayuda-barrio.sid</code>, imprescindible para mantener la sesión de profesionales y administración. No usamos cookies analíticas, publicitarias ni de terceros, por lo que no es necesario pedir consentimiento (art. 22.2 LSSI-CE).</p><p>La cookie caduca a las 24 horas o al cerrar sesión. Puedes borrarla desde la configuración de tu navegador.</p>'],
  condiciones: ['Condiciones para profesionales', () => '<h2>Alta y revisión</h2><p>El alta es gratuita. Revisamos cada cuenta antes de activarla y podemos rechazarla o suspenderla si detectamos datos falsos, quejas reiteradas o uso indebido.</p>'
    + '<h2>Créditos y precio por contacto</h2><p>Para ver los datos de contacto de una solicitud se descuentan créditos de tu saldo (1 crédito = 1 €). El precio depende de la categoría y se muestra antes de desbloquear. Cada solicitud se comparte con un máximo de tres profesionales. No hay cuotas ni permanencia.</p>'
    + '<h2>Devoluciones</h2><p>Si un contacto no es válido (teléfono erróneo, solicitud falsa, cliente ilocalizable), puedes avisarnos en los ' + REFUND_WINDOW_DAYS + ' días siguientes al desbloqueo. Si se confirma, devolvemos los créditos a tu saldo. Los créditos recargados no son reembolsables en dinero salvo obligación legal.</p>'
    + '<h2>Uso de los datos de clientes</h2><p>Solo puedes usar los datos del cliente para responder a su solicitud. Queda prohibido cederlos, usarlos para otros fines o enviar comunicaciones comerciales no solicitadas.</p>'
    + '<h2>Responsabilidad</h2><p>Eres el único responsable del servicio que prestes, de tu presupuesto, de tu facturación y de cumplir la normativa de tu actividad.</p>' + '<h2>Titular</h2>' + titularHtml()]
};
router.get('/legal/:slug', (req, res, next) => {
  const doc = LEGAL[req.params.slug]; if (!doc) return next();
  res.type('html').send(page(doc[0], '<article class="card prose"><h1>' + esc(doc[0]) + '</h1>' + (!legal.completo() ? notice('warn', 'Algunos datos del titular están pendientes de completar.') : '') + doc[1]() + '<p class="small" style="margin-top:28px">Última actualización: octubre de 2026.</p></article>', { canonical: '/servicios/legal/' + req.params.slug }));
});

/* ───────────────────────── API ───────────────────────── */

router.get('/api/catalogo', (req, res) => res.json({ provincias, categorias: categorias.map(c => ({ id: c[0], nombre: c[1], precio_referencia_lead_eur: c[2] })), max_profesionales_por_solicitud: MAX_PROS_PER_LEAD }));
router.get('/api/health', (req, res) => res.json({ ok: true, service: 'ayuda-en-el-barrio', version }));
router.get('/api/admin/summary', requireAdmin, (req, res) => res.json({ leads: read('leads').length, professionals: read('pros').length, pending: read('pros').filter(p => p.status === 'pending').length, auditEvents: read('audit').length }));

/* ───────────────────────── Mantenimiento ───────────────────────── */

// Purga diaria: solo se elimina cuando retention_until es una fecha válida y vencida.
function purgeExpiredLeads(nowMs = Date.now()) {
  try {
    const leads = read('leads'), kept = []; let purged = 0;
    for (const lead of leads) { const exp = Date.parse(lead.retention_until || ''); if (Number.isFinite(exp) && exp <= nowMs) purged += 1; else kept.push(lead); }
    if (purged > 0) { write('leads', kept); audit('leads.retention_purged', 'system', { count: purged }); }
    return { purged, remaining: kept.length };
  } catch (err) { console.error('[ayuda-barrio] Error al purgar solicitudes caducadas:', err.message); return { purged: 0, error: true }; }
}

try { store.migrateLegacyData(); } catch (err) { console.error('[ayuda-barrio] Error en la migración de datos:', err.message); }
purgeExpiredLeads();
cron.schedule('30 5 * * *', () => purgeExpiredLeads());

module.exports = { router, provincias, categorias, purgeExpiredLeads, stripeWebhook };
