# Project Status

**Date:** 2026-01-28 (Europe/Dublin)

## Summary
- **Phase:** 3 (SDK + Hardening) - Complete
- **Overall:** Green
- **Top risk:** None currently

## Shipped (Phase 0)
- [x] Docker Compose with pgvector
- [x] Database migrations
- [x] Tenant seeding
- [x] API key generation
- [x] API server with /healthz and /metrics
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

## Next Up (Phase 4)
- [ ] Backup/restore runbook
- [ ] Security checklist verification
- [ ] Documentation pass
- [ ] Tag v1.0.0

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
