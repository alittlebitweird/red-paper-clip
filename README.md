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

## Validation commands
```bash
npm run lint
npm run test
npm run typecheck
npm run build
```
