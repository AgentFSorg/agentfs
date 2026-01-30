# AgentOS API Reference

Base URL: `https://agentos-api.fly.dev`

All endpoints use **POST** method. Auth via `Authorization: Bearer <API_KEY>` header.

## Endpoints

### PUT — Store a memory
```
POST /v1/put
{
  "agent_id": "my-agent",
  "path": "/memory/long-term",
  "value": "contents of the file...",
  "tags": ["memory", "curated"],
  "importance": 0.8,
  "searchable": true
}
```
Response: `{ "ok": true, "version_id": "uuid", "created_at": "ISO8601" }`

### GET — Retrieve a memory by path
```
POST /v1/get
{
  "agent_id": "my-agent",
  "path": "/memory/long-term"
}
```
Response: `{ "found": true, "path": "/memory/long-term", "value": "...", "version_id": "uuid", "created_at": "ISO8601", "tags": "[\"memory\",\"curated\"]" }`

Note: `tags` is returned as a JSON string, not an array. Parse it with `JSON.parse()`.

### SEARCH — Semantic search across memories
```
POST /v1/search
{
  "agent_id": "my-agent",
  "query": "solana trading strategy",
  "limit": 10
}
```
Response: `{ "results": [{ "path": "...", "value": "...", "similarity": 0.45, "tags": "[...]", ... }] }`

Note: Score field is `similarity` (0-1 range, higher = more relevant).

### DUMP — List all memories for an agent
```
POST /v1/dump
{
  "agent_id": "my-agent",
  "limit": 100
}
```
Response: `{ "entries": [{ "path": "...", "value": "...", "tags": "[...]", ... }] }`

Note: The array is under `entries`, not `memories`.

### AGENTS — List all agents
```
POST /v1/agents
{}
```
Response: `{ "agents": ["agent-1", "agent-2"] }`

## API Key Format
`agfs_xxx_yyy.zzz` — pass as Bearer token.

## Configuration
| Variable | Required | Default |
|---|---|---|
| AGENTOS_API_KEY | Yes | — |
| AGENTOS_AGENT_ID | No | From IDENTITY.md or "default" |
| AGENTOS_API_URL | No | https://agentos-api.fly.dev |

## File → Path Mapping
| Workspace File | AgentOS Path | Tags |
|---|---|---|
| SOUL.md | /identity/soul | identity, core |
| USER.md | /identity/user | identity, user |
| IDENTITY.md | /identity/meta | identity |
| MEMORY.md | /memory/long-term | memory, curated |
| CONTEXT.md | /memory/context | memory, context |
| AGENTS.md | /config/agents | config |
| TOOLS.md | /config/tools | config |
| HEARTBEAT.md | /config/heartbeat | config |
| memory/YYYY-MM-DD.md | /memory/daily/YYYY-MM-DD | memory, daily |
| memory/other.md | /knowledge/other | project |
