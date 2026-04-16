# Stack unificado (TypeScript + Next.js)

## React e Kanban no mesmo processo

A interface de **gestão contratual** e o **Kanban GLPI** estão em **`apps/frontend`**: rota **`/chamados`**, APIs em **`src/app/api/...`**, sincronização e cron em **`instrumentation.ts`**, lógica GLPI em **`src/glpi/`** e **PostgreSQL** partilhado com o Nest (`apps/backend/prisma/schema.prisma` + migrações).

## Situação actual

| Processo | O quê |
|----------|--------|
| **`apps/frontend` (Next.js)** | React, Route Handlers GLPI, cron de sync, Prisma (PostgreSQL). |
| **Raiz `npm start` (`src/index.ts`)** | Worker **opcional**: só sincronização + cron (sem HTTP). |

## PWA

O Next expõe **`app/manifest.ts`** e metadados em `app/layout.tsx`. **Service Worker** (cache offline) convém acrescentar depois (ex.: Serwist) quando o fluxo de build estiver estável.

## Resposta directa à pergunta

> *Não dá para fazer todo o backend em Node e o front em React?*

**Sim — é o modelo do Next.js:** backend em **Node** (Route Handlers, `fetch` no servidor) e front em **React**, no mesmo deploy quando desejável.
