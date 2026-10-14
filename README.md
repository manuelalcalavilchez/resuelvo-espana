# Ayuda en el Barrio

Marketplace que conecta a personas que necesitan resolver trabajos cotidianos con profesionales de su zona. Los clientes piden ayuda gratis; los profesionales pagan con créditos por cada contacto que desbloquean.

## Funcionalidades

**Clientes**
- Formulario de solicitud con 17 categorías y las 52 provincias, preselección por categoría desde la portada.
- Consentimiento explícito: los datos se comparten con un máximo de tres profesionales compatibles.
- Formulario de derechos RGPD y páginas de aviso legal, privacidad, cookies y condiciones.

**Profesionales**
- Alta con revisión manual, contraseñas con bcrypt, sesión regenerada al entrar.
- Panel de oportunidades (solo solicitudes abiertas de sus servicios y provincias), contactos desbloqueados con enlaces de llamada, WhatsApp y email.
- Créditos: saldo, movimientos y recarga con Stripe (se activa con variables de entorno).
- Aviso de contacto no válido con devolución de créditos tras revisión (7 días).
- Edición de perfil, servicios, zonas y contraseña; recuperación de contraseña por email.

**Administración**
- Solicitudes con filtros, búsqueda, paginación y supresión de datos personales.
- Profesionales: aprobar, rechazar, suspender, verificar y ajustar créditos.
- Reembolsos, peticiones de privacidad con plazo legal y pagos de Stripe.

**Plataforma**
- Migración automática de datos heredados con copia previa.
- Protección CSRF por origen, honeypot y límites de peticiones, CSP sin scripts en línea.
- Purga automática de solicitudes a los 180 días y registro de auditoría.
- `robots.txt`, `sitemap.xml`, favicon, metadatos Open Graph y `noindex` en zonas privadas.

## Estructura

```
server.js          Arranque, seguridad, webhook de Stripe, SEO y errores (exporta createApp)
marketplace.js     Rutas de clientes, profesionales, administración y legal
lib/catalog.js     Provincias, categorías, precios y corrección de codificación
lib/store.js       Persistencia JSON, auditoría, saldos y migración
lib/ui.js          Plantilla HTML, estilos, iconos y formato
lib/payments.js    Stripe Checkout y verificación de firma del webhook
lib/legal.js       Datos del titular desde variables de entorno
lib/notify.js      Emails (SMTP) y webhook de eventos firmado
scripts/           Tests
```

## Desarrollo

Requiere Node.js 22 o superior.

```bash
npm ci
npm run dev        # recarga automática
npm start
```

La aplicación escucha en `http://localhost:3000`; la portada está en `/servicios` y el panel de administración en `/servicios/admin/login`.

## Configuración

Copia `.env.example` a `.env`. En producción son obligatorias `SESSION_SECRET` (≥ 32 caracteres), `ADMIN_PASSWORD`, `NODE_ENV=production`, `PORT` y `RESUELVO_DATA_DIR`. Ver [EASYPANEL.md](EASYPANEL.md) para pagos, datos legales y despliegue.

Los datos se guardan como JSON en `RESUELVO_DATA_DIR`, que debe ser persistente. El servicio debe ejecutarse con **una sola réplica**.

## Pruebas

```bash
npm run check
npm test
npm audit
```

## Notificaciones

Con SMTP configurado se envían avisos de nuevas solicitudes a los profesionales compatibles (sin datos del cliente), de altas pendientes y peticiones de privacidad al administrador, de cuenta aprobada, de reembolsos y la recuperación de contraseña. Con `NOTIFY_WEBHOOK_URL` los mismos eventos se envían firmados a n8n u otro sistema (por ejemplo, para avisar por WhatsApp).

## Pendiente antes de comercializar

- Revisión jurídica de los textos legales y alta de los datos del titular.
- Decidir facturación: `STRIPE_INVOICES=1` o herramienta externa.
