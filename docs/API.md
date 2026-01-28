# AgentFS API (v1)

**Last updated:** 2026-01-27 (Europe/Dublin)

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
