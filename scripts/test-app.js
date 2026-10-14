'use strict';
// Test de integración sobre la app completa (server.js → createApp) con datos temporales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const cron = require('node-cron');
cron.schedule = () => ({ stop() {} });

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayuda-app-'));
process.env.RESUELVO_DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'admin-test-password-only';
delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;
const J = f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
const W = (f, v) => fs.writeFileSync(path.join(dataDir, f), JSON.stringify(v));
const MOJIBAKE = /Ã|Â|â€|âœ/;

(async () => {
  let server; let step = '';
  try {
    const hash = await bcrypt.hash('pro-password-123', 4);
    const old = new Date(Date.now() - 86400000).toISOString(), future = new Date(Date.now() + 86400000 * 30).toISOString();
    // Datos heredados con provincias mal codificadas (como en producción antes del 13/10/2026)
    W('profesionales.json', [
      { id: 'PRO-LEGACY', empresa: 'Fontanería Legacy', nombre_contacto: 'Ana', email: 'legacy@example.invalid', telefono: '600000001', password_hash: hash, categorias: ['fontaneria'], provincias: ['AlmerÃ­a', 'Ãvila', 'C\u00c3\u00b3rdoba', '\u00c3\u0081lava'], status: 'approved', created_at: old },
      { id: 'PRO-PEND', empresa: 'Pendiente SL', nombre_contacto: 'Luis', email: 'pend@example.invalid', telefono: '600000002', password_hash: hash, categorias: ['pintura'], provincias: ['Madrid'], status: 'pending', created_at: old }
    ]);
    W('solicitudes.json', [
      { id: 'LEAD-OLD', servicio: 'fontaneria', nombre_categoria: 'FontanerÃ­a', precio_referencia_lead_eur: 7, provincia: 'AlmerÃ­a', municipio: 'Níjar', urgencia: 'hoy', descripcion: 'Fuga antigua', cliente: { nombre: 'Cliente Viejo', telefono: '611111111', email: '' }, estado: 'nuevo', asignaciones: [], created_at: old, updated_at: old, retention_until: future },
      { id: 'LEAD-CLOSED', servicio: 'fontaneria', nombre_categoria: 'Fontanería', precio_referencia_lead_eur: 7, provincia: 'Almería', municipio: 'Vícar', urgencia: 'flexible', descripcion: 'Trabajo cerrado', cliente: { nombre: 'Cerrado', telefono: '622222222', email: '' }, estado: 'cerrado', asignaciones: [], created_at: old, updated_at: old, retention_until: future }
    ]);
    W('creditos-ledger.json', [{ id: 'C1', proId: 'PRO-LEGACY', amount: 30, type: 'test_credit', at: old }]);
    W('marketplace-audit.json', [{ id: 'PRIV-OLD', action: 'privacy.request', actor: 'customer', details: { email: 'x@example.invalid', type: 'acceso' }, at: old }]);

    const { createApp } = require('../server');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}`;
    const req = (u, o = {}) => fetch(B + u, { redirect: 'manual', ...o });
    const post = (u, body, cookie, extra = {}) => req(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), ...extra }, body: new URLSearchParams(body) });
    const html = async (u, cookie) => { const r = await req(u, cookie ? { headers: { cookie } } : {}); const t = await r.text(); return { status: r.status, t }; };
    const cookieOf = r => (r.headers.get('set-cookie') || '').split(';')[0];
    const noMojibake = (t, where) => assert.equal(MOJIBAKE.test(t), false, 'mojibake en ' + where);

    step = 'migración';
    const pros = J('profesionales.json');
    assert.deepEqual(pros.find(p => p.id === 'PRO-LEGACY').provincias, ['Almería', 'Ávila', 'Córdoba', 'Álava']);
    assert.equal(J('solicitudes.json').find(l => l.id === 'LEAD-OLD').provincia, 'Almería');
    assert.equal(J('solicitudes.json').find(l => l.id === 'LEAD-OLD').nombre_categoria, 'Fontanería');
    assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).some(d => d.startsWith('pre-migracion-')), 'debe existir copia previa');
    assert.equal(J('privacidad-solicitudes.json').length, 1, 'peticiones RGPD heredadas copiadas');

    step = 'páginas públicas';
    for (const u of ['/servicios', '/servicios/profesionales/registro', '/servicios/profesionales/entrar', '/servicios/privacidad/derechos', '/servicios/legal/aviso-legal', '/servicios/legal/privacidad', '/servicios/legal/cookies', '/servicios/legal/condiciones', '/servicios/admin/login']) {
      const { status, t } = await html(u); assert.equal(status, 200, u); noMojibake(t, u);
    }
    const home = (await html('/servicios?servicio=pintura')).t;
    assert.match(home, /<option value="pintura" selected>/, 'preselección de categoría por query');
    assert.match(home, /<label for="descripcion">/);
    for (const u of ['/robots.txt', '/sitemap.xml', '/favicon.svg', '/health', '/servicios/api/health']) assert.equal((await req(u)).status, 200, u);
    assert.equal((await req('/no-existe')).status, 404);
    assert.equal((await req('/')).status, 301);

    step = 'CSRF por origen';
    let r = await post('/servicios/solicitud', { servicio: 'fontaneria' }, null, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    r = await post('/servicios/solicitud', { servicio: 'x' }, null, { origin: 'null', referer: B + '/servicios' });
    assert.equal(r.status, 400, 'Origin null con Referer propio pasa la comprobación (falla solo la validación)');
    const sec = await req('/servicios');
    assert.equal(sec.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'no-referrer haría que Chrome envíe Origin: null');

    step = 'solicitud + honeypot';
    const leadBody = { servicio: 'fontaneria', provincia: 'Almería', municipio: 'Roquetas', urgencia: 'esta_semana', descripcion: 'Grifo que gotea en la cocina', nombre: 'María', telefono: '612 345 678', email: 'maria@example.invalid', consentimiento: 'si' };
    r = await post('/servicios/solicitud', { ...leadBody, web: 'http://spam' });
    assert.equal(r.status, 201);
    assert.equal(J('solicitudes.json').length, 2, 'honeypot no guarda');
    r = await post('/servicios/solicitud', leadBody, null, { origin: B });
    assert.equal(r.status, 201); noMojibake(await r.text(), 'confirmación');
    const newLead = J('solicitudes.json').at(-1);
    assert.equal(newLead.provincia, 'Almería');

    step = 'login profesional heredado';
    r = await post('/servicios/profesionales/entrar', { email: 'legacy@example.invalid', password: 'pro-password-123' });
    assert.equal(r.status, 302);
    const pc = cookieOf(r);
    let panel = await html('/servicios/profesionales/panel', pc);
    assert.equal(panel.status, 200); noMojibake(panel.t, 'panel');
    assert.ok(panel.t.includes('/leads/' + newLead.id + '/desbloquear'), 'el profesional heredado ve la solicitud nueva');
    assert.ok(panel.t.includes('/leads/LEAD-OLD/desbloquear'), 'y la heredada');
    assert.ok(!panel.t.includes('LEAD-CLOSED'), 'no ve solicitudes cerradas');

    step = 'lead cerrado no se puede comprar';
    r = await post('/servicios/profesionales/leads/LEAD-CLOSED/desbloquear', {}, pc);
    assert.equal(r.status, 404);
    assert.equal(J('solicitudes.json').find(l => l.id === 'LEAD-CLOSED').estado, 'cerrado');

    step = 'desbloqueo';
    r = await post('/servicios/profesionales/leads/' + newLead.id + '/desbloquear', {}, pc);
    assert.equal(r.status, 302);
    panel = await html('/servicios/profesionales/panel', pc);
    assert.ok(panel.t.includes('tel:612345678') && panel.t.includes('wa.me/34612345678'), 'contacto visible con enlaces');
    const bal = () => J('creditos-ledger.json').filter(x => x.proId === 'PRO-LEGACY').reduce((s, x) => s + x.amount, 0);
    assert.equal(bal(), 23);

    step = 'reembolso';
    r = await post('/servicios/profesionales/leads/' + newLead.id + '/reportar', { motivo: 'telefono_erroneo', detalle: 'No existe' }, pc);
    assert.equal(r.status, 302);
    r = await post('/servicios/profesionales/leads/' + newLead.id + '/reportar', { motivo: 'otro' }, pc);
    assert.equal(r.status, 409, 'un solo aviso por contacto');

    step = 'créditos y perfil';
    let cred = await html('/servicios/profesionales/creditos', pc);
    assert.equal(cred.status, 200); noMojibake(cred.t, 'créditos'); assert.match(cred.t, /Próximamente/);
    r = await post('/servicios/profesionales/creditos/checkout', { pack: 'p20' }, pc);
    assert.equal(r.status, 503, 'checkout desactivado sin Stripe');
    const perfil = await html('/servicios/profesionales/perfil', pc); assert.equal(perfil.status, 200); noMojibake(perfil.t, 'perfil');
    r = await post('/servicios/profesionales/perfil', { nombre_contacto: 'Ana B', telefono: '600000001', categorias: 'fontaneria', provincias: 'Almería' }, pc);
    assert.equal(r.status, 302);
    assert.deepEqual(J('profesionales.json').find(p => p.id === 'PRO-LEGACY').provincias, ['Almería']);
    r = await post('/servicios/profesionales/password', { actual: 'mal', nueva: 'nueva-password-123' }, pc);
    assert.equal(r.status, 401);

    step = 'admin';
    r = await post('/servicios/admin/login', { password: 'admin-test-password-only' });
    assert.equal(r.status, 302);
    const ac = cookieOf(r);
    for (const u of ['/servicios/admin/leads', '/servicios/admin/profesionales?estado=todos', '/servicios/admin/reembolsos', '/servicios/admin/privacidad', '/servicios/admin/pagos']) {
      const p = await html(u, ac); assert.equal(p.status, 200, u); noMojibake(p.t, u);
    }
    const adminPros = (await html('/servicios/admin/profesionales?estado=approved', ac)).t;
    assert.ok(adminPros.includes('PRO-LEGACY'), 'el admin ve IDs de aprobados');
    const adminLeads = (await html('/servicios/admin/leads?estado=cerrado', ac)).t;
    assert.match(adminLeads, /<option value="cerrado" selected>/, 'estado actual preseleccionado');

    const refund = J('reembolsos.json')[0];
    r = await post('/servicios/admin/reembolsos/' + refund.id, { decision: 'aprobar' }, ac);
    assert.equal(r.status, 302);
    assert.equal(bal(), 30, 'reembolso devuelve créditos');
    r = await post('/servicios/admin/reembolsos/' + refund.id, { decision: 'aprobar' }, ac);
    assert.equal(r.status, 400, 'no se reembolsa dos veces');

    r = await post('/servicios/admin/creditos', { proId: 'PRO-LEGACY', amount: '-100', vuelta: 'approved' }, ac);
    assert.equal(r.status, 400, 'no deja saldo negativo');
    r = await post('/servicios/admin/creditos', { proId: 'PRO-LEGACY', amount: '10', motivo: 'Transferencia', vuelta: 'approved' }, ac);
    assert.equal(r.status, 302); assert.equal(bal(), 40);

    r = await post('/servicios/admin/profesionales/PRO-PEND/estado', { estado: 'approved', vuelta: 'pending' }, ac);
    assert.equal(r.status, 302);
    r = await post('/servicios/admin/profesionales/PRO-LEGACY/verificado', { valor: 'si' }, ac);
    assert.equal(J('profesionales.json').find(p => p.id === 'PRO-LEGACY').verified, true);

    r = await post('/servicios/admin/leads/' + newLead.id + '/estado', { estado: 'eliminado' }, ac);
    const sup = J('solicitudes.json').find(l => l.id === newLead.id);
    assert.equal(sup.cliente.telefono, '', 'suprimir anonimiza datos personales');

    step = 'suspensión';
    await post('/servicios/admin/profesionales/PRO-LEGACY/estado', { estado: 'suspended' }, ac);
    r = await req('/servicios/profesionales/panel', { headers: { cookie: pc } });
    assert.equal(r.status, 302, 'un suspendido pierde el acceso');

    step = 'privacidad';
    r = await post('/servicios/privacidad/solicitud', { email: 'cliente@example.invalid', tipo: 'supresion', referencia: 'lead-abc', mensaje: 'Borrad mis datos' });
    assert.equal(r.status, 200);
    assert.equal(J('privacidad-solicitudes.json').at(-1).referencia, 'LEAD-ABC');

    step = 'webhook Stripe';
    r = await req('/servicios/pagos/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 404, 'webhook desactivado sin claves');
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 5000, currency: 'eur', metadata: { proId: 'PRO-PEND', pack: 'p50' } } } });
    const sign = (body, secret = 'whsec_test') => { const t = Math.floor(Date.now() / 1000); return 't=' + t + ',v1=' + crypto.createHmac('sha256', secret).update(t + '.' + body).digest('hex'); };
    r = await req('/servicios/pagos/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(event, 'otro') }, body: event });
    assert.equal(r.status, 400, 'firma inválida rechazada');
    for (let i = 0; i < 2; i++) {
      r = await req('/servicios/pagos/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(event) }, body: event });
      assert.equal(r.status, 200);
    }
    const pendBal = J('creditos-ledger.json').filter(x => x.proId === 'PRO-PEND').reduce((s, x) => s + x.amount, 0);
    assert.equal(pendBal, 55, 'paquete de 50 € acredita 55 una sola vez');
    const tampered = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_2', payment_status: 'paid', amount_total: 100, currency: 'eur', metadata: { proId: 'PRO-PEND', pack: 'p100' } } } });
    r = await req('/servicios/pagos/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(tampered) }, body: tampered });
    assert.equal(r.status, 400, 'importe que no cuadra con el paquete rechazado');
    delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;

    step = 'error de E/S no tumba el servidor';
    fs.mkdirSync(path.join(dataDir, 'profesionales.json.tmp'));
    r = await post('/servicios/profesionales/registro', { email: 'nuevo@example.invalid', empresa: 'Nuevo', nombre_contacto: 'N', telefono: '600000009', password: 'password-largo-1', categorias: 'fontaneria', provincias: 'Madrid', acepta: 'si' });
    assert.equal(r.status, 500);
    assert.equal((await req('/health')).status, 200, 'el servidor sigue vivo');
    fs.rmdirSync(path.join(dataDir, 'profesionales.json.tmp'));

    console.log('PASS: migración, páginas sin mojibake, CSRF, honeypot, leads cerrados, desbloqueo, reembolsos, perfil, admin, suspensión, privacidad, webhook Stripe y resiliencia ante errores.');
  } catch (err) {
    console.error('FALLO en paso:', step); console.error(err);
    process.exitCode = 1;
  } finally {
    if (server) { server.closeAllConnections && server.closeAllConnections(); await new Promise(r => server.close(r)); }
    fs.rmSync(dataDir, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();
