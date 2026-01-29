# @agentos/eliza-plugin

> Persistent, versioned, searchable long-term memory for [ElizaOS](https://elizaos.ai) agents.

Give your Eliza agent a brain that persists across sessions, searches semantically, and keeps full version history — powered by [AgentOS](https://agentos.software).

## Install

```bash
npm install @agentos/eliza-plugin @agentos/sdk
```

## Quick Start

### 1. Add to your character config

```json
{
  "name": "MyAgent",
  "plugins": ["@agentos/eliza-plugin"],
  "settings": {
    "AGENTOS_API_URL": "https://agentos-api.fly.dev",
    "AGENTOS_API_KEY": "agfs_live_..."
  }
}
```

### 2. Or set environment variables

```bash
AGENTOS_API_URL=https://agentos-api.fly.dev
AGENTOS_API_KEY=agfs_live_...
```

### 3. That's it

Your agent now has persistent memory. It will:

- **Automatically recall** relevant memories during conversations (via the memory provider)
- **Store important facts** when triggered (via the STORE_MEMORY action)
- **Search memories** when asked to recall something (via RECALL_MEMORY)
- **Delete memories** on request (via FORGET_MEMORY)

## What You Get

### Actions

| Action | Description | Trigger Examples |
|--------|-------------|------------------|
| `STORE_MEMORY` | Save facts, preferences, decisions | "Remember that I prefer dark mode" |
| `RECALL_MEMORY` | Search stored memories semantically | "What do you know about my preferences?" |
| `FORGET_MEMORY` | Delete specific memories | "Forget what I said about my old job" |

### Provider

| Provider | Description |
|----------|-------------|
| `AGENTOS_MEMORY` | Automatically injects relevant memories into agent context before every response |

The memory provider runs before every agent response, searching for memories relevant to the current message. This means your agent "just remembers" things without being explicitly asked.

## How It Works

```
User says: "What leverage do I usually trade with?"
                    │
                    ▼
        ┌─────────────────────┐
        │  AGENTOS_MEMORY     │  ← Provider auto-searches
        │  Provider fires     │     "What leverage do I trade with?"
        │  Finds: "SOL 3x"   │
        └─────────────────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │  Agent sees memory  │  ← Injected into context
        │  in its context     │
        │  Responds naturally │
        └─────────────────────┘
                    │
                    ▼
        Agent: "You typically trade SOL with 3x leverage on dips."
```

## Configuration

| Setting | Required | Default | Description |
|---------|----------|---------|-------------|
| `AGENTOS_API_URL` | No | `https://agentos-api.fly.dev` | AgentOS API endpoint |
| `AGENTOS_API_KEY` | **Yes** | — | Your AgentOS API key |
| `AGENTOS_AGENT_ID` | No | Agent name or "eliza" | Namespace for memories |

Get your API key at [agentos.software](https://agentos.software).

## Advanced: Direct SDK Usage

For custom integrations beyond the plugin:

```typescript
import { AgentOSClient } from "@agentos/sdk";

const client = new AgentOSClient({
  baseUrl: "https://agentos-api.fly.dev",
  apiKey: "agfs_live_...",
  agentId: "my-agent",
});

// Store
await client.put({
  path: "/user/preferences",
  value: { theme: "dark", language: "en" },
  searchable: true,
  tags: ["preferences"],
});

// Search
const results = await client.search({
  query: "user interface preferences",
  limit: 5,
});

// Read
const pref = await client.get("/user/preferences");

// History
const history = await client.history("/user/preferences");
```

## Why AgentOS?

| Feature | Raw Vector DB | AgentOS |
|---------|--------------|---------|
| Semantic search | ✅ Manual setup | ✅ One API call |
| Version history | ❌ | ✅ Built-in |
| TTL / expiry | ❌ | ✅ Per-entry |
| Multi-agent isolation | ❌ | ✅ agent_id namespacing |
| Rate limiting & quotas | ❌ | ✅ Per-tenant |
| ElizaOS integration | ❌ | ✅ Drop-in plugin |

## License

MIT
