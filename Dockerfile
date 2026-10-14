# syntax=docker/dockerfile:1.6
# Stage 1: dependencias de producción (bcrypt incluye binarios precompilados; se dejan
# las herramientas de compilación por si la plataforma necesita compilarlo)
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 2: runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    RESUELVO_DATA_DIR=/app/data \
    NPM_CONFIG_LOGLEVEL=warn
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# /app/data se monta como volumen persistente en Easypanel
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "server.js"]
