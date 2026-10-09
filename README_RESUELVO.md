# Resuelvo España — marketplace nacional de servicios

Esta es una evolución independiente del repositorio Queen2. El repositorio original no se modifica. La aplicación existente se conserva y el nuevo vertical se incorpora en `/servicios`.

## Funcionalidad implementada

- Formulario público de solicitudes, 17 categorías y cobertura nacional (50 provincias, Ceuta y Melilla).
- Validación en servidor, límites de longitud, consentimiento obligatorio y teléfono no expuesto en páginas públicas.
- Persistencia JSON con escritura atómica, identificadores únicos, fecha de retención y auditoría; purga diaria de solicitudes caducadas con registro del número eliminado.
- Prueba automatizada aislada de la política de retención ejecutable con `npm test`.
- Registro de profesionales con contraseñas hash bcrypt, selección de especialidades/provincias, aprobación manual e inicio de sesión con sesión.
- Panel profesional con matching por categoría/provincia, máximo de tres asignaciones por solicitud y desbloqueo de contacto mediante libro de créditos.
- Panel administrativo de solicitudes y aprobación/rechazo de profesionales; requiere sesión de administrador existente (`/admin/login`).
- Límites de frecuencia para operaciones de escritura y autenticación; API de catálogo y healthcheck.

## Rutas principales

- `GET /servicios` — página pública y formulario.
- `POST /servicios/solicitud` — crea una solicitud con consentimiento.
- `GET/POST /servicios/profesionales/registro` — alta pendiente de aprobación.
- `GET/POST /servicios/profesionales/entrar` — acceso profesional.
- `GET /servicios/profesionales/panel` — oportunidades y contactos desbloqueados.
- `POST /servicios/profesionales/leads/:id/desbloquear` — asignación mediante créditos.
- `GET /servicios/admin/leads` — administración de leads y profesionales.
- `GET /servicios/api/catalogo` y `GET /servicios/api/health` — API de catálogo y healthcheck.

## Calidad y despliegue

El workflow de GitHub Actions `.github/workflows/ci.yml` ejecuta comprobaciones de sintaxis, `npm test`, auditoría de dependencias de producción y construcción de la imagen Docker en cada push a `main` y en pull requests. La publicación en GitHub no equivale por sí sola a un despliegue confirmado: hay que verificar el servicio y su healthcheck en EasyPanel.

La imagen Docker excluye los ficheros de runtime del marketplace. En EasyPanel deben vivir en el volumen persistente montado en `/app/data`; no se deben copiar datos personales a la imagen.

## Ejecutar

Requiere la versión de Node.js compatible con el `package.json` original.

```bash
npm install
npm start
```

Abrir `http://localhost:3000/servicios` (o el puerto configurado mediante `PORT`).

## Modelo de ingresos previsto

1. Venta de oportunidades con precio por categoría y zona.
2. Créditos prepago y suscripciones para profesionales.
3. Posicionamiento destacado y perfiles verificados.
4. En una fase posterior, comisiones por contratación cuando exista una integración de pagos y trazabilidad fiable.

Los precios en el catálogo son hipótesis internas para experimentar, no tarifas cobradas. El MVP actual **no procesa pagos ni distribuye leads automáticamente**; guarda solicitudes para que puedan gestionarse y validarse antes de activar monetización.

## Próximos hitos antes de producción comercial

- Migrar solicitudes y profesionales a PostgreSQL con migraciones, índices y copias de seguridad.
- Añadir cuentas de profesionales, zonas de servicio y motor de compatibilidad.
- Crear panel administrativo autenticado para solicitudes, profesionales, reclamaciones y devoluciones.
- Integrar proveedor de pago, facturación, libro de créditos y webhooks idempotentes.
- Incorporar límites de distribución, detección de duplicados y política de devolución por leads inválidos.
- Configurar emails/WhatsApp mediante proveedor autorizado, consentimiento, bajas y registro de entregas.
- Completar textos legales y análisis RGPD con asesoramiento profesional antes de uso comercial.
- Añadir pruebas automatizadas, métricas, logs y alertas.

## Seguridad y privacidad

No se publica el teléfono del cliente en el catálogo público. El formulario exige consentimiento antes de guardar una solicitud destinada a profesionales. El consentimiento actual es una base técnica, no sustituye una política de privacidad completa ni una revisión legal. No introducir secretos ni datos reales de clientes en el repositorio.

## Conservación de Queen2

Las vistas, rutas, datos y documentación heredados se mantienen en esta copia. La nueva funcionalidad vive en `marketplace.js` y se monta en `/servicios`; el repositorio `queen2` de origen permanece sin cambios.
