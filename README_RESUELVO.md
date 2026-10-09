# Resuelvo España — marketplace nacional de servicios

Esta es una evolución independiente del repositorio Queen2. El repositorio original no se modifica. La aplicación existente se conserva y el nuevo vertical se incorpora en `/servicios`.

## MVP incluido

- Formulario público de solicitudes para servicios profesionales.
- Cobertura de las 50 provincias y Ceuta y Melilla.
- Catálogo inicial de categorías de hogar, mantenimiento, informática y servicios personales.
- Validación de datos en servidor y consentimiento expreso antes de guardar datos de contacto.
- Persistencia atómica en `data/solicitudes.json`.
- Identificador único de solicitud, estado, urgencia, categoría y precio orientativo interno de lead.
- API de catálogo en `GET /servicios/api/catalogo` y healthcheck en `GET /servicios/api/health`.
- Diseño responsive para móvil y escritorio.

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
