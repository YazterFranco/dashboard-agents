# syntax=docker/dockerfile:1.7
# AgentDash — servidor + UI en una imagen pequeña. Los hooks corren en tu máquina
# y envían a http://127.0.0.1:4820 (puerto publicado solo en localhost).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/
# Optional corporate/proxy CA: docker build --secret id=ca,src=/path/ca.crt .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    AGENTDASH_HOST=0.0.0.0 \
    AGENTDASH_PORT=4820 \
    AGENTDASH_DB=/data/agentdash.db
COPY --from=build /app/packages/cli/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4820
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:4820/api/health >/dev/null || exit 1
CMD ["node", "dist/agentdash.mjs", "start"]
