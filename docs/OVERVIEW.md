# AgentFS

AgentFS is a **multi-tenant, filesystem-like memory store** for AI agents and AI applications.

It provides:
- **Namespaced paths** (e.g. `/user/preferences/tone`, `/project/status`)
- **CRUD + list + glob**
- **TTL + version history**
- **Semantic search** (opt-in per entry/prefix with cost controls)
- **TypeScript SDK** + hosted HTTP API

This repo is intentionally **MVP-first**: we ship a small, reliable core before expanding into permissions, subscriptions, or on-chain ownership.

---

## Goals

1. **Deterministic memory**: developers can predict what is stored, what is retrieved, and why.
2. **Filesystem semantics**: familiar ergonomics for agents and tools.
3. **Cost-safe semantics**: embedding/search costs are controlled by design (quotas, opt-in indexing).
4. **Framework-agnostic**: usable from any agent framework.

---

## Non-goals (MVP)

- Real-time subscriptions / WebSockets
- Cross-tenant sharing + fine-grained ACLs
- On-chain ownership / Solana program integration
- “Deep workspace indexing” (AST/LSP/IDE-scale)

See **Buildplan.md** for the phased roadmap.

---

## Quick Start (local dev)

### Prereqs
- Node 20+
- Docker / Docker Compose

### 1) Start Postgres with pgvector
```bash
docker compose up -d
```

### 2) Run migrations
```bash
pnpm migrate
```

### 3) Start API + worker
```bash
pnpm dev
```

### 4) Run tests
```bash
pnpm test
```

---

## Docs

Start here:
1. **Buildplan.md** — the execution plan (MVP-first)
2. **Architecture.md** — system design + invariants
3. **API.md** — endpoints + payloads
4. **DataModel.md** — schema + indexes
5. **SERVICES.md** — external dependencies + env vars

See **DOCS_INDEX.md** for the map.

---

## Status

- **Project reset date:** 2026-01-27 (Europe/Dublin)
- **Current focus:** MVP (Postgres + pgvector + HTTP API + TS SDK)
