# Despliegue en EasyPanel â€” Ayuda en el Barrio

## Servicio

- Repositorio: `manuelalcalavilchez/ayuda-en-el-barrio` (una vez completado el cambio de nombre en GitHub).
- Rama: `main`.
- Puerto interno: `3000`.
- Ruta pÃºblica principal de la aplicaciÃ³n: `/servicios`.
- AdministraciÃ³n: `/servicios/admin/login`.
- Salud: `/health` o `/servicios/api/health`.

## Variables de entorno

Configurar como secretos persistentes del servicio:

- `NODE_ENV=production`
- `PORT=3000`
- `SESSION_SECRET`: valor aleatorio de al menos 32 caracteres.
- `ADMIN_PASSWORD`: contraseÃ±a administrativa robusta.
- `RESUELVO_DATA_DIR=/app/data`

No guardar los valores secretos en Git, logs o documentaciÃ³n.

## Datos persistentes

Montar el volumen de producciÃ³n en `/app/data`. Contiene solicitudes, profesionales, libro de crÃ©ditos, auditorÃ­a y sesiones. No borrar ni sustituir este volumen al publicar una imagen nueva. Antes de cualquier migraciÃ³n, realizar copia de seguridad.

## PublicaciÃ³n segura

1. Ejecutar `npm test`, comprobaciones de sintaxis y `npm audit --omit=dev`.
2. Construir una imagen etiquetada con el SHA del commit.
3. Conservar la imagen anterior como rollback.
4. Actualizar solo el servicio de Ayuda en el Barrio, sin modificar los demás servicios del servidor.
5. Verificar `/health`, `/servicios/api/health`, portada, inicio de sesiÃ³n administrativo y panel profesional.
6. Confirmar que el volumen persistente sigue conectado y que el servicio estÃ¡ estable.

El MVP no integra pagos reales. Antes de comercializarlo deben revisarse los textos legales, privacidad y obligaciones de facturaciÃ³n.

