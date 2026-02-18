# Deployment Runbook

Project codename: kilo-mcclain-clawdbot

## Scope
This runbook deploys the platform stack only:
- Postgres
- API
- Web console
- Worker

It does not kick off trade discovery or create outbound trading actions.

## Files
- `deploy/docker-compose.prod.yml`
- `deploy/Dockerfile`
- `.env.production.example`
- `scripts/deploy/preflight.sh`
- `scripts/deploy/deploy.sh`
- `scripts/deploy/stop.sh`

## Pre-deploy checklist
1. `cp .env.production.example .env.production`
2. Set real secrets in `.env.production`
3. Confirm `DATABASE_URL` uses compose hostname `postgres`
4. Run `npm run deploy:preflight`

## Deploy command
```bash
npm run deploy:start
```

What it does:
1. Validates deploy env and compose config.
2. Builds application image.
3. Starts Postgres.
4. Runs DB migrations and seed.
5. Starts API, Web, and Worker.
6. Waits for API health endpoint.

## Verify deployment
1. API health: `curl -fsS http://localhost:3001/health`
2. Web console: open `http://localhost:3000`
3. Policy rules: `curl -H "x-api-key: <reviewer-key>" http://localhost:3001/admin/policy-rules`

## Stop deployment
```bash
npm run deploy:stop
```

## Tomorrow go-ahead
When you are ready, the command to execute deployment is:
```bash
npm run deploy:start
```
