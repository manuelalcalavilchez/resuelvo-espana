# Manual Técnico y de Operaciones
## Queens VIP Royal

**Autor:** Manuel Alcalá  
**Versión:** 1.1  
**Fecha:** 2026-06-30  

---

## 1. Arquitectura General

Queens es una aplicación web monolítica server-side rendered (SSR) diseñada para máxima portabilidad y mínima complejidad operativa.

```
┌─────────────────────────────────────────────┐
│              CLIENTE (Navegador)             │
├─────────────────────────────────────────────┤
│         Express.js + EJS (SSR)              │
│              server.js                       │
├─────────────────────────────────────────────┤
│    Almacenamiento: JSON Files (data/)       │
│    Archivos: public/uploads/                │
├─────────────────────────────────────────────┤
│    Docker (node:20-slim) → Easypanel        │
└─────────────────────────────────────────────┘
```

**Decisiones arquitectónicas clave:**
- Sin base de datos SQL → eliminación de dependencias de drivers nativos
- Escritura atómica en archivos JSON (tmp + rename) → tolerancia a cortes
- Contenedor stateless (datos en volúmenes montados) → redeploy sin pérdida
- SSR completo → SEO-friendly sin hidratación JS compleja

---

## 2. Pila Tecnológica

| Componente | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | 20.x LTS |
| Framework HTTP | Express.js | 4.18.x |
| Motor de plantillas | EJS | 3.1.x |
| Autenticación | express-session + session-file-store | 1.17.x / 1.5.x |
| Cifrado passwords | bcrypt | 5.1.x |
| Seguridad HTTP | helmet | 8.x |
| Rate limiting | express-rate-limit | 8.x |
| Subida de archivos | multer | 1.4.x |
| Tareas programadas | node-cron | 3.x |
| Logging | pino + pino-http | 10.x / 11.x |
| Cookies | cookie-parser | 1.4.x |
| Contenedor | Docker (node:20-slim) | — |
| Hosting | Easypanel (Docker + Traefik) | — |

---

## 3. Estructura del Proyecto

```
queens/
├── server.js              # Aplicación principal (rutas, lógica, middlewares)
├── translations.js        # Traducciones multiidioma (10 idiomas)
├── package.json           # Dependencias y scripts
├── Dockerfile             # Imagen de producción (multi-stage)
├── .env.example           # Plantilla de variables de entorno
├── data/                  # Base de datos JSON (volumen persistente)
│   ├── perfiles.json      # Todos los perfiles de anunciantes
│   ├── agencias.json      # Agencias y chalets registrados
│   ├── usuarios.json      # Usuarios con acceso al panel
│   ├── config.json        # Configuración global editable
│   ├── clicks.json        # Tracking de clicks por perfil
│   ├── takedowns.json     # Solicitudes de retirada de contenido
│   ├── gdpr_requests.json # Solicitudes RGPD
│   └── backups/           # Backups diarios automáticos
├── public/                # Assets estáticos
│   ├── css/               # Hojas de estilo
│   ├── js/                # JavaScript del cliente
│   ├── img/               # Imágenes del sistema
│   └── uploads/           # Fotos/vídeos subidos (volumen persistente)
└── views/                 # Plantillas EJS
    ├── admin/             # Panel de administración
    │   ├── dashboard.ejs  # Dashboard con stats y tabla de perfiles
    │   ├── agencias.ejs   # Gestión de agencias
    │   ├── usuarios.ejs   # Gestión de usuarios
    │   ├── perfil-form.ejs# Formulario crear/editar perfil
    │   ├── config.ejs     # Configuración global
    │   ├── recordatorios.ejs # Alertas de expiración
    │   ├── clicks.ejs     # Estadísticas de clicks
    │   └── login.ejs      # Login admin
    ├── acceso/            # Login de modelos/agencias
    ├── partials/          # Componentes reutilizables (header, footer)
    ├── home.ejs           # Página principal
    ├── city.ejs           # Listado por ciudad
    ├── profile.ejs        # Ficha de perfil
    ├── registro.ejs       # Formulario de registro
    ├── planes.ejs         # Comparativa de planes
    ├── legal.ejs          # Páginas legales
    ├── ghost.ejs          # Modo seguro
    ├── age-gate.ejs       # Verificación 18+
    └── splash.ejs         # Splash screen
```

---

## 4. Almacenamiento de Datos

### 4.1 Funciones de acceso

```javascript
const readDB = (file) => { ... }   // Lectura síncrona + manejo de errores
const writeDB = async (file, data) => { ... } // Escritura atómica (tmp + rename)
```

### 4.2 Modelos de datos

