#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.prod.yml"

"${ROOT_DIR}/scripts/deploy/preflight.sh"

if ! command -v curl >/dev/null 2>&1; then
  echo "[deploy] curl is required for post-deploy health checks" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

echo "[deploy] building service image"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build

echo "[deploy] starting postgres"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres

echo "[deploy] applying migrations and seed data"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" run --rm migrate

echo "[deploy] starting api, web, and worker"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d api web worker

echo "[deploy] waiting for API health endpoint"
for attempt in $(seq 1 30); do
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    echo "[deploy] api is healthy"
    break
  fi
  sleep 2
  if [[ "${attempt}" -eq 30 ]]; then
    echo "[deploy] api health check did not pass in time" >&2
    exit 1
  fi
done

echo "[deploy] deployment completed"
