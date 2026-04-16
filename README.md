# GTI — Quadro e sincronização GLPI

Serviço em **Node.js + TypeScript** que sincroniza chamados do **GLPI** para **PostgreSQL** (Prisma, mesma base que o backend Nest em `apps/backend`). O **quadro Kanban** e as APIs HTTP vivem na app **Next** (`apps/frontend`, rota `/chamados`). Na raiz, **`npm start`** sobe o **Next** em produção; **`npm run start:worker`** é opcional (só cron + sync GLPI).

## Requisitos

- Node.js 20 ou superior
- Credenciais de acesso à API do GLPI (OAuth + utilizador)

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis obrigatórias (ver comentários no `.env.example`):
   - **`DATABASE_URL`** — PostgreSQL (o mesmo valor em `apps/backend/.env` e `apps/frontend/.env.local`)
   - `GLPI_BASE_URL`, `GLPI_DOC_URL`
   - `GLPI_CLIENT_ID`, `GLPI_CLIENT_SECRET`
   - `GLPI_USERNAME`, `GLPI_PASSWORD`
3. Aplique migrações Prisma no PostgreSQL: `npm run prisma:deploy` (ou `cd apps/backend && npm run prisma:migrate` em desenvolvimento).

Opcional: `GLPI_TICKETS_PATH`, `GLPI_TICKETS_PAGE_SIZE`, `GLPI_TICKETS_FETCH_CONCURRENCY`, `CRON_EXPRESSION`, `PORT`, `HTTP_TIMEOUT_MS`, `LOG_LEVEL`.

## Executar em local

```bash
npm install
npm run prisma:generate
# Interface Next (porta 3001 por defeito):
npm run dev
# Opcional — worker só GLPI (cron + sync, sem HTTP):
npm run dev:worker
```

### Docker (só a app Next)

O contentor **não** inclui PostgreSQL: a base fica num **serviço separado** (ex.: **Railway Postgres**), com `DATABASE_URL` persistente e cópias de segurança geridas pela plataforma.

Na raiz, com Docker instalado:

```bash
cp .env.example .env   # uma vez: preencha DATABASE_URL (Postgres no Railway) e GLPI_*
docker compose build
docker compose up
```

O `docker-compose.yml` usa `env_file: .env` na raiz (não inclui Postgres). O serviço `app` corre `prisma migrate deploy` no arranque e inicia o Next (porta `3000` por defeito). Ver `Dockerfile`.

Na **Railway**, com repositório na raiz: deixe o comando de arranque como **`npm start`** (sobe o Next) e, se quiser o cron GLPI noutro processo, crie um **segundo** serviço com **`npm run start:worker`**. O build deve incluir **`npm run build`** na raiz (ou defina o comando de build assim no painel).

### Checklist rápida — produção hoje (Railway)

1. **PostgreSQL** (plugin Railway): copie `DATABASE_URL` para o serviço da app; se a ligação falhar, acrescente `?sslmode=require` (ou `&sslmode=require`) ao URL.
2. **Variáveis** na app: todas as `GLPI_*` obrigatórias (ver `.env.example`), `DATABASE_URL`, `NODE_ENV=production`. A Railway define **`PORT`** automaticamente; o Next usa essa porta.
3. **Build:** `npm run build` (na raiz do repo).
4. **Start:** `npm start` — corre `prisma migrate deploy` e inicia o Next.
5. **Opcional:** segundo serviço com `npm run start:worker` e as mesmas variáveis (só sync GLPI).
6. **Teste:** `GET /health` no domínio publicado.

## Scripts úteis (`npm run`)

| Script | Descrição |
|--------|-----------|
| `start` | **Next.js** (Kanban + gestão); na Railway usa a variável **`PORT`**. |
| `start:worker` | Worker só GLPI (`apps/frontend/scripts/glpi-worker-cli.ts`); **segundo** serviço se precisar. |
| `build` | Compila o frontend (`apps/frontend`) para deploy na Railway na raiz do repo. |
| `dev` | Next em desenvolvimento (`apps/frontend`, porta 3001). |
| `dev:worker` / `sync` | Worker só GLPI (cron + sync). |
| `postinstall` | Gera o cliente Prisma (corre no `npm install`, incl. Railway em produção) |
| `prisma:generate` | Gera o cliente Prisma a partir de `apps/backend/prisma/schema.prisma` |
| `prisma:migrate` | Cria/aplica migrações em desenvolvimento (Prisma Migrate) |
| `prisma:deploy` | Aplica migrações pendentes em CI/produção |

## Endpoints HTTP (resumo)

- **`GET /`** — Página do quadro Kanban (filtros, cartões, tela inteira, modal).
- **`GET /health`** — Estado do serviço e da última sincronização (JSON).
- **`GET /api/tickets/glpi/:id`** — Dados do chamado para o modal (cache + histórico GLPI quando aplicável).
- **`PATCH /api/tickets/glpi/:id`** — Atualização de título, descrição, status e prioridade no GLPI.
- Outros: `POST /api/kanban`, `POST /api/tickets/recalc-pendencia`, `POST /api/settings/sync-scope`, etc.

## Comportamento da sincronização

