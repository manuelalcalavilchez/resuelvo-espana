'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cron = require('node-cron');
// Do not create a real daily timer during an isolated test.
cron.schedule = () => ({ stop() {} });

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resuelvo-flows-'));
  let server;
  try {
    process.env.RESUELVO_DATA_DIR = dataDir;
    const password = 'test-only-password-123';
    const proId = 'PRO-TEST-FLOW';
    const leadId = 'LEAD-TEST-FLOW';
    const future = new Date(Date.now() + 86400000).toISOString();
    fs.writeFileSync(path.join(dataDir, 'profesionales.json'), JSON.stringify([{
      id: proId, empresa: 'Profesional de prueba', nombre_contacto: 'Prueba', email: 'flow-test@example.invalid',
      telefono: '600123456', password_hash: await bcrypt.hash(password, 4), categorias: ['fontaneria'],
      provincias: ['Almería'], status: 'approved', verified: true
    }]));
    fs.writeFileSync(path.join(dataDir, 'solicitudes.json'), JSON.stringify([{
      id: leadId, servicio: 'fontaneria', nombre_categoria: 'Fontanería', precio_referencia_lead_eur: 7,
      provincia: 'Almería', municipio: 'Almería', urgencia: 'esta_semana', descripcion: 'Reparación de prueba',
      cliente: { nombre: 'Cliente de prueba', telefono: '600111222', email: 'customer@example.invalid' },
      consentimiento_contacto: true, estado: 'nuevo', asignaciones: [], created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), retention_until: future
    }]));
    fs.writeFileSync(path.join(dataDir, 'creditos-ledger.json'), JSON.stringify([
      { id: 'CREDIT-TEST', proId, amount: 20, type: 'test_credit', at: new Date().toISOString() }
    ]));
    fs.writeFileSync(path.join(dataDir, 'marketplace-audit.json'), '[]');

    const { router } = require('../marketplace');
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'test-session-secret-only', resave: false, saveUninitialized: false }));
    app.use('/servicios', router);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    let response = await fetch(base + '/servicios/api/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);

    response = await fetch(base + '/servicios/profesionales/entrar', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'flow-test@example.invalid', password: 'wrong-password' }), redirect: 'manual'
    });
    assert.equal(response.status, 401);
    const auditAfterFailure = JSON.parse(fs.readFileSync(path.join(dataDir, 'marketplace-audit.json'), 'utf8'));
    const failedLogin = auditAfterFailure.find(x => x.action === 'professional.login_failed');
    assert.ok(failedLogin);
    assert.equal(JSON.stringify(failedLogin).includes('flow-test@example.invalid'), false, 'failed login audit must not store email');

    response = await fetch(base + '/servicios/profesionales/entrar', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'flow-test@example.invalid', password }), redirect: 'manual'
    });
    assert.equal(response.status, 302);
    const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie, 'successful login should create a session cookie');

    response = await fetch(base + `/servicios/profesionales/leads/${leadId}/desbloquear`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'manual'
    });
    assert.equal(response.status, 302);
    let ledger = JSON.parse(fs.readFileSync(path.join(dataDir, 'creditos-ledger.json'), 'utf8'));
    assert.equal(ledger.reduce((sum, row) => sum + row.amount, 0), 13, 'unlock must deduct the price once');
    let leads = JSON.parse(fs.readFileSync(path.join(dataDir, 'solicitudes.json'), 'utf8'));
    assert.equal(leads[0].asignaciones.length, 1);
    assert.equal(leads[0].asignaciones[0].proId, proId);

    response = await fetch(base + `/servicios/profesionales/leads/${leadId}/desbloquear`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'manual'
    });
    assert.equal(response.status, 302);
    ledger = JSON.parse(fs.readFileSync(path.join(dataDir, 'creditos-ledger.json'), 'utf8'));
    assert.equal(ledger.reduce((sum, row) => sum + row.amount, 0), 13, 'repeated unlock must not double-charge');
    leads = JSON.parse(fs.readFileSync(path.join(dataDir, 'solicitudes.json'), 'utf8'));
    assert.equal(leads[0].asignaciones.length, 1, 'repeated unlock must not duplicate assignment');

    response = await fetch(base + '/servicios/admin/leads');
    assert.equal(response.status, 403, 'admin leads must reject anonymous access');
    console.log('PASS: health, login audit privacy, credit deduction, duplicate unlock, and admin access checks.');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
