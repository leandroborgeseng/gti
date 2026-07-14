# Dump de migração Railway → Coolify

Ficheiro versionado **temporariamente** para levar a base da Railway ao Coolify:

| Ficheiro | Descrição |
|----------|-----------|
| `gti-railway.dump` | Export `pg_dump` (formato custom). **Remover do Git após migração bem-sucedida.** |

## Aviso de segurança

- O dump contém **dados reais** (utilizadores, contratos, chamados). Use repositório **privado**.
- GitHub avisa acima de **50 MB** e bloqueia acima de **100 MB** por ficheiro. Se o dump for grande, use [Git LFS](https://git-lfs.github.com/) ou o fluxo alternativo em `docs/migracao-railway-coolify.md` (`backups/` local, sem Git).

## Fluxo rápido

### 1. Gerar dump e enviar para o Git

**Opção A — GitHub Actions (recomendado):**

1. Em **GitHub → Settings → Secrets**, crie `RAILWAY_DATABASE_URL` (URL completa do Postgres Railway, com `?sslmode=require` se necessário).
2. **Actions → Export DB migration dump → Run workflow**.
3. O workflow faz commit de `migration/gti-railway.dump` em `main`.

**Opção B — Railway CLI (local):**

```bash
railway link
railway run npm run db:export:migration
git add migration/gti-railway.dump
git commit -m "chore(migration): dump Railway para Coolify"
git push origin main
```

**Opção C — Deploy Railway (export no arranque):**

1. No serviço Railway, defina **`GTI_EXPORT_MIGRATION_DUMP=1`** (e opcional volume em `/app/migration`).
2. Redeploy; o entrypoint grava `/app/migration/gti-railway.dump`.
3. Copie o ficheiro para a máquina (`railway run cat …` / volume) e faça commit manual — o deploy **não** faz push ao Git sozinho.

### 2. Restore no Coolify (primeiro deploy)

1. Postgres Coolify criado e vazio (ou compose `docker-compose.coolify.yml`).
2. Na app Coolify, defina **`GTI_IMPORT_MIGRATION_DUMP=1`** e **`DATABASE_URL`** apontando para o Postgres Coolify.
3. Deploy (build inclui `migration/gti-railway.dump` do repo).
4. Nos logs: `[gti-contratos] importação migration/gti-railway.dump concluída`.
5. **Remova** `GTI_IMPORT_MIGRATION_DUMP`, apague `migration/gti-railway.dump` do repo e faça novo commit (não deixe dados em Git).
