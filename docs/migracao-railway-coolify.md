# Migração Railway → Coolify (GTI monorepo)

Guia operacional para mover a aplicação **Next + Prisma + GLPI** e o **PostgreSQL** da Railway para um servidor com **Coolify**, usando este repositório GitHub como fonte de deploy.

## O que vai para o GitHub

| Artefacto | Repositório | Motivo |
|-----------|-------------|--------|
| `Dockerfile`, `docker-compose.coolify.yml`, scripts | Sim | Deploy Coolify |
| **`migration/gti-railway.dump`** | **Sim, temporário** | Fluxo pedido: dump no Git → restore no Coolify (`GTI_IMPORT_MIGRATION_DUMP=1`) |
| `.env` de produção | **Não** | Segredos |
| `uploads/` (anexos) | **Não** | Transferir por rsync/volume |

**Segurança:** o dump tem dados reais — repositório **privado** obrigatório. Após migração, **apague** `migration/gti-railway.dump` do Git. Dumps > 50 MB: Git LFS ou `backups/` local.

---

## Fluxo via Git (Railway → Git → Coolify)

```mermaid
sequenceDiagram
  participant R as Railway Postgres
  participant GH as GitHub
  participant C as Coolify

  Note over R,GH: 1. Export
  R->>GH: workflow ou railway run → migration/gti-railway.dump
  Note over GH,C: 2. Deploy Coolify
  GH->>C: clone com dump na imagem
  C->>C: GTI_IMPORT_MIGRATION_DUMP=1 → pg_restore
  Note over GH: 3. Limpeza
  GH->>GH: remover dump + GTI_IMPORT_MIGRATION_DUMP
```

### Passo 1 — Dump no Git (escolha uma opção)

**A — GitHub Actions (mais simples)**

1. Secret **`RAILWAY_DATABASE_URL`** no repo (Settings → Secrets → Actions).
2. **Actions → Export DB migration dump → Run workflow**.
3. Confirme commit de `migration/gti-railway.dump` em `main`.

**B — Railway CLI**

```bash
railway link
railway run npm run db:export:migration
git add migration/gti-railway.dump && git commit -m "chore(migration): dump Railway" && git push
```

**C — Export no deploy Railway (one-shot)**

1. Variável **`GTI_EXPORT_MIGRATION_DUMP=1`** no serviço Railway (+ volume opcional em `/app/migration`).
2. Redeploy; nos logs aparece o dump criado.
3. Copie o ficheiro para o repo e faça `git push` (o deploy **não** envia ao Git sozinho).

### Passo 2 — Restore no Coolify

1. Crie Postgres no Coolify (vazio).
2. Deploy da app a partir do GitHub (`main` com o dump commitado).
3. Variáveis no Coolify:
   - `DATABASE_URL` → Postgres Coolify
   - **`GTI_IMPORT_MIGRATION_DUMP=1`** (só no primeiro deploy)
   - restantes (`JWT_SECRET`, `GLPI_*`, `UPLOAD_ROOT`, …)
4. Volume: `/app/apps/frontend/uploads`, arranque como root (`user: 0:0`).
5. Deploy; nos logs: `importação migration/gti-railway.dump concluída`.
6. Teste login e `/chamados`.
7. **Limpeza:** remova `GTI_IMPORT_MIGRATION_DUMP`, apague `migration/gti-railway.dump`, commit e redeploy.

---

## O que vai para o GitHub (referência legada / alternativas)

| Artefacto | Repositório | Motivo |
|-----------|-------------|--------|
| Scripts `scripts/db-export.sh`, `scripts/db-import.sh` | Sim | Import manual sem dump no repo |
| Dump em `backups/` local | **Não** | Ignorado pelo Git |

---

## Arquitetura alvo no Coolify

Recomendação para este monorepo:

```
┌─────────────────────────────────────────────────────────┐
│  Servidor Coolify (VPS)                                  │
│                                                          │
│  ┌──────────────────┐    ┌──────────────────────────┐ │
│  │ PostgreSQL 16      │◄───│ App GTI (Dockerfile)      │ │
│  │ (recurso Coolify   │    │ Next :3000                │ │
│  │  ou serviço        │    │ Volume: …/uploads         │ │
│  │  compose)          │    │ Cron GLPI no mesmo proc.  │ │
│  └──────────────────┘    └──────────────────────────┘ │
│           ▲                          ▲                   │
│           │ DATABASE_URL             │ Traefik / domínio │
└───────────┼──────────────────────────┼───────────────────┘
            │                          │
     import pg_restore            utilizadores HTTPS
```

**Opção A (recomendada):** dois recursos Coolify — **PostgreSQL** + **Application (Dockerfile)**.  
**Opção B:** um recurso **Docker Compose** com `docker-compose.coolify.yml` (app + Postgres no mesmo stack).

