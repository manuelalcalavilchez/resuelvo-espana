# Ayuda en el Barrio

Marketplace para conectar a personas que necesitan resolver trabajos cotidianos con profesionales locales.

## Funcionalidades

- Formulario público para solicitar servicios en España.
- 17 categorías y cobertura nacional, incluidas Ceuta y Melilla.
- Consentimiento explícito antes de compartir los datos con un máximo de tres profesionales compatibles.
- Registro de profesionales con contraseñas hash, revisión manual y acceso por sesión.
- Panel profesional con solicitudes compatibles y desbloqueo controlado de contactos mediante créditos internos.
- Panel administrativo para revisar profesionales, gestionar solicitudes y ajustar créditos de prueba.
- API de catálogo y healthcheck.
- Retención de solicitudes, purga periódica y registro de auditoría.

## Desarrollo

Requiere Node.js 22 o superior.

```bash
npm ci
npm start
```

La aplicación escucha en `http://localhost:3000`; la portada está en `/servicios` y el panel de administración en `/servicios/admin/login`.

## Configuración

Copia `.env.example` a `.env` para desarrollo. En producción deben configurarse `SESSION_SECRET` (al menos 32 caracteres), `ADMIN_PASSWORD`, `NODE_ENV=production`, `PORT` y `RESUELVO_DATA_DIR`. No subas secretos ni datos personales a Git.

Los datos JSON del marketplace se guardan en `RESUELVO_DATA_DIR`; el directorio debe ser persistente y escribible por el usuario del contenedor. No sustituir ni borrar el volumen de producción al desplegar.

## Pruebas

```bash
npm test
npm audit --omit=dev
```

## Estado del producto

Es un MVP: no procesa pagos reales ni garantiza disponibilidad de profesionales. Antes de comercializarlo hay que completar la revisión jurídica y de privacidad, y revisar facturación, condiciones del servicio, seguridad operativa y copias de seguridad.
