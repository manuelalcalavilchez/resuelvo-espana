# syntax=docker/dockerfile:1.6
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Stage 1: build dependencies (incl. bcrypt nativo)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FROM node:22-slim AS deps

# bcrypt necesita compilar binarios nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos sÃ³lo los manifests primero para cachear la layer de instalaciÃ³n
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Stage 2: runtime ligero
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app

# Copiamos node_modules ya compilados desde la stage de build
COPY --from=deps /app/node_modules ./node_modules

# Copiamos el cÃ³digo de la aplicaciÃ³n
COPY . .

# Aseguramos las carpetas que se montarÃ¡n como volÃºmenes en Easypanel
RUN mkdir -p /app/data /app/public/uploads \
    && chown -R node:node /app/data /app/public/uploads

# Ejecutamos como usuario no-root por seguridad
USER node

EXPOSE 3000

# Healthcheck contra la home (responde con la splash â†’ 200)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000), r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]


