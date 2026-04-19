#!/bin/sh
# Arranca o Nest no mesmo processo que o Next quando não há BACKEND_API_BASE_URL
# (cenário típico Railway: um só serviço). Caso use o Nest noutro host, defina
# BACKEND_API_BASE_URL ou GTI_SKIP_NEST=1 (só Next; BACKEND obrigatório).
#
# Não use `exec` no Next: este script fica como PID 1 no Docker para receber
# SIGTERM e encerrar o Nest.

set -e

if [ "${GTI_SKIP_NEST:-}" = "1" ]; then
  echo "[start-web] GTI_SKIP_NEST=1 — apenas Next (BACKEND_API_BASE_URL deve apontar para o Nest remoto)."
  cd apps/frontend && exec npm run start
fi

if [ -n "${BACKEND_API_BASE_URL:-}" ]; then
  echo "[start-web] BACKEND_API_BASE_URL definido — Nest embutido não arranca."
  cd apps/frontend && exec npm run start
fi

NEST_PORT="${NEST_PORT:-4000}"
export NEST_PORT
export BACKEND_API_BASE_URL="http://127.0.0.1:${NEST_PORT}/api"
echo "[start-web] Nest embutido na porta ${NEST_PORT}; BACKEND_API_BASE_URL=${BACKEND_API_BASE_URL}"

cleanup() {
  if [ -n "${NEST_PID:-}" ]; then
    kill "$NEST_PID" 2>/dev/null || true
    wait "$NEST_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

(cd apps/backend && NODE_ENV=production PORT="$NEST_PORT" exec node dist/main.js) &
NEST_PID=$!

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! node "$ROOT/scripts/wait-nest-ready.cjs"; then
  echo "[start-web] Falha à espera do Nest (pid ${NEST_PID}). Ver Deploy Logs."
  exit 1
fi

echo "[start-web] Nest pronto (pid ${NEST_PID}); a iniciar Next…"
cd apps/frontend
npm run start
