# @agentos/mcp-server

**Persistent, searchable memory for any MCP-compatible AI tool.**

Give Claude Desktop, Cursor, Windsurf, ChatGPT, and any MCP client persistent memory that survives across sessions. Powered by [AgentOS](https://agentos.software).

## Quick Start

```bash
# Install globally
npm install -g @agentos/mcp-server

# Or run directly with npx
AGENTOS_API_KEY=your_key npx @agentos/mcp-server
```

### Claude Desktop Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["@agentos/mcp-server"],
      "env": {
        "AGENTOS_API_KEY": "your_api_key_here",
        "AGENTOS_AGENT_ID": "claude"
      }
    }
  }
}
```

Get a free API key at [agentos.software/api](https://agentos.software/api).

## Tools

| Tool | Description |
|------|-------------|
| `memory_store` | Store a persistent, searchable memory |
| `memory_recall` | Semantic search across all memories |
| `memory_get` | Retrieve a specific memory by path |
| `memory_delete` | Delete a memory |
| `memory_list` | List all stored memories |

## How It Works

```
You → Claude Desktop → AgentOS MCP Server → AgentOS API
                                               ↓
                                         Supabase + pgvector
                                         (persistent storage +
                                          semantic embeddings)
```

Every memory is:
- **Persistent** — survives across sessions, restarts, and updates
- **Searchable** — semantic search using embeddings (not just keyword matching)
- **Versioned** — full version history, soft deletes
- **Tagged** — categorize and filter memories by tags

## Configuration

| Option | Env Var | CLI Flag | Default |
|--------|---------|----------|---------|
| API Key | `AGENTOS_API_KEY` | `--api-key` | (required) |
| API URL | `AGENTOS_API_URL` | `--api-url` | `https://agentos-api.fly.dev` |
| Agent ID | `AGENTOS_AGENT_ID` | `--agent-id` | `default` |

You can also create `~/.agentos/config.json`:

```json
{
  "apiKey": "your_key_here",
  "agentId": "my-agent"
}
```

## Examples

Once connected, your AI can:

- **"Remember that I prefer TypeScript over JavaScript"** → Stores a preference
- **"What do you know about my coding preferences?"** → Semantic search
- **"Show me everything you remember"** → Lists all memories
- **"Forget my email address"** → Deletes specific memory

## License

MIT — [AgentOS](https://agentos.software)
