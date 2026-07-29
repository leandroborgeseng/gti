#!/usr/bin/env bash
# Exporta PostgreSQL (Railway ou qualquer origem) para backups/ — NÃO versionar o resultado.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

SOURCE_URL="${RAILWAY_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$SOURCE_URL" ]; then
  echo "Defina RAILWAY_DATABASE_URL ou DATABASE_URL (origem)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if command -v pg_dump >/dev/null 2>&1; then
  OUT="$BACKUP_DIR/gti-${STAMP}.dump"
  echo "A exportar (formato custom) para $OUT …"
  pg_dump "$SOURCE_URL" --no-owner --no-acl --format=custom --file="$OUT"
  echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  OUT="$BACKUP_DIR/gti-${STAMP}.dump"
  echo "pg_dump local não encontrado; a usar imagem postgres:18-alpine …"
  docker run --rm -e SOURCE_URL -v "$BACKUP_DIR:/backups" postgres:18-alpine \
    sh -c 'pg_dump "$SOURCE_URL" --no-owner --no-acl --format=custom --file="/backups/gti-'"${STAMP}"'.dump"'
  echo "OK: $OUT"
  exit 0
fi

echo "Instale postgresql-client (pg_dump) ou Docker." >&2
exit 1
