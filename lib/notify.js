'use strict';
// Notificaciones salientes. Ambos canales son opcionales y nunca bloquean ni rompen una petición:
//  - Email por SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM).
//  - Webhook JSON firmado (NOTIFY_WEBHOOK_URL + NOTIFY_WEBHOOK_SECRET) para n8n, Evolution API, etc.
const crypto = require('node:crypto');

let transport = null;
let transportOverride = null;

function mailEnabled() { return Boolean(transportOverride || (process.env.SMTP_HOST && process.env.MAIL_FROM)); }
function webhookEnabled() { return Boolean(process.env.NOTIFY_WEBHOOK_URL); }

function getTransport() {
  if (transportOverride) return transportOverride;
  if (!transport) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
      disableFileAccess: true, disableUrlAccess: true
    });
  }
  return transport;
}

const baseUrl = () => (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, paragraphs, cta) {
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:auto;color:#142f2b">'
    + '<div style="background:#142f2b;color:#c9f36b;padding:18px 22px;border-radius:14px 14px 0 0;font-weight:800">Ayuda en el Barrio</div>'
    + '<div style="border:1px solid #e1e7de;border-top:0;padding:22px;border-radius:0 0 14px 14px"><h2 style="margin:0 0 12px">' + escHtml(title) + '</h2>'
    + paragraphs.map(p => '<p style="line-height:1.6;margin:0 0 12px">' + escHtml(p) + '</p>').join('')
    + (cta ? '<p style="margin:18px 0 0"><a href="' + escHtml(cta[1]) + '" style="background:#16745f;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">' + escHtml(cta[0]) + '</a></p>' : '')
    + '</div></div>';
  const text = title + '\n\n' + paragraphs.join('\n\n') + (cta ? '\n\n' + cta[0] + ': ' + cta[1] : '');
  return { html, text };
}