O worker GLPI separado (`npm run start:worker`) é **opcional**: o cron já corre no processo Next via `instrumentation.ts`. Só crie um segundo serviço se quiser isolar sync pesada.

---

## Fase 0 — Inventário (antes de desligar a Railway)

1. **Railway → serviço Postgres:** copie `DATABASE_URL` (com `?sslmode=require` se aplicável).
2. **Railway → serviço app:** exporte todas as variáveis (GLPI_*, JWT_SECRET, RESEND_*, etc.) para um gestor de passwords — **não** para o Git.
3. **Volume de anexos:** confirme se existe volume em `/app/apps/frontend/uploads` e quanto ocupa.
4. **Domínio:** anote DNS atual (CNAME/A) apontando para Railway.
5. **Versão em produção:** confirme commit deployado (`main` / tag).

Checklist rápida de variáveis obrigatórias (ver `.env.coolify.example`):

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `GLPI_BASE_URL`, `NEXT_PUBLIC_GLPI_BASE_URL`, `GLPI_DOC_URL`
- `GLPI_CLIENT_ID`, `GLPI_CLIENT_SECRET`, `GLPI_USERNAME`, `GLPI_PASSWORD`
- `CRON_EXPRESSION` (ex.: `*/5 * * * *`)
- Opcional: `RESEND_API_KEY`, `RESEND_FROM`

---

## Fase 1 — Preparar o Coolify

