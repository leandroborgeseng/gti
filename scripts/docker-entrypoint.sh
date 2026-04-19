#!/bin/sh
# Arranque da imagem: migrações Prisma e Next.
#
# Variáveis opcionais (Railway / Docker) quando não há acesso shell à base:
#   PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT — qualquer valor não vazio: DROP SCHEMA public CASCADE e recriação
#     antes do migrate deploy. Apaga todos os dados; use uma vez com Postgres novo ou para recomeçar.
#   PRISMA_RESOLVE_ROLLED_BACK — nome da pasta da migração (ex.: 20260418130000_contract_amendments)
#     Use se a migração falhou e a BD ficou sem alterações (ou já reverteste o DDL manualmente).
#   PRISMA_RESOLVE_APPLIED — mesmo formato
#     Use se o DDL da migração já está aplicado mas o Prisma ficou marcado como falhado.
#
# Defina só uma por vez; depois de um deploy bem-sucedido, remova a variável e volte a fazer deploy.

set -e
SCHEMA="apps/backend/prisma/schema.prisma"

if [ -n "$PRISMA_FRESH_PUBLIC_SCHEMA_ON_BOOT" ]; then
  echo "prisma db execute: DROP SCHEMA public CASCADE (reinício total da BD)"
  printf '%s\n' \
    'DROP SCHEMA IF EXISTS public CASCADE;' \
    'CREATE SCHEMA public;' \
    'GRANT ALL ON SCHEMA public TO PUBLIC;' \
    | npx prisma db execute --stdin --schema "$SCHEMA"
fi

if [ -n "$PRISMA_RESOLVE_ROLLED_BACK" ]; then
  echo "prisma migrate resolve --rolled-back $PRISMA_RESOLVE_ROLLED_BACK"
  npx prisma migrate resolve --rolled-back "$PRISMA_RESOLVE_ROLLED_BACK" --schema "$SCHEMA"
fi

if [ -n "$PRISMA_RESOLVE_APPLIED" ]; then
  echo "prisma migrate resolve --applied $PRISMA_RESOLVE_APPLIED"
  npx prisma migrate resolve --applied "$PRISMA_RESOLVE_APPLIED" --schema "$SCHEMA"
fi

npx prisma migrate deploy --schema "$SCHEMA"
cd apps/frontend && exec npm run start
