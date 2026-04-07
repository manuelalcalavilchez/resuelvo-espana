# syntax=docker/dockerfile:1.6
# ─────────────────────────────────────────────
# Stage 1: build dependencies (incl. bcrypt nativo)
# ─────────────────────────────────────────────
FROM node:20-slim AS deps

# bcrypt necesita compilar binarios nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos sólo los manifests primero para cachear la layer de instalación
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ─────────────────────────────────────────────
# Stage 2: runtime ligero
# ─────────────────────────────────────────────
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app

# Copiamos node_modules ya compilados desde la stage de build
COPY --from=deps /app/node_modules ./node_modules

# Copiamos el código de la aplicación
COPY . .

# Aseguramos las carpetas que se montarán como volúmenes en Easypanel
RUN mkdir -p /app/data /app/public/uploads \
    && chown -R node:node /app

# Ejecutamos como usuario no-root por seguridad
USER node

EXPOSE 3000

# Healthcheck contra la home (responde con la splash → 200)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000), r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
