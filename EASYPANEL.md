# Despliegue en EasyPanel — Resuelvo España

Repositorio independiente: `manuelalcalavilchez/resuelvo-espana`, rama `main`.
El marketplace está montado en `/servicios`. **No desplegar el repositorio original `queen2` ni la rama `master`.** Este MVP todavía requiere una revisión legal y de privacidad y no tiene pagos reales.

## 1. Servicio

- Tipo: **App**, fuente GitHub.
- Repositorio: `manuelalcalavilchez/resuelvo-espana`.
- Rama: `main`.
- Build: Dockerfile en la raíz.
- Puerto interno: `3000`.

## 2. Variables de entorno obligatorias

Configurar en EasyPanel → Environment; no subir secretos al repositorio:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `ADMIN_PASSWORD` | Contraseña única, larga y no reutilizada |
| `SESSION_SECRET` | Secreto aleatorio de al menos 32 bytes |

Genera los secretos fuera del repositorio. Por ejemplo, en un terminal Linux seguro: `openssl rand -hex 32`. No reutilices contraseñas de otros servicios. El servidor debe detenerse si falta cualquiera de las dos variables críticas.

## 3. Volumen persistente

Crear un volumen persistente montado en **`/app/data`**. El proyecto guarda ahí configuración, perfiles, solicitudes, profesionales, libro de créditos, auditoría y sesiones. Sin persistencia pueden perderse datos y sesiones al redeplegar.

Las subidas usan `/app/public/uploads`; si se habilitan en el despliegue, monta también esa ruta en un volumen persistente. Configura copias de seguridad cifradas y prueba una restauración antes de admitir datos reales.

## 4. Dominio y HTTPS

1. Asignar el dominio de Resuelvo España en EasyPanel.
2. Configurar el DNS hacia el servidor.
3. Activar HTTPS.
4. Comprobar que las cookies seguras funcionan detrás del proxy.

## 5. Verificación tras desplegar

- `GET /servicios` debe devolver HTTP 200.
- `GET /servicios/api/health` debe devolver JSON con `ok: true`.
- `GET /servicios/api/catalogo` debe mostrar categorías y provincias.
- `GET /servicios/admin/leads` sin sesión de administrador debe devolver HTTP 403.
- Verificar que los datos sobreviven a un redeploy.
- Revisar los logs y confirmar que no se imprimen contraseñas ni secretos.

## 6. Antes de producción comercial

- Migrar la persistencia JSON a PostgreSQL y usar transacciones/concurrencia segura.
- Implementar eliminación automática y verificable de datos vencidos y gestión real de solicitudes RGPD.
- Añadir pruebas automatizadas, alertas, backups y restauración.
- Revisar todos los endpoints y controles de acceso, incluido el código heredado.
- Integrar pagos, facturación, email y WhatsApp solo con proveedores configurados y pruebas de webhooks.
- Completar términos, política de privacidad, consentimientos y revisión legal.

**Estado:** MVP técnico; no hay cobros reales ni despliegue de producción confirmado por este documento.
