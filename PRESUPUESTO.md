# Presupuesto de Implantación, Mantenimiento y Hosting
## Queens VIP Royal

**Elaborado por:** Manuel Alcalá  
**Fecha:** 30 de junio de 2026  
**Validez:** 30 días  

---

## 1. Resumen Ejecutivo

Queens VIP Royal es una plataforma web de directorio de acompañantes verificados con panel de administración, sistema de usuarios, agencias, programa de afiliación y cumplimiento legal RGPD/LSSI. El presente presupuesto cubre la implantación inicial, el hosting en producción y el mantenimiento continuado.

---

## 2. Implantación Inicial (Puesta en Marcha)

### 2.1 Concepto detallado

| Concepto | Descripción | Precio |
|---|---|---|
| Configuración del servidor | Aprovisionamiento VPS, instalación Docker, Easypanel, certificados SSL | 250 € |
| Despliegue de la aplicación | Build Docker, configuración de volúmenes, variables de entorno, dominio | 150 € |
| Configuración DNS + HTTPS | Apuntar dominio, Let's Encrypt, verificar renovación automática | 75 € |
| Carga de datos inicial | Importación de perfiles existentes (si los hay), verificación de integridad | 100 € |
| Configuración de backups | Backup diario automatizado, verificación de restauración | 100 € |
| Testing funcional completo | Verificar todas las rutas, formularios, uploads, panel admin, panel usuario | 200 € |
| Documentación de entrega | Manuales técnico y de usuario, credenciales, procedimientos | 125 € |

### 2.2 Total implantación

| | |
|---|---|
| **Subtotal** | **1.000 €** |
| IVA (21%) | 210 € |
| **TOTAL IMPLANTACIÓN** | **1.210 €** |

---

## 3. Hosting — Opciones

### Opción A: VPS Básico (hasta 50 perfiles)

