# red-paper-clip

Open Claw Bot monorepo for the red paper clip challenge.

## Apps
- `apps/api`: Fastify API service
- `apps/web`: lightweight ops console server
- `apps/worker`: background worker heartbeat process

## Prerequisites
- Node.js 22+
- npm 10+

## Setup
```bash
npm install
cp .env.example .env
```

## One-command local start
```bash
npm run dev
```

This starts:
- Web on `WEB_PORT` (default `3000`)
- API on `API_PORT` (default `3001`)
- Worker heartbeat loop (`WORKER_HEARTBEAT_MS`)

For auth-enabled API routes, ensure `DATABASE_URL` is configured and seed users are loaded.

The web console supports manual opportunity intake and review against the API.

## Validation commands
```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

## Database commands
```bash
npm run db:migrate:up -w @rpc/db
npm run db:seed -w @rpc/db
```

To roll back one migration:
```bash
npm run db:migrate:down -w @rpc/db
```

## Default seeded API keys
- `ADMIN_API_KEY` (default `dev-admin-key`)
- `OPERATOR_API_KEY` (default `dev-operator-key`)
- `REVIEWER_API_KEY` (default `dev-reviewer-key`)

## Opportunity API
- `POST /opportunities` (roles: `admin`, `operator`)
- `GET /opportunities` (roles: `admin`, `operator`, `reviewer`)

## Valuation API
- `POST /valuations` (roles: `admin`, `operator`)
- Computes `estimatedValueUsd` + `confidenceScore` using `rules-v1`
- Persists a versioned record in `item_valuations`

## Scoring API
- `POST /scoring/rank` (roles: `admin`, `operator`)
- Ranks current opportunities using weighted trade-score formula
