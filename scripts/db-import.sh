#!/usr/bin/env bash
# Importa dump para PostgreSQL Coolify (ou destino). Uso: ./scripts/db-import.sh backups/gti-....dump
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <ficheiro.dump|.sql|.sql.gz>" >&2
  exit 1
fi

FILE="$1"
TARGET_URL="${COOLIFY_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$TARGET_URL" ]; then
  echo "Defina COOLIFY_DATABASE_URL ou DATABASE_URL (destino)." >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Ficheiro não encontrado: $FILE" >&2
  exit 1
fi

ABS_DIR="$(cd "$(dirname "$FILE")" && pwd)"
BASE="$(basename "$FILE")"

pg_restore_local() {
  pg_restore --no-owner --no-acl --clean --if-exists -d "$TARGET_URL" "$FILE"
}

psql_file_local() {
  psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f "$1"
}

case "$FILE" in
  *.dump)
    echo "A importar (pg_restore) $FILE …"
    if command -v pg_restore >/dev/null 2>&1; then
      pg_restore_local
    elif command -v docker >/dev/null 2>&1; then
      docker run --rm -e TARGET_URL -v "$ABS_DIR:/backups:ro" postgres:18-alpine \
        sh -c 'pg_restore --no-owner --no-acl --clean --if-exists -d "$TARGET_URL" "/backups/'"$BASE"'"'
    else
      echo "Instale postgresql-client ou Docker." >&2
      exit 1
    fi
    ;;
  *.sql.gz)
    echo "A importar (gzip + psql) $FILE …"
    if command -v psql >/dev/null 2>&1; then
      gunzip -c "$FILE" | psql "$TARGET_URL" -v ON_ERROR_STOP=1
    elif command -v docker >/dev/null 2>&1; then
      gunzip -c "$FILE" | docker run --rm -i -e TARGET_URL postgres:18-alpine \
        sh -c 'psql "$TARGET_URL" -v ON_ERROR_STOP=1'
    else
      echo "Instale postgresql-client ou Docker." >&2
      exit 1
    fi
    ;;
  *.sql)
    echo "A importar (psql) $FILE …"
    if command -v psql >/dev/null 2>&1; then
      psql_file_local "$FILE"
    elif command -v docker >/dev/null 2>&1; then
      docker run --rm -e TARGET_URL -v "$ABS_DIR:/backups:ro" postgres:18-alpine \
        sh -c 'psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f "/backups/'"$BASE"'"'
    else
      echo "Instale postgresql-client ou Docker." >&2
      exit 1
    fi
    ;;
  *)
    echo "Extensão não suportada (use .dump, .sql ou .sql.gz)." >&2
    exit 1
    ;;
esac

echo "Import concluído. Valide: psql \"\$COOLIFY_DATABASE_URL\" -c 'SELECT COUNT(*) FROM \"User\";'"
exit 0
