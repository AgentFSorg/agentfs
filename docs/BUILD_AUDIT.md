# AgentFS Build Audit

**Date:** 2026-01-28  
**Audit baseline (pre-fix):** `12ca262` (phase4)  
**Fix range:** `a396971..99e3af9`

This report records the **exact commands run** and the pass/fail outcome to validate “fresh clone → green”.

---

## Environment Used

- Node.js: `v25.4.0`
- pnpm: `9.0.0`
- Docker: `29.1.3`
- Docker Compose: `v5.0.0-desktop.1`

> Note: docs commonly recommend Node 20 LTS; the build/test run here succeeded on Node 25.4.0.

---

## Commands Run (End-to-End)

### 1) Install dependencies

```bash
pnpm install
```

**Status:** PASS

### 2) Start database

```bash
pnpm db:up
```

**Status:** PASS

### 3) Run migrations (idempotent)

```bash
pnpm db:migrate
```

**Status:** PASS  
**Notes:** migrations are applied in lexical order by `packages/shared/src/db/migrate.ts` using idempotent SQL.

### 4) Seed default tenant

```bash
pnpm db:seed
```

**Status:** PASS

### 5) Create a dev key (optional)

```bash
pnpm create:key
```

**Status:** PASS  
**Notes:** prints the full API key to stdout (expected for bootstrap scripts).

### 6) Start API + verify health/metrics

```bash
pnpm --filter @agentfs/api exec tsx src/index.ts
curl -sS http://localhost:8787/healthz
curl -sS http://localhost:8787/metrics
```

**Status:** PASS

### 7) Lint

```bash
pnpm lint
```

**Status:** PASS

### 8) Tests

```bash
pnpm test
```

**Status:** PASS

**Notes (important):**
- SDK tests used to fail with `ECONNREFUSED` because they required a separately running API. This was fixed by running an in-process Fastify server during SDK tests (`test(sdk): run contract tests against in-process API`, commit `719b699`).
- Worker now has a job-claiming correctness test (`packages/worker/src/loop.test.ts`).

### 9) Dependency audit (optional)

```bash
pnpm audit --prod
```

**Status:** PASS (“No known vulnerabilities found”)

---

## Known Build/Run Friction (and Fixes)

1. **SDK contract tests required external API**  
   - **Fix:** `packages/sdk/src/index.test.ts` starts an in-process API server. (commit `719b699`)
2. **Rate-limit env var not documented in `.env.example`**  
   - **Fix:** added `RATE_LIMIT_REQUESTS_PER_MINUTE` to `.env.example`. (commit `a396971`)

