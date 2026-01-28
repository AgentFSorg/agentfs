# AgentFS Data Model (MVP)

**Last updated:** 2026-01-27 (Europe/Dublin)

Postgres is the source of truth. We use pgvector for embeddings in MVP.

---

## Tables (conceptual)

### tenants
- `id` (pk)
- `name`
- `created_at`

### api_keys
- `id` (pk) — public id (e.g. `agfs_live_...`)
- `tenant_id` (fk)
- `secret_hash` (bcrypt/argon2)
- `label`
- `scopes_json`
- `created_at`
- `revoked_at`

### agents
- `(tenant_id, agent_id)` unique
- `created_at`

### entry_versions (append-only)
- `id` (pk)
- `tenant_id`
- `agent_id`
- `path`
- `value_json` (jsonb)
- `tags_json` (jsonb)
- `importance` (float)
- `searchable` (bool)
- `content_hash` (text)
- `created_at`
- `expires_at` (nullable)
- `deleted_at` (nullable)

Indexes:
- `(tenant_id, agent_id, path, created_at desc)`
- `(tenant_id, agent_id, expires_at)`

### entries (latest pointer)
- `tenant_id`
- `agent_id`
- `path`
- `latest_version_id`
Unique:
- `(tenant_id, agent_id, path)`

### embeddings
- `version_id` (pk, fk to entry_versions.id)
- `tenant_id`
- `agent_id`
- `path`
- `model` (text)
- `embedding` (vector)
- `created_at`

### idempotency_keys
- `tenant_id`
- `key`
- `request_hash`
- `response_json`
- `created_at`
- `expires_at`
Unique:
- `(tenant_id, key)`

---

## Migration strategy
- Forward-only migrations.
- CI runs migrations against a fresh DB on every PR.
