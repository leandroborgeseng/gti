# GTI — Quadro e sincronização GLPI

Serviço em **Node.js + TypeScript** que sincroniza chamados do **GLPI** para **PostgreSQL** (Prisma, mesma base que o backend Nest em `apps/backend`). O **quadro Kanban** e as APIs HTTP vivem na app **Next** (`apps/frontend`, rota `/chamados`). O **`npm start`** na raiz mantém um **worker opcional** (cron de sincronização).

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
npm run dev
```

O servidor sobe na porta definida por `PORT` (padrão **3000**).

## Scripts úteis (`npm run`)

| Script | Descrição |
|--------|-----------|
| `dev` / `start` / `sync` | Arranca o processo (HTTP + cron de sincronização) |
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

O **`npm start`** na raiz do repositório mantém-se como **worker opcional** (só sincronização + cron), útil se quiser separar processos em produção; não serve mais HTML nem APIs HTTP duplicadas.

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
