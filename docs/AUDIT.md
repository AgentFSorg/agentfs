# AgentFS Scope Audit & Risk Register (v2)

**Last updated:** 2026-01-27 (Europe/Dublin)

## MVP scope (locked)
Includes: filesystem semantics, versioning, TTL, opt-in semantic search, SDK, metrics.  
Excludes: websockets, sharing/ACLs, Solana, deep workspace indexing.

## Critical risks
- Multi-tenant isolation bugs -> enforce tenant predicates + tests
- Embedding cost blowups -> quotas + opt-in + dedupe
- Data model churn -> lock DataModel.md + migrations in CI
