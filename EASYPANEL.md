# Despliegue en Easypanel — Ayuda en el Barrio

## Servicio

- Repositorio: `manuelalcalavilchez/resuelvo-espana` · rama `main`.
- Puerto interno: `3000`. Una sola réplica (los datos son ficheros JSON).
- Portada: `/servicios` · Administración: `/servicios/admin/login`.
- Salud: `/health` o `/servicios/api/health` (devuelven la versión de `package.json`).

## Variables de entorno

Obligatorias:

- `NODE_ENV=production`
- `PORT=3000`
- `RESUELVO_DATA_DIR=/app/data`
- `SESSION_SECRET`: valor aleatorio de al menos 32 caracteres.
- `ADMIN_PASSWORD`: contraseña administrativa robusta.

Recomendadas:

- `PUBLIC_BASE_URL=https://tu-dominio` (sin barra final): canonical, sitemap y retorno de Stripe.
- `LEGAL_TITULAR`, `LEGAL_NIF`, `LEGAL_DOMICILIO`, `LEGAL_EMAIL`: datos del responsable que aparecen en aviso legal, privacidad y condiciones. Si faltan, las páginas muestran «pendiente de completar» y el panel de administración lo avisa.

Pagos (opcionales; la recarga de créditos solo se activa si existen las dos):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_INVOICES=1` para que Stripe emita factura de cada recarga y pida NIF opcional (Stripe cobra por factura).

Email (opcional; sin él no hay avisos ni recuperación de contraseña por email):

- `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS o 465 SSL), `SMTP_USER`, `SMTP_PASSWORD`
- `MAIL_FROM` (remitente) y `ADMIN_EMAIL` (recibe altas pendientes y peticiones de privacidad)

Webhook de eventos (opcional, para n8n o WhatsApp vía Evolution API):

- `NOTIFY_WEBHOOK_URL` y `NOTIFY_WEBHOOK_SECRET`. Se envía un POST JSON `{event, at, data}` con cabecera `x-ayuda-signature: sha256=<HMAC del cuerpo>`. Eventos: `lead.created`, `professional.registered`, `professional.status_changed`, `privacy.request`, `payment.paid`. Nunca incluyen teléfono, nombre ni email del cliente.

No guardar secretos en Git, logs ni documentación.

## Activar Stripe

1. En Stripe → Desarrolladores → Webhooks, crear un endpoint `https://tu-dominio/servicios/pagos/webhook` con el evento `checkout.session.completed` (y `checkout.session.async_payment_succeeded` si se activan métodos diferidos).
2. Copiar el secreto de firma (`whsec_…`) a `STRIPE_WEBHOOK_SECRET` y la clave secreta (`sk_live_…` o `sk_test_…`) a `STRIPE_SECRET_KEY`.
3. Reiniciar el servicio. Probar primero con claves de test: comprar un paquete desde el panel profesional y comprobar que aparece en Administración → Pagos y en el saldo.

Paquetes (definidos en `lib/payments.js`): 20 € → 20 créditos · 50 € → 55 · 100 € → 115. Precios con IVA incluido; la facturación queda fuera de la aplicación.

## Datos persistentes y migración

Montar el volumen de producción en `/app/data`. Contiene solicitudes, profesionales, libro de créditos, auditoría, reembolsos, pagos, peticiones de privacidad, sesiones y copias de seguridad.

Al arrancar, la versión 1.2.0 ejecuta una **migración idempotente**:

- Corrige provincias guardadas con doble codificación (`AlmerÃ­a` → `Almería`) en profesionales y solicitudes, y los nombres de categoría.
- Copia las peticiones RGPD que estaban en el log de auditoría a `privacidad-solicitudes.json`.
- Antes de escribir guarda una copia en `data/backups/pre-migracion-<fecha>/`. Si no hay nada que corregir, no escribe nada.

Aun así, **haz una copia del volumen antes de publicar**.

## Publicación segura

1. Copia de seguridad del volumen `/app/data`.
2. `npm ci && npm run check && npm test && npm audit` (lo hace la CI en cada push).
3. Construir la imagen etiquetada con el SHA del commit y conservar la anterior para rollback.
4. Actualizar solo el servicio de Ayuda en el Barrio.
5. Verificar: `/health`, portada, envío de una solicitud de prueba, login de administración, listado de profesionales, login profesional y panel.
6. Revisar en los logs que no aparezcan errores de migración y que exista `data/backups/pre-migracion-*` si había datos heredados.

## Rollback

Volver a la imagen anterior. Si hace falta, restaurar los JSON desde `data/backups/pre-migracion-*/` (la versión anterior funciona con los datos migrados salvo en las provincias con tilde, que volverían a no coincidir).
