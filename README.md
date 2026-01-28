# AgentFS Repo Scaffold (Drizzle + Fastify + Postgres)

This is a starter scaffold for AgentFS using the recommended MVP stack:
- Fastify API (TypeScript)
- Postgres + pgvector (single DB)
- Drizzle ORM (schema lives in shared, migrations are SQL-first for simplicity)
- Worker process for async embeddings
- TypeScript SDK

## Quick start

1) Copy env
```bash
cp .env.example .env
```

2) Start database
```bash
pnpm db:up
```

3) Install deps
```bash
pnpm i
```

4) Run migrations + seed tenant
```bash
pnpm db:migrate
pnpm db:seed
```

5) Create an API key
```bash
pnpm create:key
```
Copy the printed key.

6) Start API
```bash
pnpm dev:api
```

7) Optional: start worker (only needed for searchable entries)
```bash
pnpm dev:worker
```

8) Try it with SDK (example)
```ts
import { AgentFSClient } from "@agentfs/sdk";

const c = new AgentFSClient({ baseUrl: "http://localhost:8787", apiKey: process.env.AGENTFS_KEY! });
await c.put({ path: "/user/preferences/tone", value: { tone: "direct" }, searchable: true });
console.log(await c.get("/user/preferences/tone"));
```

## Notes
- `/v1/search` is currently a stub response until embeddings are populated.
- The worker writes embeddings into pgvector.
