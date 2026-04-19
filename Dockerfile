# Imagem única da aplicação (Next.js + GLPI + Prisma). PostgreSQL fica fora (ex.: Railway); passe `DATABASE_URL`.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# OpenSSL para o Prisma; o schema tem de existir antes de `npm ci` porque o `postinstall` da raiz corre `prisma generate`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/backend/prisma ./apps/backend/prisma
RUN npm ci
COPY apps/frontend/package.json apps/frontend/package-lock.json ./apps/frontend/
WORKDIR /app/apps/frontend
RUN npm ci
WORKDIR /app

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
ENV NEXT_TELEMETRY_DISABLED=1
ENV GLPI_SKIP_BOOTSTRAP=1
# Opcional na build: `docker build --build-arg NEXT_PUBLIC_GTI_BUILD=$(git rev-parse --short HEAD) …` para o modal Chamados mostrar o commit no cabeçalho.
ARG NEXT_PUBLIC_GTI_BUILD=
ENV NEXT_PUBLIC_GTI_BUILD=${NEXT_PUBLIC_GTI_BUILD}
# O `generator output` do schema deve ser a raiz do monorepo (`node_modules/.prisma/client`); caso contrário o Next falha em «Collecting page data» com «did not initialize yet».
RUN npx prisma generate --schema apps/backend/prisma/schema.prisma \
  && test -f node_modules/.prisma/client/index.js \
  && cd apps/frontend && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# O stage `builder` usa GLPI_SKIP_BOOTSTRAP=1 só para `next build`. No runtime o arranque GLPI deve estar ativo.
ENV GLPI_SKIP_BOOTSTRAP=
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/frontend/package.json /app/apps/frontend/package-lock.json ./apps/frontend/
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/node_modules ./apps/frontend/node_modules

COPY scripts/docker-entrypoint.sh scripts/prisma-entry-preflight.cjs ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000
USER node
CMD ["./scripts/docker-entrypoint.sh"]
