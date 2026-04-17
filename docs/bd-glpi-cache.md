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

## Persistência do cache GLPI entre deploys

O “sincronismo” (tickets em `Ticket`, atributos, `SyncState`, histórico enriquecido no JSON) **vive na base PostgreSQL** referenciada por `DATABASE_URL`. **Um deploy novo da aplicação não apaga estes dados** desde que:

1. **`DATABASE_URL` aponte sempre para a mesma instância PostgreSQL** (serviço gerido na Railway, RDS, etc.), e não para uma base criada de raiz a cada release dentro do contentor.
2. **Não se execute** `prisma migrate reset` nem se apague o volume da base em produção.
3. As migrações usem apenas `prisma migrate deploy` (como no `Dockerfile`), que **não** limpa tabelas de dados.

Se após cada deploy o sistema “volta a zero” e obriga a reimportar tudo do GLPI, em geral a causa é **nova base vazia** (variável de ambiente trocada para um Postgres novo) ou **plugin Postgres efémero** sem persistência. Corrija o serviço de dados, não o código do sync.

## UI do modal Chamados após deploy

A rota `/chamados` está configurada como **dinâmica** (`dynamic = "force-dynamic"`) para o Next não servir HTML antigo em cache de rota. Se o modal ainda parecer a versão antiga:

- Faça **recarregar forçado** no browser (limpar cache da página ou janela anónima).
- Em **Docker**, se suspeitar de camadas em cache na build: `docker build --no-cache …`.
- Defina **`NEXT_PUBLIC_GTI_BUILD`** (ex.: hash do commit da Railway) e confirme que esse texto aparece no cabeçalho do modal; se não aparecer, o ambiente ainda está a servir um bundle antigo.
