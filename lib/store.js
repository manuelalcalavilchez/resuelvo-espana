'use strict';
// Persistencia en ficheros JSON. Todas las operaciones son síncronas a propósito:
// dentro de un único proceso Node, un read-modify-write síncrono no puede intercalarse
// con otra petición. Requisito: UNA sola réplica del servicio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalProvince, categoryName, category } = require('./catalog');

const DATA = process.env.RESUELVO_DATA_DIR || path.join(__dirname, '..', 'data');
const FILES = {
  leads: 'solicitudes.json',
  pros: 'profesionales.json',
  ledger: 'creditos-ledger.json',
  audit: 'marketplace-audit.json',
  privacy: 'privacidad-solicitudes.json',
  refunds: 'reembolsos.json',
  payments: 'pagos.json'
};
const AUDIT_MAX = 10000;

function file(key) { return path.join(DATA, FILES[key]); }

function read(key) {
  try { const x = JSON.parse(fs.readFileSync(file(key), 'utf8')); return Array.isArray(x) ? x : []; }
  catch { return []; }
}

function write(key, rows) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = file(key) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file(key));
}

function audit(action, actor, details = {}) {
  const rows = read('audit');
  rows.push({ id: crypto.randomUUID(), action, actor: actor || 'anonymous', details, at: new Date().toISOString() });
  write('audit', rows.slice(-AUDIT_MAX));
}

function balance(proId, ledger = read('ledger')) {
  return Math.round(ledger.filter(x => x.proId === proId).reduce((s, x) => s + Number(x.amount || 0), 0) * 100) / 100;
}

function balances() {
  const map = new Map();
  for (const x of read('ledger')) map.set(x.proId, (map.get(x.proId) || 0) + Number(x.amount || 0));
  return map;
}

function backup(keys, label) {
  const dir = path.join(DATA, 'backups', label + '-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  for (const key of keys) if (fs.existsSync(file(key))) fs.copyFileSync(file(key), path.join(dir, FILES[key]));
  return dir;
}

// Migración idempotente de datos heredados. Solo escribe si hay algo que cambiar
// y siempre deja copia previa en data/backups/.
function migrateLegacyData() {
  const result = { pros: 0, leads: 0, privacy: 0 };
  const pros = read('pros');
  for (const p of pros) {
    if (!Array.isArray(p.provincias)) continue;
    const fixed = [...new Set(p.provincias.map(canonicalProvince))];
    if (JSON.stringify(fixed) !== JSON.stringify(p.provincias)) { p.provincias = fixed; result.pros++; }
  }
  const leads = read('leads');
  for (const l of leads) {
    let changed = false;
    if (l.provincia) { const f = canonicalProvince(l.provincia); if (f !== l.provincia) { l.provincia = f; changed = true; } }
    if (l.servicio && category(l.servicio)) { const n = categoryName(l.servicio); if (l.nombre_categoria !== n) { l.nombre_categoria = n; changed = true; } }
    if (changed) result.leads++;
  }
  // Las peticiones RGPD vivían en el log de auditoría rotativo: se copian a su propio fichero.
  const privacy = read('privacy');
  const known = new Set(privacy.map(x => x.id));
  const legacyPrivacy = read('audit').filter(x => x.action === 'privacy.request' && !known.has(x.id));
  for (const x of legacyPrivacy) {
    privacy.push({ id: x.id, email: x.details && x.details.email, tipo: x.details && x.details.type, mensaje: '', estado: 'pendiente', created_at: x.at });
    result.privacy++;
  }
  if (result.pros || result.leads || result.privacy) {
    const dir = backup(['pros', 'leads', 'privacy'], 'pre-migracion');
    if (result.pros) write('pros', pros);
    if (result.leads) write('leads', leads);
    if (result.privacy) write('privacy', privacy);
    audit('data.migrated', 'system', { ...result, backup: path.basename(dir) });
  }
  return result;
}

module.exports = { DATA, FILES, read, write, audit, balance, balances, backup, migrateLegacyData };
