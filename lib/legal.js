'use strict';
// Datos del responsable desde variables de entorno (no se versionan).
function titular() {
  return {
    nombre: process.env.LEGAL_TITULAR || '',
    nif: process.env.LEGAL_NIF || '',
    domicilio: process.env.LEGAL_DOMICILIO || '',
    email: process.env.LEGAL_EMAIL || ''
  };
}
function completo() { const t = titular(); return Boolean(t.nombre && t.nif && t.domicilio && t.email); }
module.exports = { titular, completo };
