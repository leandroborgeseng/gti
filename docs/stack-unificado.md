# Stack unificado (TypeScript + Next.js)

## React já está em uso

A interface de **gestão contratual** (contratos, metas, medições, modais, sidebar, etc.) é **100 % React** em `apps/frontend`. O único ecrã que ainda não é React é o **Kanban GLPI** (HTML do processo na raiz do monorepo), servido via `/operacao/glpi` até migração.

## Situação actual

Todo o código de negócio já está em **TypeScript**. O que parecem “duas linguagens” são sobretudo **dois processos Node**:

| Processo | O quê |
|----------|--------|
| **`apps/frontend` (Next.js)** | **React** na interface + **Route Handlers** (`app/api` / proxy) — runtime Node oficial do Next. |
| **Raiz `npm start` (`src/index.ts`)** | Servidor HTTP “manual”, HTML do Kanban GLPI, cron de sincronização, Prisma SQLite. |

Ou seja: **não há Java vs Python**; há **React (UI)** e **Node (servidor)** — o que a indústria chama de **aplicação full-stack moderna** é precisamente **Next.js**: **mesmo Node**, **mesma linguagem (TypeScript)**, **front em React** e **back em rotas/API** no mesmo repositório.

## Direcção recomendada (uma app só)

**Consolidar no Next (`apps/frontend`)**:

1. **APIs GLPI** — migrar gradualmente os `GET/POST` de `src/index.ts` para `app/api/.../route.ts` (ou um único `app/api/glpi/[...path]/route.ts` bem estruturado), reutilizando serviços extraídos para `src/lib/glpi/` (ou `packages/glpi-sync`).
2. **Cron / jobs** — `instrumentation.ts` no arranque do Next (adequado em **Railway** com um processo long-lived) ou um pequeno **`apps/worker`** em TypeScript se quiser separar CPU do pedido HTTP.
3. **Prisma SQLite** — mover o schema para `apps/frontend/prisma` (ou pacote partilhado `packages/db`) para um único `prisma generate` no build do Next.
4. **Kanban** — a médio prazo, substituir o HTML gerado em string por **componentes React** (mesma UX, menos risco de XSS e mais fácil de testar). Até lá, o proxy `/operacao/glpi` mantém uma única origem no browser.

**Nest (`apps/backend`)** pode continuar como **API de domínio contratual** (PostgreSQL) ou, numa fase posterior, rotas também absorvidas pelo Next — isso é decisão de escala; o importante é **não** voltar a servir UI em templates no Node isolado.

## PWA

O Next expõe **`app/manifest.ts`** e metadados em `app/layout.tsx` (`viewport`, `appleWebApp`, etc.). **Service Worker** (cache offline, push) convém acrescentar depois com um plugin mantido (ex.: Serwist) quando o fluxo de build estiver estável — evita conflitos com APIs e com o proxy GLPI na primeira fase.

## Resposta directa à pergunta

> *Não dá para fazer todo o backend em Node e o front em React?*

**Sim — é o modelo do Next.js:** backend em **Node** (Route Handlers, Server Actions, `fetch` no servidor) e front em **React**. Unificar significa **ir trazendo** a lógica de `src/index.ts` para dentro de `apps/frontend` em passos pequenos, sem big-bang.
