# Base de dados — cache GLPI (PostgreSQL + Prisma)

## Modelos de cache

### `Ticket`

- Uma linha por chamado GLPI (`glpiTicketId` único).
- Campos normalizados para listagem e filtros (título, estado, prioridade, datas em string ISO como devolvidas pelo GLPI, grupo de contrato, requerente).
- `rawJson`: payload bruto para o modal e enriquecimentos; **não** é carregado na listagem do Kanban (performance).
- Índices úteis: `waitingParty`, `requesterEmail`, `status` + `dateCreation`, `dateModification`.

### `TicketAttribute`

- Pares `(ticketId, keyPath)` achatados para pesquisas auxiliares.
- `onDelete: Cascade` quando o ticket é removido.

### `SyncState`

- Chave-valor genérico: cursor `last_sync_date_mod`, totais remotos, preferências de âmbito do Kanban, etc.
- `key` é `@id` (string).

## Ciclo de vida

1. Job de sync lê páginas da API GLPI e faz upsert em `Ticket` + atributos.
2. Tickets fechados podem ser removidos ou mantidos conforme `SyncState` / âmbito `open` vs `all`.
3. Migrações vivem em `apps/backend/prisma/migrations/`; o mesmo `DATABASE_URL` serve Nest e Next.

## Operações recomendadas

- `npm run prisma:deploy` na raiz antes de `npm start` em produção.
- Em Docker: o `CMD` da imagem executa `prisma migrate deploy` antes de `next start`; `DATABASE_URL` aponta para o **Postgres externo** (ex.: Railway), não para um contentor local.
