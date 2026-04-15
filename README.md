# GTI — Quadro e sincronização GLPI

Serviço em **Node.js + TypeScript** que sincroniza chamados do **GLPI** para **SQLite** (Prisma), expõe um **quadro Kanban** na web, filtros, painel de idade dos abertos, modal de edição com histórico e API HTTP. Pensado para correr num **único processo** (por exemplo no Railway).

## Requisitos

- Node.js 20 ou superior
- Credenciais de acesso à API do GLPI (OAuth + utilizador)

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis obrigatórias (ver comentários no `.env.example`):
   - `GLPI_BASE_URL`, `GLPI_DOC_URL`
   - `GLPI_CLIENT_ID`, `GLPI_CLIENT_SECRET`
   - `GLPI_USERNAME`, `GLPI_PASSWORD`

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
| `prisma:generate` | Gera o cliente Prisma |
| `prisma:push` | Aplica o schema ao SQLite (`data.db`) |

## Endpoints HTTP (resumo)

- **`GET /`** — Página do quadro Kanban (filtros, cartões, tela inteira, modal).
- **`GET /health`** — Estado do serviço e da última sincronização (JSON).
- **`GET /api/tickets/glpi/:id`** — Dados do chamado para o modal (cache + histórico GLPI quando aplicável).
- **`PATCH /api/tickets/glpi/:id`** — Atualização de título, descrição, status e prioridade no GLPI.
- Outros: `POST /api/kanban`, `POST /api/tickets/recalc-pendencia`, `POST /api/settings/sync-scope`, etc.

## Comportamento da sincronização

- Na arranque, garante o schema SQLite e tenta autenticar no GLPI.
- Descarrega o OpenAPI (`doc.json`) para descobrir o caminho dos tickets, se não estiver fixo no `.env`.
- Sincroniza chamados **logo ao iniciar** e de seguida conforme `CRON_EXPRESSION` (padrão: a cada 5 minutos).
- O **âmbito** “só abertos” vs “todos no cache” pode ser guardado na interface (estado em SQLite).
- A sync usa cache local de usuários ativos (TTL de 24h) para preencher solicitantes por `users_id` sem chamadas por ticket.
- Chamadas pontuais a `GET /User/...` permanecem no fluxo do modal (`GET /api/tickets/glpi/:id`) para completar dados quando necessário.

## Base de dados

- Ficheiro SQLite: `prisma/data.db` (caminho definido no `schema.prisma`).
- Modelos principais: `Ticket`, `TicketAttribute`, `SyncState`.

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

## Validação de regressão rápida

Com os serviços no ar, execute:

```bash
npm run smoke:regression
```

## Integração contínua (GitHub Actions)

Em cada push ou pull request para `main`, o repositório executa verificação de TypeScript (raiz, `apps/backend` e `apps/frontend`). Ver o ficheiro `.github/workflows/ci.yml`.

Em local, equivalente:

```bash
npm ci && npm run prisma:generate && npm run typecheck
cd apps/backend && npm install && npm run prisma:generate && npm run typecheck
cd apps/frontend && npm install && npm run typecheck
```
