'use strict';
// Recarga de créditos con Stripe Checkout, sin SDK (API REST + verificación HMAC del webhook).
// Desactivado salvo que existan STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET.
const crypto = require('node:crypto');

const PACKS = [
  { id: 'p20', price: 20, credits: 20, label: 'Básico' },
  { id: 'p50', price: 50, credits: 55, label: 'Profesional', bonus: '+5 € de regalo' },
  { id: 'p100', price: 100, credits: 115, label: 'Empresa', bonus: '+15 € de regalo' }
];

function enabled() { return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET); }
function pack(id) { return PACKS.find(p => p.id === id) || null; }

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out); else if (v !== undefined) out.append(key, String(v));
  }
  return out;
}

async function createCheckout({ pack: p, pro, baseUrl }) {
  const body = form({
    mode: 'payment',
    success_url: `${baseUrl}/servicios/profesionales/creditos?pago=ok`,
    cancel_url: `${baseUrl}/servicios/profesionales/creditos?pago=cancelado`,
    client_reference_id: pro.id,
    customer_email: pro.email,
    locale: 'es',
    metadata: { proId: pro.id, pack: p.id, credits: p.credits },
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: p.price * 100, product_data: { name: `Ayuda en el Barrio · ${p.credits} créditos` } } } }
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': crypto.randomUUID() },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error('Stripe no devolvió una sesión de pago (' + res.status + ')');
  return json;
}

// https://docs.stripe.com/webhooks#verify-manually
function verifySignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries([]);
  const v1 = [];
  for (const item of String(header).split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') parts.t = v; else if (k === 'v1') v1.push(v);
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec || !v1.length) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
  return v1.some(sig => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

module.exports = { PACKS, enabled, pack, createCheckout, verifySignature };
