# Verify Fresh Setup (Clone → Green)

**Last updated:** 2026-01-28

This is the shortest repeatable path to prove a fresh clone works end-to-end.

## Prereqs
- Node.js (LTS recommended)
- pnpm
- Docker + Docker Compose

## Steps

1) Install deps
```bash
pnpm install
```

2) Configure env
```bash
cp .env.example .env
```

3) Start Postgres
```bash
pnpm db:up
```

4) Migrate + seed
```bash
pnpm db:migrate
pnpm db:seed
```

5) Verify (build + lint + test + smoke)
```bash
pnpm verify
```

## Manual boot (optional)

API:
```bash
pnpm dev:api
curl -sS http://localhost:8787/healthz
```

Worker:
```bash
pnpm dev:worker
```

## Notes
- `pnpm smoke` starts the API with `NODE_ENV=production` and verifies `/healthz` plus `/metrics` auth behavior.
- Metrics exposure is controlled via `ENABLE_METRICS` + `METRICS_TOKEN` (see `.env.example`).