| Concepto | Especificaciones | Precio mensual |
|---|---|---|
| VPS (Hetzner/Contabo/OVH) | 2 vCPU, 4 GB RAM, 80 GB SSD, 20 TB tráfico | 8-12 €/mes |
| Dominio .com/.es | Renovación anual | ~1 €/mes (12 €/año) |
| Easypanel (self-hosted) | Licencia gratuita para 1 servidor | 0 € |
| SSL (Let's Encrypt) | Certificado gratuito, renovación automática | 0 € |
| **Total Opción A** | | **~10-13 €/mes** |

### Opción B: VPS Medio (50-200 perfiles, mayor tráfico)

| Concepto | Especificaciones | Precio mensual |
|---|---|---|
| VPS (Hetzner/Contabo) | 4 vCPU, 8 GB RAM, 160 GB SSD, tráfico ilimitado | 18-25 €/mes |
| Dominio .com/.es | Renovación anual | ~1 €/mes |
| Backup externo (Backblaze B2) | 50 GB almacenamiento backups off-site | 0,50 €/mes |
| Easypanel | Gratuito (self-hosted) | 0 € |
| **Total Opción B** | | **~20-27 €/mes** |

### Opción C: VPS Premium (200+ perfiles, alto rendimiento)

| Concepto | Especificaciones | Precio mensual |
|---|---|---|
| VPS dedicado | 8 vCPU, 16 GB RAM, 320 GB NVMe | 40-55 €/mes |
| CDN para imágenes (Bunny CDN) | Aceleración de carga de fotos | 5-10 €/mes |
| Backup externo redundante | Backblaze B2 + réplica geográfica | 2 €/mes |
| Monitorización (Uptime Kuma) | Self-hosted en el mismo VPS | 0 € |
| **Total Opción C** | | **~50-70 €/mes** |

### Recomendación

Para el lanzamiento se recomienda **Opción A** o **Opción B**. La arquitectura de Queens (Node.js + JSON files) es extremadamente ligera — un VPS de 4 GB RAM puede servir cientos de perfiles sin problema. Escalar a Opción C solo cuando el tráfico supere los 50.000 visitas/mes.

---

## 4. Mantenimiento Mensual

### 4.1 Plan Básico

| Concepto | Incluye | Precio mensual |
|---|---|---|
| Actualizaciones de seguridad | Parches del SO, Node.js, dependencias npm | Incluido |
| Monitorización de uptime | Comprobación cada 5 min, alerta por caída | Incluido |
| Backups verificados | Verificación semanal de integridad del backup | Incluido |
| Soporte técnico | Hasta 2 horas de soporte/incidencias al mes | Incluido |
| **Total Plan Básico** | | **100 €/mes** |

### 4.2 Plan Estándar

| Concepto | Incluye | Precio mensual |
|---|---|---|
| Todo lo del Plan Básico | — | Incluido |
| Mejoras funcionales menores | Hasta 4 horas de desarrollo al mes | Incluido |
| Optimización de rendimiento | Revisión mensual de tiempos de carga | Incluido |
| Soporte prioritario | Respuesta < 4 h en horario laboral | Incluido |
| **Total Plan Estándar** | | **200 €/mes** |

### 4.3 Plan Premium

| Concepto | Incluye | Precio mensual |
|---|---|---|
| Todo lo del Plan Estándar | — | Incluido |
| Desarrollo de nuevas funcionalidades | Hasta 10 horas de desarrollo al mes | Incluido |
| SEO técnico | Revisión y optimización mensual | Incluido |
| Soporte 24/7 con SLA | Tiempo de respuesta < 1 h, resolución < 4 h | Incluido |
| Informes mensuales | Tráfico, clicks, rendimiento, seguridad | Incluido |
| **Total Plan Premium** | | **400 €/mes** |

---

## 5. Servicios Adicionales (bajo demanda)

| Servicio | Precio |
|---|---|
| Desarrollo a medida (hora) | 50 €/hora |
| Migración a nuevo servidor | 200 € (puntual) |
| Integración pasarela de pago (Stripe/Redsys) | 500-800 € |
| App móvil PWA | 1.500-2.500 € |
| Multi-idioma adicional (por idioma) | 150 € |
| Auditoría de seguridad completa | 300 € |
| Consultoría legal RGPD/LSSI (externo) | A consultar |
| Diseño de landing pages adicionales | 200-400 € |
| Integración con CRM | 400-600 € |

---

## 6. Resumen de Costes — Escenario Recomendado

### Primer año (con Plan Estándar + Hosting Opción B)

| Concepto | Periodicidad | Importe |
|---|---|---|
| Implantación | Único | 1.210 € |
| Hosting (Opción B) | 12 meses × 25 € | 300 € |
| Mantenimiento (Plan Estándar) | 12 meses × 200 € | 2.400 € |
| **TOTAL PRIMER AÑO** | | **3.910 €** |

### Años siguientes

| Concepto | Periodicidad | Importe anual |
|---|---|---|
| Hosting (Opción B) | 12 meses × 25 € | 300 € |
| Mantenimiento (Plan Estándar) | 12 meses × 200 € | 2.400 € |
| **TOTAL ANUAL (desde año 2)** | | **2.700 €** |

---

## 7. Escenario Económico (Mínimo viable)

Para clientes que buscan el coste más bajo posible:

| Concepto | Periodicidad | Importe |
|---|---|---|
| Implantación | Único | 1.210 € |
| Hosting (Opción A) | 12 meses × 12 € | 144 € |
| Mantenimiento (Plan Básico) | 12 meses × 100 € | 1.200 € |
| **TOTAL PRIMER AÑO** | | **2.554 €** |
| **TOTAL ANUAL (desde año 2)** | | **1.344 €** |

---

## 8. Condiciones

### 8.1 Forma de pago
- **Implantación**: 50% al inicio, 50% a la entrega funcional
- **Hosting**: pago mensual o anual (10% descuento si anual)
- **Mantenimiento**: pago mensual por domiciliación o transferencia

### 8.2 Plazos de entrega
- **Implantación completa**: 3-5 días laborables desde confirmación
- **Soporte ante incidencias**: según plan contratado

### 8.3 Propiedad
- El cliente es propietario del 100% del código fuente
- El cliente tiene acceso total al servidor y los datos
- El código fuente se entrega con repositorio Git

### 8.4 Exclusiones
- No incluye creación de contenidos (textos, fotos, vídeos de los perfiles)
- No incluye gestión operativa diaria (altas/bajas de perfiles)
- No incluye asesoramiento legal (RGPD, LSSI) — se recomienda consultor externo
- No incluye campañas de marketing o posicionamiento SEM

### 8.5 Garantía
- 30 días de garantía post-implantación sobre errores funcionales
- Los planes de mantenimiento incluyen corrección de bugs sin coste adicional

---

## 9. Justificación Técnica del Coste de Hosting

La arquitectura de Queens es intencionalmente ligera:

| Métrica | Valor estimado |
|---|---|
| RAM en uso (idle) | ~60-80 MB |
| RAM en uso (carga) | ~120-200 MB |
| Espacio en disco (app) | ~50 MB |
| Espacio en disco (datos, 100 perfiles) | ~500 MB |
| Espacio en disco (uploads, 100 perfiles × 8 fotos) | ~2-4 GB |
| Tiempo de respuesta medio | < 100 ms |
| Capacidad concurrente | 500+ req/s |

Un VPS de 4 GB es más que suficiente para el volumen esperado. No se necesitan servicios cloud costosos (AWS, GCP) ni bases de datos gestionadas.

---

## 10. Contacto

Para aceptar este presupuesto o solicitar aclaraciones:

- **Email**: [a definir por el cliente]
- **WhatsApp**: [a definir por el cliente]
- **Repositorio**: https://gitea.tecnologiaalcala.es/manuel/queen

---

*Presupuesto válido durante 30 días desde la fecha de emisión.*

© Queens VIP Royal · 2026
