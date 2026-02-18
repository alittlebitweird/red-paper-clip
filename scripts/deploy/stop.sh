#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.prod.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[stop] missing ${ENV_FILE}" >&2
  exit 1
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down

echo "[stop] deployment stack stopped"
