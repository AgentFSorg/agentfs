# Learnings & Gotchas

This document captures setup issues, design decisions discovered during implementation, and lessons learned.

---

## Setup Gotchas

### 1. argon2 Version Mismatch
**Issue:** The scaffold had `argon2@^0.32.3` which doesn't exist. Latest is 0.44.0.
**Fix:** Updated to `^0.41.1` in `packages/shared/package.json`.

### 2. dotenv Not Finding .env from Subpackages
**Issue:** When running scripts from `packages/shared`, `dotenv/config` looks for `.env` in the current working directory, not the workspace root.
**Fix:** Updated `packages/shared/src/env.ts` to walk up directories and find `.env` file.

### 3. argon2 Missing in API Package
**Issue:** `packages/api/src/auth.ts` imports `argon2` directly, but it was only a dependency of `@agentfs/shared`.
**Fix:** Added `argon2` as a direct dependency in `packages/api/package.json`.

### 4. Top-Level Await in index.ts
**Issue:** Original `packages/api/src/index.ts` used top-level await for route registration, which can fail silently in some Node configurations.
**Fix:** Wrapped all initialization in an async `main()` function.

---

## Database Notes

### pgvector Image
Using `pgvector/pgvector:pg16` which includes:
- PostgreSQL 16
- pgvector extension pre-installed
- Just run `CREATE EXTENSION IF NOT EXISTS vector;` in migration

---

## Design Decisions Discovered

### Path Normalization
- Must start with `/`
- Collapse multiple slashes
- Reject `.` and `..` segments
- Max 512 chars, 64 segments

### Glob to SQL LIKE
- `*` -> `%` (within segment approximation)
- `**` -> `%` (across segments)
- `?` -> `_`
- Escape `%`, `_`, `\` in input

### Delete Semantics
Deletes are tombstones, not physical deletions. A delete creates a new version with `deleted_at` set.

---

## Future Considerations

- Consider adding HNSW index for embeddings once data volume grows
- Rate limiting is in-memory per process; multi-instance deployments will need a shared limiter (e.g., Redis) or a gateway-level limiter
- Idempotency keys are implemented for `PUT` and `DELETE` via `Idempotency-Key` and stored for 24h (`packages/api/src/idempotency.ts`)
- SDK contract tests run an in-process API server to keep `pnpm test` green without manual coordination (`packages/sdk/src/index.test.ts`)
- Migrations are tracked in `schema_migrations` and applied once (`packages/shared/src/db/migrate.ts`)
- Search quota and search rate limiting are split into separate env vars to avoid unit confusion (`WRITE_QUOTA_PER_DAY`, `SEARCH_QUOTA_PER_DAY`, `SEARCH_RATE_LIMIT_PER_MINUTE`)
- If you deploy behind a reverse proxy, configure `TRUST_PROXY` so `req.ip` reflects the real client IP (affects pre-auth throttling); see `docs/DEPLOYMENT.md`
- Idempotency hashing uses canonical JSON (sorted keys) to avoid false mismatches when clients send semantically equivalent objects with different key order