async function sendMail(to, subject, title, paragraphs, cta) {
  if (!mailEnabled() || !to) return false;
  const { html, text } = layout(title, paragraphs, cta);
  try {
    await getTransport().sendMail({ from: process.env.MAIL_FROM || 'no-reply@localhost', to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[ayuda-barrio] Error enviando email:', err.message);
    return false;
  }
}

async function webhook(event, data) {
  if (!webhookEnabled()) return false;
  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  const headers = { 'content-type': 'application/json' };
  if (process.env.NOTIFY_WEBHOOK_SECRET) headers['x-ayuda-signature'] = 'sha256=' + crypto.createHmac('sha256', process.env.NOTIFY_WEBHOOK_SECRET).update(body).digest('hex');
  try {
    const res = await fetch(process.env.NOTIFY_WEBHOOK_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch (err) {
    console.error('[ayuda-barrio] Error en webhook de notificación:', err.message);
    return false;
  }
}

// Lanza sin esperar: la respuesta HTTP no depende del envío.
function fire(promiseFactory) { setImmediate(() => { Promise.resolve().then(promiseFactory).catch(err => console.error('[ayuda-barrio] Notificación fallida:', err && err.message)); }); }

/* Eventos de negocio. Los datos personales del cliente nunca salen en estas notificaciones. */

function leadCreated(lead, pros) {
  const link = baseUrl() + '/servicios/profesionales/panel';
  fire(async () => {
    await webhook('lead.created', { id: lead.id, servicio: lead.servicio, categoria: lead.nombre_categoria, provincia: lead.provincia, municipio: lead.municipio, urgencia: lead.urgencia, precio: lead.precio_referencia_lead_eur, profesionales_avisados: pros.map(p => p.id) });
    for (const p of pros) {
      await sendMail(p.email, (lead.urgencia === 'hoy' ? 'Urgente: ' : '') + 'Nueva solicitud de ' + lead.nombre_categoria.toLowerCase() + ' en ' + lead.municipio,
        'Nueva solicitud en tu zona',
        [lead.nombre_categoria + ' en ' + lead.municipio + ' (' + lead.provincia + ').', '«' + lead.descripcion.slice(0, 240) + (lead.descripcion.length > 240 ? '…' : '') + '»', 'Desbloquear el contacto cuesta ' + lead.precio_referencia_lead_eur + ' créditos. Solo tres profesionales pueden acceder a cada solicitud.'],
        baseUrl() ? ['Ver en mi panel', link] : null);
    }
  });
}

function professionalRegistered(pro) {
  fire(async () => {
    await webhook('professional.registered', { id: pro.id, empresa: pro.empresa, categorias: pro.categorias, provincias: pro.provincias });
    await sendMail(process.env.ADMIN_EMAIL, 'Nuevo profesional pendiente: ' + pro.empresa, 'Alta pendiente de revisión',
      [pro.empresa + ' (' + pro.email + ') ha pedido el alta.', 'Servicios: ' + pro.categorias.join(', ') + '. Provincias: ' + pro.provincias.join(', ') + '.'],
      baseUrl() ? ['Revisar en administración', baseUrl() + '/servicios/admin/profesionales?estado=pending'] : null);
  });
}

function professionalStatus(pro, status) {
  fire(async () => {
    await webhook('professional.status_changed', { id: pro.id, empresa: pro.empresa, status });
    if (status === 'approved') {
      await sendMail(pro.email, 'Tu cuenta en Ayuda en el Barrio está activa', '¡Cuenta aprobada!',
        ['Hola ' + (pro.nombre_contacto || pro.empresa) + ', ya puedes entrar en tu panel y ver las solicitudes de tus servicios y provincias.', 'Recuerda que solo pagas por los contactos que eliges desbloquear.'],
        baseUrl() ? ['Entrar en mi panel', baseUrl() + '/servicios/profesionales/entrar'] : null);
    } else if (status === 'rejected' || status === 'suspended') {
      await sendMail(pro.email, 'Estado de tu cuenta en Ayuda en el Barrio', status === 'rejected' ? 'Solicitud no aprobada' : 'Cuenta suspendida',
        ['Tu cuenta no está activa en este momento. Si crees que es un error, responde a este correo.'], null);
    }
  });
}

function refundResolved(pro, refund) {
  fire(() => sendMail(pro && pro.email, refund.estado === 'aprobado' ? 'Créditos devueltos' : 'Aviso de contacto revisado',
    refund.estado === 'aprobado' ? 'Te hemos devuelto ' + refund.amount + ' créditos' : 'Hemos revisado tu aviso',
    [refund.estado === 'aprobado' ? 'Hemos comprobado tu aviso sobre la solicitud ' + refund.leadId + ' y los créditos ya están en tu saldo.' : 'Tras revisar tu aviso sobre la solicitud ' + refund.leadId + ', no procede la devolución. Si tienes más información, responde a este correo.'],
    baseUrl() ? ['Ver mis créditos', baseUrl() + '/servicios/profesionales/creditos'] : null));
}

function privacyRequest(r) {
  fire(async () => {
    await webhook('privacy.request', { id: r.id, tipo: r.tipo });
    await sendMail(process.env.ADMIN_EMAIL, 'Nueva petición de privacidad (' + r.tipo + ')', 'Petición RGPD recibida',
      ['Tipo: ' + r.tipo + '. Email: ' + r.email + '.', 'Plazo legal de respuesta: un mes.'], baseUrl() ? ['Abrir en administración', baseUrl() + '/servicios/admin/privacidad'] : null);
  });
}

function paymentPaid(proId, pack) { fire(() => webhook('payment.paid', { proId, pack: pack.id, amount: pack.price, credits: pack.credits })); }

function passwordReset(pro, link) {
  return sendMail(pro.email, 'Restablecer tu contraseña', 'Restablecer contraseña',
    ['Hemos recibido una petición para cambiar la contraseña de tu cuenta profesional.', 'El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este mensaje.'], ['Elegir nueva contraseña', link]);
}

module.exports = {
  mailEnabled, webhookEnabled, sendMail, webhook,
  leadCreated, professionalRegistered, professionalStatus, refundResolved, privacyRequest, paymentPaid, passwordReset,
  _setTransport(t) { transportOverride = t; }
};
