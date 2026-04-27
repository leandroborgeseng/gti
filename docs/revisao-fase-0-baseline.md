# Fase 0 — Baseline e decisão de arquitetura (opção A)

## Mapa de processos (produção recomendada)

| Processo | Função |
|----------|--------|
| **`apps/frontend` (Next.js)** | UI (Kanban `/chamados`, contratos, dashboard), Route Handlers `/api/*` GLPI, Prisma, cron de sync em `instrumentation.ts`. |
| **Worker opcional** | Mesmo código GLPI que o Next, sem HTTP: `npm run start:worker` → `apps/frontend/scripts/glpi-worker-cli.ts`. Útil para separar CPU de sync do servidor web (ex.: segundo serviço na Railway). |
| **`apps/backend` (NestJS)** | API REST de contratos, medições, glosas, etc. Corre em processo separado em desenvolvimento; o smoke test pode apontar para o mesmo host se existir proxy ou porta distinta. |

## Matriz de duplicação (resolvida)

| Antes | Depois |
|-------|--------|
| Lógica GLPI na raiz `src/` **e** em `apps/frontend/src/glpi/` | **Uma única fonte:** `apps/frontend/src/glpi/`. A raiz `src/` foi removida. |
| Worker `src/index.ts` | Delega para `glpi-worker-cli.ts` (carrega `.env` antes de importar módulos GLPI). |

## Definição de “pronto” (GLPI + cache)

- Arranque do Next ou do worker autentica no GLPI (ou registra aviso) e roda a primeira sync sem derrubar o processo.
- Sync incremental respeita o cursor em `SyncState` e o âmbito `open` / `all`.
- Kanban e modal leem sobretudo do PostgreSQL; chamadas ao GLPI em tempo real ficam em fluxos pontuais (detalhe, PATCH).
- Logs estruturados com duração da sync concluída e contagens `loaded` / `saved` / `failed`.

## Opção A (escolhida)

**Stack centrada no Next:** HTTP, React e sincronização GLPI partilham o mesmo código em `apps/frontend`. O Nest permanece para o domínio contratual até eventual consolidação futura nas rotas Next.
