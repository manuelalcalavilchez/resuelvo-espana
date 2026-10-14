'use strict';
// Notificaciones (email + webhook firmado) y recuperación de contraseña.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const cron = require('node-cron');
cron.schedule = () => ({ stop() {} });

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayuda-notify-'));
process.env.RESUELVO_DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'admin-test-password-only';
process.env.ADMIN_EMAIL = 'admin@example.invalid';
process.env.MAIL_FROM = 'Ayuda en el Barrio <no-reply@example.invalid>';
process.env.NOTIFY_WEBHOOK_SECRET = 'hook-secret';
const J = f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
const W = (f, v) => fs.writeFileSync(path.join(dataDir, f), JSON.stringify(v));
const wait = (ms = 150) => new Promise(r => setTimeout(r, ms));

(async () => {
  let server, hookServer, step = '';
  const mails = [], hooks = [];
  try {
    hookServer = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { hooks.push({ body: b, sig: req.headers['x-ayuda-signature'] }); res.end('ok'); }); }).listen(0, '127.0.0.1');
    await new Promise(r => hookServer.once('listening', r));
    process.env.NOTIFY_WEBHOOK_URL = `http://127.0.0.1:${hookServer.address().port}/hook`;

    const hash = await bcrypt.hash('old-password-123', 4);
    W('profesionales.json', [
      { id: 'PRO-OK', empresa: 'Fontanería OK', nombre_contacto: 'Ana', email: 'ok@example.invalid', telefono: '600000001', password_hash: hash, categorias: ['fontaneria'], provincias: ['Almería'], status: 'approved' },
      { id: 'PRO-OTRA', empresa: 'Otra zona', nombre_contacto: 'Eva', email: 'otra@example.invalid', telefono: '600000003', password_hash: hash, categorias: ['fontaneria'], provincias: ['Madrid'], status: 'approved' },
      { id: 'PRO-PEND', empresa: 'Pendiente', nombre_contacto: 'Luis', email: 'pend@example.invalid', telefono: '600000002', password_hash: hash, categorias: ['fontaneria'], provincias: ['Almería'], status: 'pending' }
    ]);

    const notify = require('../lib/notify');
    notify._setTransport({ sendMail: async m => { mails.push(m); return { messageId: 'x' }; } });
    const { createApp } = require('../server');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}`;
    const req = (u, o = {}) => fetch(B + u, { redirect: 'manual', ...o });
    const post = (u, body, cookie) => req(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(body) });

    step = 'aviso de nueva solicitud';
    let r = await post('/servicios/solicitud', { servicio: 'fontaneria', provincia: 'Almería', municipio: 'Níjar', urgencia: 'hoy', descripcion: 'Se sale el agua del calentador', nombre: 'Cliente Secreto', telefono: '699 888 777', consentimiento: 'si' });
    assert.equal(r.status, 201);
    await wait();
    const leadMails = mails.filter(m => /solicitud/i.test(m.subject));
    assert.deepEqual(leadMails.map(m => m.to), ['ok@example.invalid'], 'solo el profesional aprobado y compatible');
    assert.match(leadMails[0].subject, /^Urgente:/);
    for (const m of leadMails) assert.ok(!m.text.includes('699') && !m.text.includes('Cliente Secreto'), 'el email no incluye datos del cliente');
    const leadHook = hooks.map(h => ({ ...h, json: JSON.parse(h.body) })).find(h => h.json.event === 'lead.created');
    assert.ok(leadHook, 'webhook lead.created');
    assert.equal(leadHook.sig, 'sha256=' + crypto.createHmac('sha256', 'hook-secret').update(leadHook.body).digest('hex'), 'firma del webhook');
    assert.ok(!leadHook.body.includes('699'), 'el webhook no incluye el teléfono');

    step = 'alta y aprobación';
    r = await post('/servicios/profesionales/registro', { email: 'nuevo@example.invalid', empresa: 'Nuevo SL', nombre_contacto: 'Nuria', telefono: '600000009', password: 'password-largo-1', categorias: 'pintura', provincias: 'Madrid', acepta: 'si' });
    assert.equal(r.status, 200); await wait();
    assert.ok(mails.some(m => m.to === 'admin@example.invalid' && /pendiente/i.test(m.subject)), 'aviso al admin');
    r = await post('/servicios/admin/login', { password: 'admin-test-password-only' });
    const ac = (r.headers.get('set-cookie') || '').split(';')[0];
    r = await post('/servicios/admin/profesionales/PRO-PEND/estado', { estado: 'approved', vuelta: 'pending' }, ac);
    assert.equal(r.status, 302); await wait();
    assert.ok(mails.some(m => m.to === 'pend@example.invalid' && /activa/.test(m.subject)), 'aviso de cuenta aprobada');

    step = 'privacidad';
    await post('/servicios/privacidad/solicitud', { email: 'c@example.invalid', tipo: 'acceso' }); await wait();
    assert.ok(mails.some(m => m.to === 'admin@example.invalid' && /privacidad/i.test(m.subject)));

    step = 'recuperación de contraseña';
    r = await post('/servicios/profesionales/recuperar', { email: 'nadie@example.invalid' });
    assert.equal(r.status, 200, 'respuesta genérica para emails desconocidos');
    const before = mails.length;
    r = await post('/servicios/profesionales/recuperar', { email: 'ok@example.invalid' });
    assert.equal(r.status, 200);
    const resetMail = mails.slice(before).find(m => m.to === 'ok@example.invalid');
    assert.ok(resetMail, 'email de recuperación enviado');
    const link = resetMail.text.match(/https?:\/\/\S+restablecer\?token=\S+/)[0];
    const token = decodeURIComponent(new URL(link).searchParams.get('token'));
    assert.ok(!JSON.stringify(J('profesionales.json')).includes(token), 'el token no se guarda en claro');
    r = await req('/servicios/profesionales/restablecer?token=' + encodeURIComponent(token));
    assert.equal(r.status, 200);
    r = await post('/servicios/profesionales/restablecer', { token, nueva: 'new-password-456' });
    assert.equal(r.status, 200);
    r = await post('/servicios/profesionales/entrar', { email: 'ok@example.invalid', password: 'new-password-456' });
    assert.equal(r.status, 302, 'entra con la contraseña nueva');
    r = await post('/servicios/profesionales/restablecer', { token, nueva: 'otra-password-789' });
    assert.equal(r.status, 400, 'el enlace no se puede reutilizar');
    r = await req('/servicios/profesionales/restablecer?token=inventado');
    assert.equal(r.status, 400);

    step = 'sin SMTP';
    notify._setTransport(null); delete process.env.MAIL_FROM;
    const page = await (await req('/servicios/profesionales/recuperar')).text();
    assert.ok(!page.includes('action="/servicios/profesionales/recuperar"'), 'sin email configurado no se ofrece el formulario');

    console.log('PASS: avisos de solicitudes sin datos del cliente, webhook firmado, altas, aprobaciones, privacidad y recuperación de contraseña.');
  } catch (err) {
    console.error('FALLO en paso:', step); console.error(err);
    process.exitCode = 1;
  } finally {
    for (const s of [server, hookServer]) if (s) { s.closeAllConnections && s.closeAllConnections(); await new Promise(r => s.close(r)); }
    fs.rmSync(dataDir, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();