**Perfil** (`perfiles.json`):
```json
{
  "id": "Q-A1B2",
  "nombre": "Nombre artístico",
  "ciudad": "Madrid",
  "categoria": "chica|chico|trans",
  "telefono": "34612345678",
  "estado": "solicitud_recibida|pendiente_archivos|pendiente_verificacion|pendiente_pago|activo|pausado|expirado|rechazado",
  "plan": "basica|destacada",
  "disponibilidad": "disponible|no_disponible|proximamente",
  "descripcion": "...",
  "edad": 25,
  "idiomas": "Español, Inglés",
  "servicios": "...",
  "tarifas": "...",
  "horario": "...",
  "fotos": ["uploads/Q-A1B2/foto1.jpg", ...],
  "video": "uploads/Q-A1B2/video.mp4",
  "fecha_inicio": "2026-01-15",
  "fecha_fin": "2026-02-15",
  "agencia_id": "AG-123456789",
  "referidos_count": 0,
  "orden_manual": 0,
  "notas_internas": "...",
  "created_at": "2026-01-15T10:00:00.000Z"
}
```

**Agencia** (`agencias.json`):
```json
{
  "id": "AG-1719830400000",
  "nombre": "Nombre de la agencia",
  "ciudad": "Barcelona",
  "descripcion": "Descripción breve",
  "contacto": "34612345678",
  "estado": "pendiente|activa|rechazada",
  "created_at": "2026-06-30T12:00:00.000Z"
}
```

**Usuario** (`usuarios.json`):
```json
{
  "id": "U-A1B2C3D4",
  "email": "usuario@email.com",
  "password_hash": "$2b$10$...",
  "rol": "modelo|agencia",
  "estado": "pendiente|activo|rechazado",
  "perfil_id": "Q-A1B2",
  "agencia_id": "AG-123456789",
  "created_at": "2026-01-15T10:00:00.000Z"
}
```

### 4.3 Integridad de datos

- **Escritura atómica**: `writeDB()` escribe primero en archivo temporal `.tmp` y luego renombra (`fs.rename`), evitando corrupción si el proceso muere durante la escritura.
- **Backups automáticos**: cron job diario a las 4:00 AM, retención de 14 días.
- **No editar JSON manualmente**: siempre gestionar a través del panel admin.

---

## 5. Seguridad

### 5.1 Cabeceras HTTP
- `helmet` configura CSP, HSTS, X-Frame-Options, etc.
- CSP personalizado permite imágenes externas (banderas, mapas) y scripts de analytics.

### 5.2 Autenticación
- **Admin**: contraseña única en variable de entorno `ADMIN_PASSWORD`. Sesión.
- **Usuarios (modelos/agencias)**: email + password con hash bcrypt (10 rounds). Sesión almacenada en archivos (`session-file-store`).

### 5.3 Rate limiting
- Protección contra fuerza bruta en rutas de login.
- Límites configurables por IP.

### 5.4 CSRF
- Validación de origen en formularios POST.
- Cookies SameSite.

### 5.5 Uploads
- `multer` con filtro de tipos MIME (solo imágenes y vídeo).
- Almacenamiento en directorio dedicado por perfil.
- Límites de tamaño configurados.

### 5.6 Variables de entorno obligatorias en producción

| Variable | Obligatoria en prod | Descripción |
|---|---|---|
| `PORT` | No (default: 3000) | Puerto de escucha |
| `ADMIN_PASSWORD` | **Sí** | Contraseña del panel admin |
| `SESSION_SECRET` | **Sí** | Clave para firmar sesiones |
| `WHATSAPP_NUMBER` | No | Número de fallback (se configura en `/admin/config`) |
| `NODE_ENV` | Recomendada | `production` para activar checks |

Si faltan `ADMIN_PASSWORD` o `SESSION_SECRET` en producción, el servidor **no arranca** (exit 1).

---

## 6. Rutas Principales del Servidor

### 6.1 Rutas públicas

| Método | Ruta | Función |
|---|---|---|
| GET | `/` | Splash + age-gate |
| GET | `/inicio` | Home con provincias |
| GET | `/ciudad/:ciudad` | Listado por ciudad con filtros |
| GET | `/perfil/:id` | Ficha pública de perfil |
| GET | `/registro` | Formulario de inscripción |
| GET | `/planes` | Planes y precios |
| GET | `/ghost` | Modo seguro |
| GET | `/legal/:page` | Páginas legales |
| GET | `/health` | Healthcheck (JSON) |
| GET | `/perfil/:id/contacto` | Click tracking + redirect WhatsApp |

### 6.2 Rutas admin (protegidas por `requireAdmin`)

