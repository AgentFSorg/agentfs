# AgentFS Architecture

**Last updated:** 2026-01-27 (Europe/Dublin)

AgentFS is a multi-tenant memory service designed around **filesystem semantics** and **cost-safe retrieval**.

---

## 1) High-level components

```
Client/Agent (SDK)  ->  HTTP API  ->  Postgres (source of truth)
                         |   |
                         |   +-> Embedding Worker (async)
                         |
                         +-> /metrics (Prometheus)
```

### Components
- **HTTP API**: validates requests, authenticates, reads/writes Postgres.
- **Postgres**: canonical storage for entries + versions + metadata.
- **pgvector**: vector index stored in Postgres (MVP simplification).
- **Embedding Worker**: processes an internal queue to create/update embeddings.

---

## 2) Tenancy model (hard invariant)

Every row is scoped by:
- `tenant_id` (top-level account boundary)
- `agent_id` (logical application/agent boundary)
- `path` (filesystem-like key)

**Invariant:** No query executes without `tenant_id` in the WHERE clause.

---

## 3) Paths and namespaces

Paths are UTF-8 strings with POSIX-like rules:
- Must start with `/`
- Segments separated by `/`
- No empty segments (except root `/`)
- Normalize consecutive slashes into one
- Reserved prefixes: `/sys/*` for internal bookkeeping (not writable by default)

Examples:
- `/user/preferences/tone`
- `/project/status`
- `/agent/session/current`

---

## 4) Storage model: entries + versions

AgentFS is **append-only for writes**.

- `entry_versions` stores the immutable facts:
  - `value_json` (JSON)
  - `created_at`
  - `expires_at` (TTL)
  - `deleted_at` (tombstone)
  - `tags_json`, `importance`, `searchable`, `content_hash`

- `entries` is an optional denormalized “latest pointer”:
  - `(tenant_id, agent_id, path)` unique
  - `latest_version_id`

**Read semantics**
- `get(path)` returns the latest version where:
  - `deleted_at IS NULL`
  - `expires_at IS NULL OR expires_at > now()`

---

## 5) TTL semantics (MVP)

TTL is “best effort” but deterministic:
- Expired entries MUST behave as “not found” on reads.
- A sweeper deletes/archives expired versions asynchronously.

**No guarantee** about when physical deletion happens.

---

## 6) Glob and list semantics

- `list(prefix)` returns direct children under a prefix.
- `glob(pattern)` supports:
  - `*` within a segment
  - `**` across segments
  - `?` single character within segment

Glob is implemented using a safe translation to SQL patterns (with escape rules).

---

## 7) Semantic search (MVP)

Search is opt-in to protect cost and privacy.

### Indexing policy
Each version may be embedded if:
- `searchable=true` OR
- path matches a tenant’s allowlisted prefixes (config), AND
- within quota.

### Query
- Embed query string
- Vector similarity search on `(tenant_id, agent_id)` with optional filters.

---

## 8) Quotas & cost controls (core requirement)

AgentFS MUST support per-tenant quotas:
- writes/day
- stored bytes
- embedding tokens/day
- search queries/minute

Embeddings are deduped via `content_hash` to avoid re-embedding identical payloads.

---

## 9) Observability (MVP)

Expose `/metrics` with at minimum:
- request counts/latency
- auth failures
- DB error counts
- embedding jobs (queued/succeeded/failed)
- quota denials

---

## 10) Deferments

Explicitly out of scope for MVP:
- WebSockets/subscriptions
- Cross-tenant sharing + ACLs
- Solana/on-chain ownership
- Workspace indexing (AST/LSP)
