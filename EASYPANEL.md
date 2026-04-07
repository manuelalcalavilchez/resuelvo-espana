# Despliegue en Easypanel — Queens

Guía rápida para desplegar este proyecto en [Easypanel](https://easypanel.io/) usando el `Dockerfile` incluido.

---

## 1. Crear el servicio

1. En tu proyecto de Easypanel → **+ Service** → **App**.
2. **Source:** GitHub → repositorio `dnogares/queenviproyal`, branch `master`.
3. **Build method:** `Dockerfile` (auto-detectado).
4. **Build path:** `/` (raíz del repo).
5. **Port:** `3000`.

---

## 2. Variables de entorno

En la pestaña **Environment** del servicio añade:

| Variable | Valor recomendado | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | Easypanel inyecta su propio puerto si lo dejas así |
| `ADMIN_PASSWORD` | *(elige una fuerte)* | Acceso a `/admin/login` |
| `SESSION_SECRET` | *(string aleatorio largo)* | Usa `openssl rand -hex 32` |
| `WHATSAPP_NUMBER` | `34610216548` | Fallback inicial — luego se edita desde `/admin/config` |

> ⚠️ **No** guardes el `.env` en el repo. Easypanel inyecta estas variables en tiempo de ejecución.

---

## 3. Volúmenes persistentes (CRÍTICO)

Sin volúmenes, **cada redeploy borra la base de datos y las fotos subidas**.

En la pestaña **Mounts** del servicio crea estos dos volúmenes:

| Tipo | Mount path | Descripción |
|---|---|---|
| Volume | `/app/data` | Almacena `config.json`, `perfiles.json`, `usuarios.json`, `agencias.json` |
| Volume | `/app/public/uploads` | Fotos y vídeos subidos por las anunciantes |

Easypanel los crea automáticamente en `/etc/easypanel/projects/<proj>/<service>/volumes/`.

---

## 4. Dominio y HTTPS

1. Pestaña **Domains** → **+ Add Domain**.
2. Escribe tu dominio (ej. `queenviproyal.com`).
3. Activa **HTTPS** (Let's Encrypt automático).
4. Apunta tu DNS (`A` record) a la IP de tu servidor Easypanel.

---

## 5. Primer arranque

1. **Deploy** → Easypanel construye la imagen y arranca el contenedor.
2. Comprueba los logs: deberías ver `Servidor en puerto 3000` (o similar).
3. Visita `https://tu-dominio/` → debería cargar la portada.
4. Entra a `https://tu-dominio/admin/login` con la `ADMIN_PASSWORD` que pusiste.
5. Verifica `/admin/config` → deberías ver el número de WhatsApp configurado.

---

## 6. Healthcheck

El `Dockerfile` incluye:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000), r => process.exit(r.statusCode < 500 ? 0 : 1))"
```

Easypanel lo respeta — si el contenedor deja de responder, lo reinicia automáticamente.

---

## 7. Backups recomendados

Configura un backup automático (Easypanel → **Backups**) sobre los volúmenes:

- `/app/data` (BD de perfiles + config)
- `/app/public/uploads` (fotos y vídeos)

Frecuencia recomendada: **diaria**, retención **7-14 días**.

---

## 8. Actualizar el código

Cada `git push origin master` desde tu equipo:

1. Easypanel detecta el commit (si tienes el webhook activado) o haz **Deploy** manual.
2. Reconstruye la imagen → arranca el contenedor nuevo → los volúmenes se reutilizan.
3. **Cero pérdida de datos** porque `data/` y `uploads/` están fuera del contenedor.

---

## 9. Troubleshooting

| Problema | Causa probable | Solución |
|---|---|---|
| `bcrypt` no compila | Falta `python3` / `make` / `g++` | El Dockerfile ya los instala en la stage `deps` |
| Las fotos desaparecen tras un redeploy | Falta el volumen `/app/public/uploads` | Añadir el mount |
| `/admin/config` muestra el número antiguo | El `.env` no se actualiza | El número editable está en `data/config.json`, no en `.env` |
| 502 Bad Gateway | Healthcheck fallando, app crasheada | Mira los logs de Easypanel |
| Pérdida de sesiones tras redeploy | `SESSION_SECRET` no fijado | Configurarlo como env var |

---

## 10. Dominios múltiples / staging

Puedes crear un segundo servicio (ej. `queenviproyal-staging`) que apunte a una branch distinta (`develop`) con su propio volumen, dominio y `ADMIN_PASSWORD`.

---

¡Listo! 👑
