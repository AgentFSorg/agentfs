# AgentFS Context & Positioning

**Last updated:** 2026-01-28 (Europe/Dublin)

Agent memory is an active market. AgentFS can win by shipping a reliable, deterministic core with filesystem semantics and cost controls.

---

## Landscape (examples)
- Mem0 (memory layer)
- Zep + Graphiti (context engineering / temporal graph memory)
- Letta / MemGPT (agent memory concepts + frameworks)
- LangGraph persistence/checkpointers
- LlamaIndex memory modules

---

## Differentiators to lean into
1) Filesystem semantics: paths + list/glob + version history + TTL  
2) Deterministic context assembly (bounded + explainable)  
3) Cost controls: opt-in embedding + quotas + dedupe

## MVP discipline (what we optimized for)
- Secure-by-default ops: pre-auth throttling on `/v1/*`, metrics gated in production, upstream error redaction
- Repeatable builds: `pnpm verify` + migrations tracked via `schema_migrations`

## Final hardening decisions (v1.0)
- `TRUST_PROXY` is an explicit deploy-time knob; default is `false` (direct-to-node).
- `/metrics` is disabled in production unless `ENABLE_METRICS=true`, and requires `METRICS_TOKEN` when enabled.
- Idempotency hashing uses canonical JSON to avoid key-order false mismatches.
