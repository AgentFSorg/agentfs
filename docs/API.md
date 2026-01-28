# AgentFS API (v1)

**Last updated:** 2026-01-28 (Europe/Dublin)

Base URL (dev): `http://localhost:8787`

---

## Auth

All requests require:
- `Authorization: Bearer <api_key>`

MVP scopes:
- `memory:read`
- `memory:write`
- `search:read`
- `admin` (key management; may be internal initially)

---

## Conventions

### Idempotency
For write operations, clients MAY send:
- `Idempotency-Key: <uuid>`

Server stores `(tenant_id, key, request_hash)` for 24h and returns the same response on retry.

**Notes (MVP constraints):**
- Server validates `Idempotency-Key` as an ASCII token (`[a-zA-Z0-9_-]`) with max length 128.
- Reusing the same key with a different request body returns `422 IDEMPOTENCY_KEY_MISMATCH`.

### Errors
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "request_id": "req_..."
  }
}
```

---

## Endpoints

## Limits (MVP defaults)
- `POST /v1/history`: `limit` max 100
- `POST /v1/list`: returns up to 500 items
- `POST /v1/glob`: returns up to 500 paths
- `POST /v1/search`: `limit` max 50, `query` max 2000 chars

### POST /v1/put
Store a value at a path (creates a new version).

Request:
```json
{
  "agent_id": "default",
  "path": "/user/preferences/tone",
  "value": { "tone": "direct" },
  "ttl_seconds": 604800,
  "tags": ["user", "preferences"],
  "importance": 0.5,
  "searchable": true
}
```

Response:
```json
{
  "ok": true,
  "version_id": "ver_...",
  "created_at": "2026-01-27T00:00:00Z"
}
```

### POST /v1/get
```json
{ "agent_id": "default", "path": "/user/preferences/tone" }
```

### POST /v1/delete
```json
{ "agent_id": "default", "path": "/user/preferences/tone" }
```

### POST /v1/list
```json
{ "agent_id": "default", "prefix": "/user/preferences" }
```

### POST /v1/glob
```json
{ "agent_id": "default", "pattern": "/user/**" }
```

**Glob semantics (current implementation)**

Glob is implemented as a safe SQL `LIKE` translation (approximate):
- `*` → `%` (may match `/`)
- `**` → `%`
- `?` → `_`

If you need strict “segment-aware” semantics (`*` does not cross `/`), treat this endpoint as “glob-like pattern match” for now.

### POST /v1/history
```json
{ "agent_id": "default", "path": "/user/preferences/tone", "limit": 20 }
```

### POST /v1/search
```json
{
  "agent_id": "default",
  "query": "What tone does the user prefer?",
  "limit": 10,
  "path_prefix": "/user",
  "tags_any": ["preferences"]
}
```

---

## Health & metrics
- `GET /healthz`
- `GET /metrics`

**Metrics gating (recommended for production)**
- In production, metrics are disabled unless `ENABLE_METRICS=true`.
- If `ENABLE_METRICS=true` in production, `GET /metrics` requires `Authorization: Bearer <METRICS_TOKEN>`.
