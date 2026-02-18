#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.prod.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "[preflight] docker is required but not found" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[preflight] docker compose plugin is required" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[preflight] missing ${ENV_FILE}" >&2
  echo "Create it from .env.production.example before deploy." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  DATABASE_URL
  ADMIN_API_KEY
  OPERATOR_API_KEY
  REVIEWER_API_KEY
  PROVIDER_WEBHOOK_TOKEN
  SNAPSHOT_API_KEY
  WEB_API_BASE_URL
)

missing=()
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing+=("${var_name}")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "[preflight] missing required env vars in .env.production:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

if [[ "${DATABASE_URL}" != postgres://* && "${DATABASE_URL}" != postgresql://* ]]; then
  echo "[preflight] DATABASE_URL must be a postgres connection string" >&2
  exit 1
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config >/dev/null

echo "[preflight] deploy configuration is valid"
