# HANDOFF — Ayuda en el Barrio

## Estado (14 oct 2026)

- Rama `feat/fase0-arreglos-monetizacion`, creada desde `redesign/opcion-b` (414cbeb). PR abierta contra `main`.
- Versión 1.2.0. `npm run check`, `npm test` (3 suites) y `npm audit` en verde.
- Revisión visual hecha en escritorio (1360 px) y móvil (390 px): portada, alta, legal, panel, créditos, perfil y administración, sin desbordes ni errores de consola.
- El despliegue en producción NO se ha hecho: requiere copia del volumen y publicación desde Easypanel (ver EASYPANEL.md).

## Qué cambia respecto a la auditoría

- Crítico: migración idempotente de provincias con mojibake (con copia en `data/backups/`).
- Handlers async con captura de errores y manejador global: un fallo de E/S ya no tumba el proceso.
- Solo se pueden desbloquear solicitudes `nuevo`/`asignado`; el desbloqueo no reabre solicitudes.
- Administración de profesionales: IDs, saldo, aprobar/suspender, verificar y ajustar créditos (±, sin saldo negativo).
- Páginas legales, formulario RGPD con almacenamiento propio y supresión real de datos personales.
- Sesión regenerada en el login profesional, logout por POST, CSRF por origen, honeypot, comparación en tiempo constante de la contraseña de administración.
- Monetización: recarga de créditos con Stripe (apagada sin claves), devoluciones por contacto no válido y página de movimientos.
- Rediseño completo y coherente de todas las páginas, SEO técnico y accesibilidad básica.
- Dependencias sin uso eliminadas (incluido nodemon → `node --watch`). El cambio de CI (Node 22, ramas `feat/**`) está pendiente de subir a mano: requiere el permiso `workflow` (copia en `tmp-redesign-data/ci.yml`).

## Hallazgo durante la verificación

- Helmet pone `Referrer-Policy: no-referrer` por defecto y con esa política Chrome envía `Origin: null` en los formularios: la protección CSRF por origen los habría bloqueado todos. Se usa `strict-origin-when-cross-origin` y hay un test que lo vigila.

## v1.3.0 (14 oct 2026, mañana)

- Revisión de Codex en la PR: 4 hallazgos, corregidos por Manuel en `cac3a2b` (ignorar nuevos JSON en Docker/Git, conciliación de pagos, reembolsos idempotentes, supresión definitiva).
- Añadido: `lib/notify.js` (SMTP + webhook firmado), avisos de nuevas solicitudes/altas/aprobaciones/reembolsos/privacidad, recuperación de contraseña con token de un solo uso (hash SHA-256, 1 h), facturas opcionales de Stripe, la UI oculta el selector de estado en solicitudes suprimidas.
- Test nuevo `scripts/test-notify.js`.

## Siguiente trabajo

1. Copia del volumen de producción y despliegue de la PR.
2. Configurar `PUBLIC_BASE_URL` y `LEGAL_*` en Easypanel; revisar textos legales.
3. Activar Stripe en modo test y probar una compra completa.
4. Configurar SMTP y, si se quiere WhatsApp, un flujo n8n que reciba `lead.created` y avise vía Evolution API.
