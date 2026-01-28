# AgentFS Build Plan (MVP-first)

**Last updated:** 2026-01-27 (Europe/Dublin)

## Operating rules (non-negotiable)
After each phase:
1) run tests, 2) update docs, 3) commit to GitHub, then proceed.

## Timeline
- MVP to hosted: ~6–7 weeks
- Stabilization to v1.0: +2 weeks

---

## Phase 0 — Foundations (Week 1)
**DoD:** local Postgres boots, migrations run, CI green.

## Phase 1 — Core storage (Weeks 2–3)
**DoD:** CRUD + list/glob + version history + TTL semantics, integration tests.

## Phase 2 — Search + cost controls (Weeks 4–5)
**DoD:** async embeddings, pgvector search, quotas, metrics.

## Phase 3 — SDK + hardening (Weeks 6–7)
**DoD:** TS SDK + contract tests, idempotency keys, rate limiting, deploy runbooks.

## Phase 4 — v1.0 stabilization (Weeks 8–9)
**DoD:** backup/restore runbook + restore drill, security checklist, docs pass, tag v1.0.0.

---

## Post-MVP roadmap
- v1.1 changes feed (polling)
- v1.2 ACLs/sharing (off-chain)
- v1.3 consider Qdrant migration (if needed)
- v2 Solana/on-chain (only if wedge proven)
