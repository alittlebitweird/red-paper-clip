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

## Policy Guard API
- `POST /outbound/actions` (roles: `admin`, `operator`)
- Evaluates platform/action against `policy_rules`
- Blocks disallowed actions with `policyCode` and logs policy decisions

## Offer Workflow API
- `POST /offers/draft` (roles: `admin`, `operator`)
- `POST /offers/:offerId/approve` (roles: `admin`, `reviewer`)
- `POST /offers/:offerId/reject` (roles: `admin`, `reviewer`)
- `POST /offers/:offerId/send` (roles: `admin`, `operator`)
- `GET /offers/:offerId` (roles: `admin`, `operator`, `reviewer`)

## Task Execution API
- `POST /tasks` (roles: `admin`, `operator`)
- Dispatches `inspect/pickup/meet/ship` through provider adapter (`rentahuman_stub`)
- `POST /tasks/webhook/provider` updates task status from provider callbacks (`x-webhook-token`)
- `POST /tasks/:taskId/evidence` stores proof metadata with checksum and capture timestamp
- `GET /tasks/:taskId/evidence` retrieves evidence by task

## Portfolio State API
- `POST /portfolio/positions` creates a seeded portfolio position
- `POST /portfolio/positions/:positionId/transition` enforces allowed state transitions
- `GET /portfolio/positions/:positionId` fetches current position state

## Verification Checklist API
- `POST /portfolio/positions/:positionId/verification-checklist` runs required checks
- Position must be in `accepted_pending_verification`
- Passing checks move to `verified`; failed checks move to `failed` or `disputed`
- `GET /portfolio/positions/:positionId/verification-checklist` lists checklist history

## Dashboard KPI API
- `GET /dashboard/kpi` returns live metrics and latest snapshot
- `POST /dashboard/kpi/snapshot` persists a KPI snapshot
- `GET /dashboard/kpi/snapshots` returns historical snapshots

## Daily Snapshot Job
- Worker can auto-create daily snapshots when `AUTO_SNAPSHOT_ENABLED=true`
- Requires `SNAPSHOT_API_KEY` with `admin` or `operator` role access
