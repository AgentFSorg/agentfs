# AgentFS Testing & Quality Gates

**Last updated:** 2026-01-27 (Europe/Dublin)

---

## Test types

### Unit tests
- Path normalization
- Glob translation
- Quota math
- Idempotency hashing

### Integration tests (Postgres)
- CRUD + latest pointer correctness
- Version history correctness
- TTL behavior (expired hidden)
- Tenant isolation
- Search basic behavior (if embeddings mocked)

### Contract tests (SDK ↔ API)
- SDK calls correct endpoints
- Error mapping consistency

---

## CI gates (required)
On every PR:
1. Lint
2. Typecheck
3. Unit tests
4. Integration tests with fresh DB (migrations included)
