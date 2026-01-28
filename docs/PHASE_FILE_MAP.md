# PHASE_FILE_MAP

**Last updated:** 2026-01-27 (Europe/Dublin)


Maps files/folders to phases in `docs/Buildplan.md`.

---

## Phase 0 — Foundations
Code:
- `docker-compose.yml`, `.env.example`, workspace configs
- `packages/shared/src/db/migrations/*`
- `packages/shared/src/db/migrate.ts`, `seed.ts`
- `packages/api/src/index.ts` (health + metrics ok)

Docs:
- `docs/Buildplan.md`, `docs/Architecture.md`, `docs/DataModel.md`, `docs/SERVICES.md`, `docs/Testing.md`, `docs/Security.md`
- `docs/OVERVIEW.md`, `docs/DOCS_INDEX.md`, `docs/DecisionLog.md`, `docs/AUDIT.md`

---

## Phase 1 — Core storage
Code:
- `packages/shared/src/path.ts`, `glob.ts`
- `packages/api/src/auth.ts`
- `packages/api/src/routes/memory.ts` (put/get/delete/history/list/glob)

Docs:
- `docs/API.md`, `docs/FIXES.md`
- `docs/USERFLOW.md`, `docs/TELEGRAM_INTEGRATION.md`

---

## Phase 2 — Search + cost controls
Code:
- `packages/worker/*` (embedding worker)
- `packages/api/src/quotas.ts`
- implement real `/v1/search` vector query

Docs:
- update `docs/Architecture.md` + `docs/API.md` for search behavior

---

## Phase 3 — SDK + hardening
Code:
- `packages/sdk/*`
- add idempotency + rate limiting + contract tests

Docs:
- update `docs/Testing.md`
- add `docs/DEPLOYMENT.md` when hosting

---

## Phase 4 — v1.0 stabilization
Docs:
- add `docs/OPERATIONS.md` (backup/restore drill)
- final docs coherence pass
