# AgentOS

**Persistent memory infrastructure for AI agents.**

Give your agents memory they can trust: structured, versioned, searchable, and ready for production.

```ts
import { AgentOSClient } from "@agentos/sdk";

const memory = new AgentOSClient({
  baseUrl: "https://api.agentos.software",
  apiKey: process.env.AGENTOS_KEY!,
});

// Store structured memory at filesystem-like paths
await memory.put({
  path: "/user/preferences/trading",
  value: { style: "momentum", risk: "moderate", pairs: ["SOL/USDT"] },
  searchable: true,
});

// Retrieve instantly
const prefs = await memory.get("/user/preferences/trading");

// Semantic search across all memories
const results = await memory.search({ query: "What trading style does the user prefer?" });
```

## Why AgentOS?

AI agents today are **goldfish**. Every session starts from zero. Context windows are limited. Memory is an afterthought.

AgentOS fixes this with:

| Feature | Description |
|---------|-------------|
| **Filesystem paths** | Organize memory like files: `/user/preferences/tone`, `/project/status` |
| **Version history** | Every write creates an immutable version. Audit anything. |
| **TTL & expiry** | Memory that automatically cleans up. Set it and forget it. |
| **Semantic search** | Find memories by meaning, not just path. Powered by pgvector. |
| **Multi-tenant** | Isolated memory per agent, per user. Hard boundaries. |
| **Cost-safe** | Opt-in indexing with quotas. No surprise embedding bills. |
| **Framework-agnostic** | Works with ElizaOS, LangChain, Clawdbot, or your own stack. |

## Quick Start

### 1. Install the SDK

```bash
npm install @agentos/sdk
```

### 2. Get an API key

Sign up at [agentos.software](https://agentos.software) or self-host (see below).

### 3. Use it

```ts
import { AgentOSClient } from "@agentos/sdk";

const client = new AgentOSClient({
  baseUrl: "https://api.agentos.software",
  apiKey: "your-api-key",
});

// Write
await client.put({ path: "/agent/mood", value: { mood: "focused" } });

// Read
const mood = await client.get("/agent/mood");

// List
const items = await client.list("/agent");

// Search
const results = await client.search({ query: "How is the agent feeling?" });

// History
const versions = await client.history("/agent/mood");

// Delete
await client.delete("/agent/mood");
```

## Integrations

| Framework | Status | Package |
|-----------|--------|---------|
| **ElizaOS** (ai16z) | 🚧 Coming soon | `@agentos/eliza-plugin` |
| **Solana Agent Kit** | 🚧 Coming soon | `@agentos/solana-agent` |
| **Clawdbot / Moltbot** | 🚧 Coming soon | `@agentos/clawdbot-skill` |
| **LangChain** | Planned | — |
| **Any HTTP client** | ✅ Ready | REST API |

## Self-Host

AgentOS is fully open source. Run your own instance:

```bash
# Clone
git clone https://github.com/AgentFSorg/agentfs.git
cd agentfs

# Start Postgres with pgvector
docker compose up -d

# Install, migrate, seed
pnpm install
pnpm db:migrate
pnpm db:seed

# Create an API key
pnpm create:key

# Start the API
pnpm dev:api
```

**Requirements:** Node 20+, Docker, pnpm

## Architecture

```
Client (SDK)  →  HTTP API (Fastify)  →  Postgres + pgvector
                       ↓
                 Embedding Worker (async)
```

- **4 packages:** `api`, `sdk`, `shared`, `worker`
- **Storage:** Postgres with pgvector for semantic search
- **Embeddings:** OpenAI text-embedding-3-small (configurable)
- **Auth:** API key with scoped permissions

See [Architecture docs](./docs/Architecture.md) for deep dive.

## API Reference

| Endpoint | Description |
|----------|-------------|
| `POST /v1/put` | Store a value at a path |
| `POST /v1/get` | Retrieve latest value |
| `POST /v1/delete` | Soft-delete with tombstone |
| `POST /v1/list` | List children under prefix |
| `POST /v1/glob` | Pattern match across paths |
| `POST /v1/search` | Semantic search with filters |
| `POST /v1/history` | Version history for a path |
| `GET /healthz` | Health check |

Full API docs: [API.md](./docs/API.md)

## Token ($AOS)

AgentOS is powered by the **$AOS** token on Solana.

- **Hold-to-access:** Hold $AOS to unlock higher API tiers
- **Free tier:** 1,000 calls/day (no token required)
- **Pro tier:** 50,000 calls/day (hold 10K $AOS)
- **Unlimited:** 100K+ $AOS holders

No staking contracts. No lockups. Just hold in your wallet.

[Learn more →](https://agentos.software)

## Docs

1. [Build Plan](./docs/Buildplan.md) — Execution roadmap
2. [Architecture](./docs/Architecture.md) — System design
3. [API Reference](./docs/API.md) — Endpoints & payloads
4. [Data Model](./docs/DataModel.md) — Schema & indexes
5. [Security](./docs/Security.md) — Security model
6. [Deployment](./docs/DEPLOYMENT.md) — Production setup

## Status

- ✅ v1.0 — Core storage, search, SDK, hardening complete
- 🚧 Integrations — ElizaOS, Solana Agent Kit, Clawdbot
- 📋 Roadmap — Changes feed, ACLs, on-chain proofs

## License

MIT

---

**Built by [MoonstoneLabs](https://moonstonelabs.co.za)** 🪨
