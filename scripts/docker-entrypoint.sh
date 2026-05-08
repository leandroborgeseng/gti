#!/bin/sh
# Arranque da imagem: migrações Prisma e Next.
#
# O script Node `prisma-entry-preflight.cjs` roda primeiro (ver cabeçalho desse arquivo).
#
# Variáveis opcionais adicionais:
#   PRISMA_RESOLVE_ROLLED_BACK — nome da pasta da migração
#   PRISMA_RESOLVE_APPLIED — nome da pasta da migração
#   RUN_SEED_OUTSOURCED=1 — roda o seed dos contratos «sistemas terceirizados» no arranque
#   SKIP_SEED_OUTSOURCED=0 — compatibilidade: também força o seed no arranque
#
# Depois de recuperação com sucesso, remove variáveis de um uso único e volta a fazer deploy.
#
# Permissões em volume de anexos: com disco montado em `uploads`, o ponto de montagem costuma ser root.
# Uma passagem como root (mkdir + chown) deixa o diretório gravável pelo utilizador `node` antes do Prisma/Next.
# Na Railway com volume persistente muitos contentores iniciam como não-root; defina na app **`RAILWAY_RUN_UID=0`**
# para este script poder fazer «chown»/«chmod» no disco antes de descer para o utilizador `node`. Sem isso, o volume costuma ficar só com permissões de root e surgem erros `EACCES` ao criar subpastas (ex.: `project-tasks`).
# (o script exporta `UPLOAD_ROOT` a partir dele quando a variável não veio definida).

set -e
SCHEMA="apps/backend/prisma/schema.prisma"

# Caminho efectivo onde a app espera gravar anexos (tem de coincidir com StorageService).
uploads_dir_resolved() {
  if [ -n "${UPLOAD_ROOT:-}" ]; then
    printf "%s" "$UPLOAD_ROOT"
  elif [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
    printf "%s" "$RAILWAY_VOLUME_MOUNT_PATH"
  else
    printf "%s" "/app/apps/frontend/uploads"
  fi
}

warn_unwritable_uploads_diagnostic() {
  up="$1"
  echo "[gti-contratos] ERRO: sem permissão de escrita em \"${up}\" (uid=$(id -u) user=$(id -un))." >&2
  echo "[gti-contratos] Com volume Railway, defina na app a variável RAILWAY_RUN_UID=0 para o runtime arrancar como root," >&2
  echo "[gti-contratos] permitindo ao entrypoint ajustar dono/permissões do disco antes do processo Next (utilizador node)." >&2
}

if [ "$(id -u)" != "0" ]; then
  if [ -z "${UPLOAD_ROOT:-}" ] && [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
    export UPLOAD_ROOT="$RAILWAY_VOLUME_MOUNT_PATH"
  fi
  UPLOADS_PREVIEW="$(uploads_dir_resolved)"
  case "$UPLOADS_PREVIEW" in /*) ;; *)
    UPLOADS_PREVIEW="/app/apps/frontend/uploads"
    ;;
  esac
  if [ ! -w "$UPLOADS_PREVIEW" ] 2>/dev/null; then
    if touch "$UPLOADS_PREVIEW/.gti-write-test" 2>/dev/null; then
      rm -f "$UPLOADS_PREVIEW/.gti-write-test"
    elif [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ] || [ -n "${RAILWAY_PROJECT_ID:-}" ]; then
      warn_unwritable_uploads_diagnostic "$UPLOADS_PREVIEW"
      exit 1
    fi
  fi
fi

if [ "$(id -u)" = "0" ]; then
  # UPLOAD_ROOT: variável usada pelo StorageService (Next). Se só existir disco Railway, a plataforma
  # injeta `RAILWAY_VOLUME_MOUNT_PATH` — exportamos o mesmo valor para a app gravar no volume.
  if [ -n "${UPLOAD_ROOT:-}" ]; then
    UPLOADS_DIR="$UPLOAD_ROOT"
  elif [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
    export UPLOAD_ROOT="$RAILWAY_VOLUME_MOUNT_PATH"
    UPLOADS_DIR="$RAILWAY_VOLUME_MOUNT_PATH"
  else
    UPLOADS_DIR="/app/apps/frontend/uploads"
  fi
  case "$UPLOADS_DIR" in
    /*) ;;
    *)
      echo "[gti-contratos] No Docker, defina UPLOAD_ROOT como caminho absoluto (recebido: $UPLOADS_DIR)." >&2
      exit 1
      ;;
  esac
  mkdir -p "$UPLOADS_DIR"
  chown -R node:node "$UPLOADS_DIR" 2>/dev/null || true
  # Em alguns contentores Railway o arranque não é UID 0; `RAILWAY_RUN_UID=0` na app activa root no entrypoint acima.
  # Se `chown` for ignorado pelo driver do disco, modo permissivo no volume de anexos evita `EACCES` ao criar subpastas (`project-tasks`, etc.).
  chmod -R a+rwX "$UPLOADS_DIR"
  exec runuser -u node -- "$0" "$@"
fi

# Diagnóstico: se nos Deploy Logs não aparecer esta linha, o contêiner não é a imagem deste repositório (ou há outro processo a logar por cima).
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

# Contratos de referência «Sistemas terceirizados atuais» (ST-2026-001…009). Idempotente, mas
# ainda abre ligação à banco de dados e executa consultas; por isso fica opt-in no arranque de produção.
if [ "${RUN_SEED_OUTSOURCED:-0}" = "1" ] || [ "${SKIP_SEED_OUTSOURCED:-1}" = "0" ]; then
  echo "[gti-contratos] prisma:seed:outsourced (idempotente)…"
  npm run prisma:seed:outsourced
else
  echo "[gti-contratos] seed terceirizados omitido (defina RUN_SEED_OUTSOURCED=1 para executar)"
fi

cd apps/frontend && exec npm run start
