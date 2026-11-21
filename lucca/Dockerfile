# syntax=docker/dockerfile:1.7
# Asistente de Lucca: servidor + web en una imagen. Los datos (SQLite) van en el volumen /data.
# Imagen base cambiable si Docker Hub limita las descargas: --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
# CA opcional (proxy corporativo): docker build --secret id=ca,src=/ruta/ca.crt .  (Railway no lo necesita)
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production \
    LUCCA_HOST=0.0.0.0 \
    LUCCA_DB=/data/lucca.db \
    TZ=America/Panama \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY --from=build /app/packages/server/dist ./dist
# Railway monta el volumen como root: el contenedor corre como root dentro de su aislamiento (igual que PintaKids).
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4830
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-${LUCCA_PORT:-4830}}/api/health" >/dev/null || exit 1
CMD ["node", "dist/lucca.mjs"]