| Método | Ruta | Función |
|---|---|---|
| GET | `/admin` | Dashboard (stats + tabla perfiles) |
| GET | `/admin/perfil/nuevo` | Formulario nuevo perfil |
| POST | `/admin/perfil/nuevo` | Crear perfil |
| GET | `/admin/perfil/:id/editar` | Formulario editar |
| POST | `/admin/perfil/:id/editar` | Guardar edición |
| POST | `/admin/perfil/:id/estado` | Cambio rápido de estado |
| POST | `/admin/perfil/:id/eliminar` | Eliminar perfil |
| GET | `/admin/agencias` | Listado de agencias |
| POST | `/admin/agencias/nueva` | Crear agencia (estado: pendiente) |
| POST | `/admin/agencias/:id/estado` | Cambiar estado de agencia |
| POST | `/admin/agencias/:id/eliminar` | Eliminar agencia |
| GET | `/admin/usuarios` | Listado de usuarios |
| POST | `/admin/usuarios/:id/estado` | Cambiar estado/datos de usuario |
| GET | `/admin/config` | Configuración global |
| GET | `/admin/recordatorios` | Perfiles próximos a expirar |
| GET | `/admin/clicks` | Estadísticas de clicks |

### 6.3 Rutas panel usuario (protegidas por `requireAuth`)

| Método | Ruta | Función |
|---|---|---|
| GET | `/panel` | Dashboard del modelo/agencia |
| GET/POST | `/acceso/login` | Login |
| GET | `/acceso/logout` | Cerrar sesión |

---

## 7. Tareas Programadas (Cron)

| Tarea | Frecuencia | Función |
|---|---|---|
| Auto-expiración | Cada hora | Marca como "expirado" perfiles cuya `fecha_fin` ha pasado |
| Backup diario | 4:00 AM | Copia todos los JSON a `data/backups/YYYY-MM-DD/` |
| Limpieza backups | Diario | Elimina backups con más de 14 días |

---

## 8. Despliegue

### 8.1 Docker

El Dockerfile usa multi-stage build:
1. **Stage `deps`**: instala dependencias con compilación nativa (bcrypt)
2. **Stage `runtime`**: imagen slim con solo node_modules compilados + código

```bash
docker build -t queenviproyal .
docker run -d \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=... \
  -e SESSION_SECRET=... \
  -v queen_data:/app/data \
  -v queen_uploads:/app/public/uploads \
  queenviproyal
```

### 8.2 Easypanel

Ver `EASYPANEL.md` para instrucciones paso a paso. Puntos críticos:
- **Volúmenes**: `/app/data` y `/app/public/uploads` deben ser persistentes
- **HTTPS**: Let's Encrypt automático vía Traefik
- **Healthcheck**: incluido en Dockerfile (reinicio automático si falla)

### 8.3 Migración a otro host

1. Exportar volúmenes `data/` y `public/uploads/`
2. `git clone` del repositorio
3. Configurar variables de entorno
4. `docker build` + `docker run` con volúmenes montados
5. Apuntar DNS al nuevo servidor

---

## 9. Modificaciones al Código

### 9.1 Cambios estéticos
- `public/css/style.css` — estilos globales
- `public/css/splash.css` — splash screen

### 9.2 Traducciones
- `translations.js` — objeto con 10 idiomas, claves funcionales

### 9.3 Lógica de negocio
- `server.js` — toda la lógica reside aquí (rutas, middlewares, cron)

### 9.4 Vistas
- `views/` — plantillas EJS organizadas por sección

### 9.5 Datos
- `data/*.json` — **NUNCA editar manualmente**; siempre usar el panel admin

---

## 10. Monitorización y Troubleshooting

### 10.1 Healthcheck
`GET /health` devuelve JSON con estado del servidor. Docker lo usa para auto-restart.

### 10.2 Logs
En producción, logs a stdout/stderr (capturados por Docker/Easypanel).

### 10.3 Problemas comunes

| Problema | Causa | Solución |
|---|---|---|
| `bcrypt` no compila | Falta python3/make/g++ | Dockerfile lo incluye en stage `deps` |
| Fotos desaparecen tras redeploy | Falta volumen `/app/public/uploads` | Montar volumen |
| Config no se guarda | Falta volumen `/app/data` | Montar volumen |
| 502 Bad Gateway | App crasheada | Ver logs de Easypanel |
| Sesiones se pierden | `SESSION_SECRET` cambia entre deploys | Fijar como env var |
| JSON corrupto | Escritura interrumpida | Restaurar desde backup |

---

## 11. Historial de Cambios

| Fecha | Versión | Cambios |
|---|---|---|
| 2026-06-30 | 1.1 | Añadidos contadores de usuarios/agencias pendientes en dashboard. Campo `estado` en agencias. Badges en navegación. Botones aprobar/rechazar agencias. |
| 2026-04-07 | 1.0 | Versión inicial documentada |

---

© Queens VIP Royal · 2026
