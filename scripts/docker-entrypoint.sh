#!/bin/sh
# Arranque da imagem: migrações Prisma e Next.
#
# O script Node `prisma-entry-preflight.cjs` corre primeiro (ver cabeçalho desse ficheiro).
#
# Variáveis opcionais adicionais:
#   PRISMA_RESOLVE_ROLLED_BACK — nome da pasta da migração
#   PRISMA_RESOLVE_APPLIED — nome da pasta da migração
#
# Depois de recuperação com sucesso, remove variáveis de um uso único e volta a fazer deploy.

set -e
SCHEMA="apps/backend/prisma/schema.prisma"

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
exec sh ./scripts/start-web-with-nest.sh
