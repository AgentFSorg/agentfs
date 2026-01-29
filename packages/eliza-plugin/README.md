# @agentos/eliza-plugin

**Persistent, versioned, searchable long-term memory for ElizaOS agents.**

## Install

```bash
bun add @agentos/eliza-plugin
```

## Usage

```ts
import { agentOSPlugin } from "@agentos/eliza-plugin";

const character = {
  name: "MyAgent",
  plugins: [
    agentOSPlugin({
      baseUrl: "https://api.agentos.software",
      apiKey: process.env.AGENTOS_KEY!,
    }),
  ],
};
```

Your agent now has three new abilities:

| Action | What it does |
|--------|-------------|
| `STORE_MEMORY` | Save important info to persistent memory |
| `RECALL_MEMORY` | Semantically search stored memories |
| `LIST_MEMORIES` | Browse memory by category |

## How it works

1. Agent detects important information in conversation
2. Stores it via AgentOS API at filesystem-like paths
3. Later conversations can search and retrieve those memories
4. Memories persist across sessions, restarts, and deployments

## Configuration

```ts
agentOSPlugin({
  baseUrl: "https://api.agentos.software", // API URL
  apiKey: "your-key",                       // API key
  agentId: "my-agent",                      // Namespace (default: "eliza")
  pathPrefix: "/trading-bot",               // Path prefix (default: "/eliza")
  autoStore: true,                          // Auto-store summaries (default: true)
});
```

## Example: Trading Agent

```ts
// Agent stores user preference
await memory.put({
  path: "/eliza/user/trading-style",
  value: { style: "momentum", leverage: "3x", pairs: ["SOL/USDT"] },
  searchable: true,
});

// Later, agent recalls
const results = await memory.search({
  query: "What trading style does the user prefer?",
});
// → Returns: { style: "momentum", leverage: "3x", pairs: ["SOL/USDT"] }
```

## License

MIT — Built by [MoonstoneLabs](https://moonstonelabs.co.za)
