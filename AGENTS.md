# Orientação para agentes (Cursor e similares)

## Onde está cada coisa

- **Kanban GLPI, APIs de tickets, cron de sync:** `apps/frontend/src/glpi/` e `apps/frontend/src/app/api/`.
- **Arranque do cron no servidor:** `apps/frontend/instrumentation.ts` (runtime Node.js).
- **Next em dev:** `npm run dev` (porta 3001). **Worker só sync:** `npm run dev:worker` ou `npm run start:worker`.
- **Schema e migrações Prisma:** `apps/backend/prisma/`.
- **API Nest (contratos, medições, glosas, …):** `apps/backend/src/`.

## Regras rápidas

- Documentação de projeto e mensagens ao utilizador: **pt-BR** (ver `.cursor/rules/`).
- Antes de um PR, correr na raiz: `npm run typecheck` (gera Prisma e valida `apps/frontend` + `apps/backend`).
- Não reintroduzir código GLPI duplicado fora de `apps/frontend/src/glpi/`.

## Docker

- `docker compose up --build` na raiz: **só** a imagem da app Next (ver `Dockerfile` e `docker-compose.yml`). O Postgres fica fora (ex.: Railway); defina `DATABASE_URL` no `.env` ou nas variáveis do ambiente.
- Ficheiro `.env` na raiz (referenciado por `docker-compose.yml`) com `DATABASE_URL` (Postgres externo, ex.: Railway) e `GLPI_*`.
- **Railway / P3009 (migração falhada):** sem shell na base, podes correr `migrate resolve` no arranque do serviço: variável `PRISMA_RESOLVE_ROLLED_BACK` ou `PRISMA_RESOLVE_APPLIED` com o nome da migração (ex.: `20260418130000_contract_amendments`), um deploy, depois remove a variável e volta a fazer deploy. Ver comentários em `scripts/docker-entrypoint.sh`.
