#!/usr/bin/env bash
# Exporta a base actual para migration/gti-railway.dump (versionado no Git para migração Coolify).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/migration/gti-railway.dump"
SOURCE_URL="${RAILWAY_DATABASE_URL:-${DATABASE_URL:-}}"

if [ -z "$SOURCE_URL" ]; then
  echo "Defina DATABASE_URL ou RAILWAY_DATABASE_URL." >&2
  exit 1
fi

mkdir -p "$ROOT/migration"

dump_with() {
  pg_dump "$SOURCE_URL" --no-owner --no-acl --format=custom --file="$OUT"
}

if command -v pg_dump >/dev/null 2>&1; then
  echo "A exportar para $OUT …"
  dump_with
else
  echo "pg_dump local não encontrado; a usar postgres:16-alpine …"
  docker run --rm -e SOURCE_URL -v "$ROOT/migration:/migration" postgres:16-alpine \
    sh -c 'pg_dump "$SOURCE_URL" --no-owner --no-acl --format=custom --file="/migration/gti-railway.dump"'
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "OK: $OUT ($SIZE)"
if [ "$(du -k "$OUT" | cut -f1)" -gt 51200 ] 2>/dev/null; then
  echo "AVISO: dump > 50 MB — considere Git LFS ou fluxo backups/ local (ver migration/README.md)." >&2
fi
