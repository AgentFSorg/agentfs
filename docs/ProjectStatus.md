# Project Status

**Date:** 2026-01-28 (Europe/Dublin)

## Summary
- **Phase:** 4 (v1.0 Stabilization) - Complete
- **Overall:** Green
- **Top risk:** In-memory rate limiting (pre-auth + per-tenant) is per-process; multi-instance deployments need a shared limiter or gateway-level limiting
- **Version:** v1.0.0

## Shipped (Phase 0)
- [x] Docker Compose with pgvector
- [x] Database migrations (tracked via `schema_migrations`)
- [x] Tenant seeding
- [x] API key generation
- [x] API server with /healthz and gated /metrics
- [x] Git repository initialized
- [x] CI workflow created

## Shipped (Phase 1)
- [x] All CRUD routes verified working (PUT/GET/DELETE/LIST/GLOB/HISTORY)
- [x] Integration tests for memory routes (17 tests)
- [x] Glob unit tests (14 tests)
- [x] TTL behavior tests
- [x] Tenant isolation tests

## Shipped (Phase 2)
- [x] Embedding worker scaffolded (loop.ts, openai.ts)
- [x] Real /v1/search endpoint with pgvector similarity
- [x] Embedding quota tracking (incEmbedQuota, checkEmbedQuota)
- [x] Metrics for embedding jobs and quota denials

## Shipped (Phase 3)
- [x] TypeScript SDK with full types and idempotency support
- [x] Idempotency keys for PUT/DELETE operations
- [x] Rate limiting (in-memory sliding window)
- [x] SDK contract tests (7 tests)

## Ops/Quality
- [x] `pnpm verify` (build + lint + tests + smoke)
- [x] Pre-auth throttling for `/v1/*` (IP-based, in-memory)

## Shipped (Phase 4)
- [x] Backup/restore runbook (OPERATIONS.md)
- [x] Security checklist verification (Security.md)
- [x] Documentation pass (DOCS_INDEX.md updated)
- [x] Tag v1.0.0

## Future Roadmap
- [ ] Redis-based rate limiting for horizontal scaling
- [ ] Key rotation mechanism
- [ ] Webhook notifications
- [ ] Multi-region deployment guide

## Metrics
- Requests/day: N/A (not deployed)
- p95 latency: N/A
- DB size: ~0 (dev only)
- Embedding tokens/day: N/A
- Quota denials/day: N/A
- Error rate: N/A

## Blockers
None

## Notes
- API server needs to be started from `packages/api` directory or use `pnpm dev:api`
- argon2 version updated from non-existent 0.32.3 to 0.41.1
- env.ts fixed to find .env from workspace root
- Quota env vars split into clear units (`WRITE_QUOTA_PER_DAY`, `SEARCH_QUOTA_PER_DAY`, etc.)