1. Instale Coolify no VPS (documentação oficial: [coolify.io/docs](https://coolify.io/docs)).
2. Ligue o GitHub: **Settings → Sources → GitHub App** (acesso ao repo `gti`).
3. Crie um **Project** (ex.: `GTI Produção`).

### Opção A — Postgres + App separados

**PostgreSQL**

1. **+ New Resource → Database → PostgreSQL** (16).
2. Anote host interno, porta, user, password, database.
3. Monte `DATABASE_URL` interno, ex.:
   `postgresql://USER:PASS@HOST:5432/DB?schema=public`
4. No Coolify, use a URL **interna** entre serviços na mesma rede Docker.

**Application**

1. **+ New Resource → Application → Public Repository** (ou privado).
2. Repositório: este monorepo, branch `main`.
3. **Build pack:** Dockerfile, caminho `Dockerfile` na raiz.
4. **Porta exposta:** `3000`.
5. **Domínio:** configure FQDN (Coolify gere certificado Let's Encrypt).
6. **Persistent Storage:** montagem **`/app/apps/frontend/uploads`** (nome sugerido: `gti-uploads`).
7. **Variáveis de ambiente:** cole a partir do `.env.coolify.example` preenchido.
8. **Utilizador do contentor:** arranque como **root** (`user: 0:0` no compose ou opção equivalente no Coolify) para o `docker-entrypoint.sh` ajustar permissões do volume — equivalente ao `RAILWAY_RUN_UID=0` na Railway.
9. Defina também `UPLOAD_ROOT=/app/apps/frontend/uploads` (caminho absoluto).

**Deploy:** Coolify faz build da imagem e arranca; o entrypoint corre `prisma migrate deploy` automaticamente.

### Opção B — Docker Compose único

1. **+ New Resource → Docker Compose**.
2. Aponte para o repo e ficheiro **`docker-compose.coolify.yml`**.
3. Crie ficheiro `.env` no Coolify (UI) com `POSTGRES_PASSWORD` e restantes variáveis.
4. Ative storage persistente para volumes `gti_uploads` e `gti_postgres_data`.

---

## Fase 2 — Migrar o banco de dados (Railway → Coolify)

**Janela de manutenção recomendada** (15–60 min): reduz divergência entre dump e cutover.

### 2.1 Exportar da Railway (máquina local ou CI)

Na sua máquina, com `postgresql-client` instalado:

```bash
cp .env.coolify.example .env.migracao   # preencha RAILWAY_DATABASE_URL (origem)
# Edite .env.migracao — NÃO commite este ficheiro

export $(grep -v '^#' .env.migracao | xargs)
./scripts/db-export.sh
```

O script grava `backups/gti-YYYYMMDD-HHMMSS.sql.gz` (pasta ignorada pelo Git).

Alternativa manual:

```bash
pg_dump "$RAILWAY_DATABASE_URL" --no-owner --no-acl --format=custom -f backups/gti.dump
```

### 2.2 Importar no Postgres do Coolify

**Antes do primeiro deploy da app** (base vazia) ou **depois de parar a app** na Railway:

```bash
# COOLIFY_DATABASE_URL = URL interna ou pública temporária do Postgres Coolify
export COOLIFY_DATABASE_URL='postgresql://...'
./scripts/db-import.sh backups/gti-YYYYMMDD-HHMMSS.sql.gz
```

O script usa `pg_restore` (formato custom) ou `psql` (SQL plain), conforme extensão.

### 2.3 Validar dados

```bash
psql "$COOLIFY_DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\";"
psql "$COOLIFY_DATABASE_URL" -c "SELECT COUNT(*) FROM \"Ticket\";"
psql "$COOLIFY_DATABASE_URL" -c "SELECT key, LEFT(value,40) FROM \"SyncState\" LIMIT 5;"
```

Confirme utilizadores, contratos e cache GLPI.

### 2.4 Migrações Prisma

No **primeiro arranque** no Coolify, `docker-entrypoint.sh` corre `prisma migrate deploy`.  
Se importou um dump **completo** de produção Railway já migrado, normalmente **não há migrações pendentes**.  
Se aparecer drift, consulte `AGENTS.md` (secção Prisma / `_prisma_migrations`).

**Proteção em base com dados reais:** defina `PRISMA_NO_AUTO_WIPE_ON_LEGACY_DRIFT=1` até resolver manualmente.

---

## Fase 3 — Migrar anexos (uploads)

Os ficheiros **não** vão para o GitHub.

1. **Na Railway:** descarregue o volume (CLI `railway run`, SFTP se disponível, ou backup manual dos ficheiros em `uploads/`).
2. **No Coolify:** com a app parada ou em manutenção, copie para o volume montado em `/app/apps/frontend/uploads`:
   - `rsync -avz ./uploads-backup/ user@vps:/caminho/do/volume/`
   - ou `docker cp` para o contentor em execução.
3. Confirme permissões: o entrypoint como root faz `chown node:node` e `chmod` no arranque.

Teste: abrir uma medição/glosa/tarefa com anexo existente e fazer download.

---

## Fase 4 — Deploy e testes no Coolify

Ordem sugerida:

1. Postgres no Coolify **com dados importados**.
2. Deploy da app **sem** tráfego público (domínio de teste ou IP + porta).
3. Variáveis GLPI e JWT **iguais** à Railway (sessões antigas expiram naturalmente; JWT_SECRET igual mantém tokens válidos).
4. Testes:
   - `GET https://seu-dominio/health`
   - Login com utilizador conhecido
   - `/chamados` — faixa «última sincronização» + «Sincronizar agora» (ADMIN/EDITOR)
   - Contrato + medição + anexo
5. Opcional: segundo serviço worker (`npm run start:worker`) só se quiser cron isolado; nesse caso defina `GLPI_CRON_DISABLED=1` na app web.

---

## Fase 5 — Cutover DNS e descomissionar Railway

1. **TTL DNS:** reduza para 300 s 24 h antes.
2. Aponte CNAME/A para o IP/domínio do Coolify.
3. Monitore logs 24–48 h (sync GLPI, erros Prisma, EACCES em uploads).
4. Mantenha Railway **só leitura** mais 1 semana; backup final do Postgres Railway.
5. Remova serviços Railway após confirmação.

---

## Diferenças Railway ↔ Coolify (referência rápida)

| Tema | Railway | Coolify |
|------|---------|---------|
| Build | `Dockerfile` / `railway.json` | Dockerfile ou Compose no repo |
| Postgres | Plugin gerido | Recurso Database ou serviço `postgres` no compose |
| Porta | `PORT` injectada | Fixar `3000` ou mapear no proxy |
| Anexos | Volume + `RAILWAY_RUN_UID=0` | Storage + root no arranque + `UPLOAD_ROOT` |
| `RAILWAY_VOLUME_MOUNT_PATH` | Auto | Use `UPLOAD_ROOT=/app/apps/frontend/uploads` |
| SSL | Railway / domínio custom | Traefik + Let's Encrypt |
| Worker GLPI | 2.º serviço opcional | 2.ª Application ou cron no mesmo container |

---

## Rollback

Se o cutover falhar:

1. Reverta DNS para Railway.
2. Railway continua com o último estado **antes** do dump (ou restaure backup Railway se fez import destrutivo).
3. Investigue logs Coolify antes de nova tentativa.

---

## Pós-migração (melhorias)

- Backups agendados Postgres no VPS (Coolify backup ou `cron` + `pg_dump` para S3).
- Monitorização (`/health`, uptime externo).
- Remover referências Railway obsoletas na documentação quando a migração estiver estável.

---

## Comandos úteis

```bash
# Export
./scripts/db-export.sh

# Import
./scripts/db-import.sh backups/gti-20260714-120000.sql.gz

# Teste local stack Coolify (dev)
docker compose -f docker-compose.coolify.yml --env-file .env up --build
```

Para dúvidas sobre Prisma, volumes e cron GLPI, ver também `AGENTS.md` e `README.md` (secção Coolify).
