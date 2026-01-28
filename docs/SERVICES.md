# AgentFS External Services (MVP)

**Last updated:** 2026-01-28 (Europe/Dublin)

MVP aims for minimal dependencies.

---

## Required

### Postgres + pgvector
- Storage, versioning, TTL, embeddings (MVP).
- Local via Docker Compose.
- Production: Supabase / Neon / RDS.

### Embeddings provider
MVP assumes OpenAI embeddings.

Env:
```bash
OPENAI_API_KEY=...
OPENAI_EMBED_MODEL=text-embedding-3-small
```

---

## Optional
### Redis
Add only if you need distributed rate limits/quota counters.

---

## Local docker compose (reference)
```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: agentfs
    ports:
      - "5432:5432"
    volumes:
      - agentfs_db:/var/lib/postgresql/data
volumes:
  agentfs_db:
```

---

## Environment variables (MVP)
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/agentfs
PORT=8787

OPENAI_API_KEY=...
OPENAI_EMBED_MODEL=text-embedding-3-small

WRITE_QUOTA_PER_DAY=5000
EMBED_TOKENS_QUOTA_PER_DAY=2000000
SEARCH_QUOTA_PER_DAY=172800

SEARCH_RATE_LIMIT_PER_MINUTE=120
RATE_LIMIT_REQUESTS_PER_MINUTE=120
PREAUTH_RATE_LIMIT_PER_MINUTE=600

# Metrics
ENABLE_METRICS=true
METRICS_TOKEN=...
```
