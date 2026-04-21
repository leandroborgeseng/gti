# Orientação para agentes (Cursor e similares)

## Onde está cada coisa

- **Kanban GLPI, APIs de tickets, cron de sync:** `apps/frontend/src/glpi/` e `apps/frontend/src/app/api/`.
- **Arranque do cron no servidor:** `apps/frontend/instrumentation.ts` (runtime Node.js).
- **Next em dev:** `npm run dev` (porta 3001). **Worker só sync:** `npm run dev:worker` ou `npm run start:worker`.
- **Schema e migrações Prisma:** `apps/backend/prisma/`.
- **API Nest (contratos, medições, glosas, …):** `apps/backend/src/`.

## Manual do utilizador (interface)

- O manual em `/manual` é alimentado por `apps/frontend/src/content/manual-do-utilizador.ts`.
- Sempre que alterar menus (`main-nav-data.ts`), fluxos relevantes da UI ou permissões por papel, **atualize o manual** no mesmo PR (texto em pt-BR, foco no utilizador) e ajuste a data `MANUAL_LAST_UPDATED` nesse ficheiro.

## Regras rápidas

- Documentação de projeto e mensagens ao utilizador: **pt-BR** (ver `.cursor/rules/`).
- Antes de um PR, correr na raiz: `npm run typecheck` (gera Prisma e valida `apps/frontend` + `apps/backend`).
- Não reintroduzir código GLPI duplicado fora de `apps/frontend/src/glpi/`.

## Docker

- `docker compose up --build` na raiz: **só** a imagem da app Next (ver `Dockerfile` e `docker-compose.yml`). O Postgres fica fora (ex.: Railway); defina `DATABASE_URL` no `.env` ou nas variáveis do ambiente.
- Ficheiro `.env` na raiz (referenciado por `docker-compose.yml`) com `DATABASE_URL` (Postgres externo, ex.: Railway) e `GLPI_*`.
- **Railway / migrações órfãs:** `scripts/prisma-entry-preflight.cjs` corre antes do `migrate deploy`. Se `_prisma_migrations` tiver nomes que já não existem em `prisma/migrations`, o schema `public` é **reiniciado automaticamente** (sem variável). **Em bases com dados reais**, defina sempre `PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT=1` até o drift estar resolvido manualmente. Reinício forçado em todo o arranque: `PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT=1`. Baseline: `20260419100000_baseline_full_schema`.