- Na arranque, confirma a ligação ao PostgreSQL e tenta autenticar no GLPI.
- Descarrega o OpenAPI (`doc.json`) para descobrir o caminho dos tickets, se não estiver fixo no `.env`.
- Sincroniza chamados **logo ao iniciar** e de seguida conforme `CRON_EXPRESSION` (padrão: a cada 5 minutos).
- O **âmbito** “só abertos” vs “todos no cache” pode ser guardado na interface (estado em PostgreSQL, tabela `SyncState`).
- A sync usa cache local de usuários ativos (TTL de 24h) para preencher solicitantes por `users_id` sem chamadas por ticket.
- Chamadas pontuais a `GET /User/...` permanecem no fluxo do modal (`GET /api/tickets/glpi/:id`) para completar dados quando necessário.

## Base de dados

- **PostgreSQL** (`DATABASE_URL`): schema e migrações em **`apps/backend/prisma/`** (contratos, medições, governança, etc.).
- Cache GLPI no mesmo servidor: modelos **`Ticket`**, **`TicketAttribute`**, **`SyncState`** (migration `20260415140000_add_glpi_sync_cache`).
- Migração de dados antigos em SQLite: exportar/importar manualmente (ex. `pgloader`) ou voltar a sincronizar a partir do GLPI.

## Stack e evolução (TypeScript + Next)

O projecto usa **uma linguagem (TypeScript)** no front e nos servidores Node. A direcção é **consolidar UI e APIs GLPI no Next.js** (Node + React num só deploy); ver **`docs/stack-unificado.md`**. Já existe **base PWA** (`app/manifest.ts`, metadados e `public/icon.svg`); service worker offline fica para uma fase seguinte.

## Novo módulo de contratos públicos (arquitetura isolada)

Para não quebrar o sistema atual de GLPI, o novo módulo foi iniciado em estrutura paralela:

- `apps/backend`: API em NestJS + Prisma + PostgreSQL
- `apps/frontend`: aplicação Next.js + Tailwind + Recharts (base para shadcn/ui)

### Backend (`apps/backend`)

- Módulos criados: `contracts`, `measurements`, `glosas`, `dashboard`.
- Endpoints implementados conforme escopo inicial:
  - `POST/GET/GET:id/PUT` de contratos
  - `POST/GET/GET:id` de medições + `POST :id/calculate` + `POST :id/approve`
  - `POST/GET` de glosas
  - `GET /dashboard/summary` e `GET /dashboard/alerts`
- Suporte inicial a anexos (placeholder persistido em tabela `Attachment`) para medições e glosas.
- `AuditLog` automático nas alterações principais.

### Frontend (`apps/frontend`)

- Layout com sidebar fixa + header + conteúdo responsivo.
- Rotas:
  - `/chamados` — quadro Kanban GLPI (React + APIs no mesmo processo Next)
  - `/dashboard`
  - `/contracts`
  - `/contracts/[id]`
  - `/measurements`
  - `/measurements/[id]`
  - `/glosas`
  - `/suppliers`
  - `/fiscais`
  - `/reports`
- Dashboard com KPIs e gráficos base (Recharts).

### Experiência única (Next + GLPI)

O **Next** em `apps/frontend` concentra a gestão contratual, o Kanban em **`/chamados`**, as rotas **`/api/kanban`**, **`/api/tickets/glpi/…`**, o cron de sincronização (`instrumentation.ts`) e o **PostgreSQL** via **`DATABASE_URL`** (mesmo URL que o Nest). Variáveis **`GLPI_*`** e **`CRON_EXPRESSION`** definem-se no `.env` / `.env.local` (o frontend também tenta `../../.env` na raiz).

O **`npm run start:worker`** na raiz mantém-se como **processo opcional** (só sincronização + cron), útil para separar CPU do servidor web; não expõe HTTP.

### Como iniciar o novo módulo

Backend:

```bash
cd apps/backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Frontend:

```bash
cd apps/frontend
npm install
npm run dev
```

## Documentação e idioma

Toda a **documentação de projeto**, **ficheiros de exemplo** (`.env.example`), **regras Cursor** em `.cursor/rules/` e **textos orientados ao utilizador** na interface devem estar em **português do Brasil (pt-BR)**.

- **`AGENTS.md`** — mapa do monorepo e comandos para agentes.
- **`docs/revisao-fase-0-baseline.md`** — processos e decisão stack (Next).
- **`docs/bd-glpi-cache.md`** — modelo de cache GLPI no PostgreSQL.
- **`docs/glpi-sync-arquitetura.md`** — fluxo de sync, token e cron.
- **`docs/modulos.md`** — índice rápido de pastas.

## Migração incremental (sistema antigo -> novo)

Para acompanhar a execução por etapas e sem quebra:

- `docs/migracao-etapa-0-baseline.md`
- `docs/migracao-etapa-1-paridade-dados.md`
- `docs/migracao-etapa-2-simplificacao.md`
- `docs/validacao-etapa-2-5-regressao.md`
- `docs/implementacao-pendente.md` — o que falta implementar (backlog atual)

## Validação de regressão rápida

Com os serviços no ar, execute:

```bash
npm run smoke:regression
```

## Verificação de tipos (local)

Não há workflow automático no GitHub (evita bloquear deploy no Railway quando a opção *Wait for CI* está ligada). Recomenda-se correr antes de fazer push:

```bash
npm ci && npm run prisma:generate && npm run typecheck
cd apps/backend && npm install && npm run prisma:generate && npm run typecheck
cd apps/frontend && npm ci && npm run typecheck
```
