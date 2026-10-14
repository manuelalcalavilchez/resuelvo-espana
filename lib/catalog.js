'use strict';

const provincias = ['A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Las Palmas', 'Pontevedra', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'];

// [id, nombre, precio de desbloqueo en créditos (1 crédito = 1 €)]
const categorias = [
  ['fontaneria', 'Fontanería', 7], ['electricidad', 'Electricidad', 7], ['climatizacion', 'Climatización', 10],
  ['cerrajeria', 'Cerrajería', 9], ['reformas', 'Reformas y albañilería', 20], ['pintura', 'Pintura', 10],
  ['limpieza', 'Limpieza', 3], ['mudanzas', 'Mudanzas y portes', 8], ['jardineria', 'Jardinería', 5],
  ['montajes', 'Montaje de muebles', 4], ['electrodomesticos', 'Reparación de electrodomésticos', 7],
  ['informatica', 'Informática y reparación', 5], ['mascotas', 'Cuidado de mascotas', 4],
  ['fotografia', 'Fotografía y eventos', 8], ['belleza', 'Belleza a domicilio', 4],
  ['clases', 'Clases particulares', 4], ['otros', 'Otros servicios', 5]
];

const urgencias = { hoy: 'Hoy · urgente', manana: 'Mañana', esta_semana: 'Esta semana', flexible: 'Sin prisa' };

// Los datos creados antes del 13/10/2026 guardaban las provincias con doble codificación
// (p. ej. "AlmerÃ­a"). Re-interpretar los bytes Latin-1 como UTF-8 recupera el valor exacto.
function fixMojibake(value) {
  const s = String(value ?? '');
  if (!/[ÃÂâ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    return fixed.includes('�') ? s : fixed;
  } catch { return s; }
}

// Formas heredadas conocidas, incluida la variante en la que se perdió el carácter de control
// invisible (p. ej. "Ã\u0081vila" guardado como "Ãvila").
const LEGACY_PROVINCES = new Map();
for (const p of provincias) {
  const m = Buffer.from(p, 'utf8').toString('latin1');
  if (m !== p) { LEGACY_PROVINCES.set(m, p); LEGACY_PROVINCES.set(m.replace(/[\u0080-\u009f]/g, ''), p); }
}

function canonicalProvince(value) {
  if (provincias.includes(value)) return value;
  if (LEGACY_PROVINCES.has(value)) return LEGACY_PROVINCES.get(value);
  const fixed = fixMojibake(value);
  return provincias.includes(fixed) ? fixed : value;
}

function category(id) { return categorias.find(c => c[0] === id) || null; }
function categoryName(id) { const c = category(id); return c ? c[1] : String(id || ''); }

module.exports = { provincias, categorias, urgencias, fixMojibake, canonicalProvince, category, categoryName };
