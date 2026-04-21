#!/bin/sh
# Arranque da imagem: migrações Prisma e Next.
#
# O script Node `prisma-entry-preflight.cjs` corre primeiro (ver cabeçalho desse ficheiro).
#
# Variáveis opcionais adicionais:
#   PRISMA_RESOLVE_ROLLED_BACK — nome da pasta da migração
#   PRISMA_RESOLVE_APPLIED — nome da pasta da migração
#   SKIP_SEED_OUTSOURCED=1 — não corre o seed dos contratos «sistemas terceirizados» (idempotente)
#
# Depois de recuperação com sucesso, remove variáveis de um uso único e volta a fazer deploy.

set -e
SCHEMA="apps/backend/prisma/schema.prisma"

# Diagnóstico: se nos Deploy Logs não aparecer esta linha, o contentor não é a imagem deste repositório (ou há outro processo a logar por cima).
echo "[gti-contratos] entrypoint imagem monorepo Next+Prisma (sem proxy Nest no repo)"

node ./scripts/prisma-entry-preflight.cjs

if [ -n "$PRISMA_RESOLVE_ROLLED_BACK" ]; then
  echo "prisma migrate resolve --rolled-back $PRISMA_RESOLVE_ROLLED_BACK"
  npx prisma migrate resolve --rolled-back "$PRISMA_RESOLVE_ROLLED_BACK" --schema "$SCHEMA"
fi

if [ -n "$PRISMA_RESOLVE_APPLIED" ]; then
  echo "prisma migrate resolve --applied $PRISMA_RESOLVE_APPLIED"
  npx prisma migrate resolve --applied "$PRISMA_RESOLVE_APPLIED" --schema "$SCHEMA"
fi

npx prisma migrate deploy --schema "$SCHEMA"

# Contratos de referência «Sistemas terceirizados atuais» (ST-2026-001…009). Idempotente.
if [ "${SKIP_SEED_OUTSOURCED:-0}" != "1" ]; then
  echo "[gti-contratos] prisma:seed:outsourced (idempotente)…"
  npm run prisma:seed:outsourced
else
  echo "[gti-contratos] SKIP_SEED_OUTSOURCED=1 — seed terceirizados omitido"
fi

cd apps/frontend && exec npm run start
