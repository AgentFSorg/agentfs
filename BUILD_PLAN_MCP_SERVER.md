# BUILD PLAN: AgentOS MCP Server
**Date:** 2026-01-30
**Author:** Reggie
**Status:** Planning

---

## What We're Building

An MCP (Model Context Protocol) server that gives any MCP-compatible client (Claude Desktop, Cursor, Windsurf, ChatGPT, etc.) persistent, searchable memory via AgentOS.

**Package name:** `@agentos/mcp-server`
**Transport:** stdio (standard for local MCP servers) + optionally Streamable HTTP
**SDK:** `@modelcontextprotocol/server` (v1.x — stable, recommended for production)

---

## Architecture

```
┌──────────────────┐     stdio/JSON-RPC     ┌──────────────────┐     HTTPS     ┌──────────────────┐
│  Claude Desktop  │ ◄─────────────────────► │  AgentOS MCP     │ ◄───────────► │  AgentOS API     │
│  Cursor / etc.   │                         │  Server (local)  │               │  (Fly.io)        │
└──────────────────┘                         └──────────────────┘               └──────────────────┘
```

The MCP server is a thin bridge:
- Receives tool calls via MCP protocol (stdio)
- Translates them to AgentOS API calls (HTTPS)
- Returns results back to the MCP client

---

## MCP Tools to Expose

### 1. `memory_store` — Store a memory
- **Input:** `path` (string), `value` (string), `tags` (string[], optional), `importance` (number 0-1, optional)
- **Output:** Confirmation with version_id
- **Maps to:** `POST /v1/put`

### 2. `memory_recall` — Search memories semantically
- **Input:** `query` (string), `limit` (number, optional, default 5), `tags` (string[], optional)
- **Output:** Array of matching memories with similarity scores
- **Maps to:** `POST /v1/search`

### 3. `memory_get` — Get a specific memory by path
- **Input:** `path` (string)
- **Output:** Memory value, tags, metadata
- **Maps to:** `POST /v1/get`

### 4. `memory_delete` — Delete a memory
- **Input:** `path` (string)
- **Output:** Confirmation
- **Maps to:** `POST /v1/delete`

### 5. `memory_list` — List all memories
- **Input:** `limit` (number, optional, default 50)
- **Output:** Array of all memories
- **Maps to:** `POST /v1/dump`

---

## MCP Resources to Expose

### 1. `agentos://memories` — Read-only list of all stored memories
- Dynamic resource that returns current memory state
- Useful for LLMs to get full context

---

## MCP Prompts to Expose

### 1. `recall-context` — Pre-built prompt for memory recall
- Description: "Search your AgentOS memory for relevant context"
- Args: `topic` (string)
- Returns a prompt that searches memories and formats them for context

---

## Configuration

The server needs:
1. `AGENTOS_API_KEY` — API key for AgentOS (required)
2. `AGENTOS_API_URL` — API URL (default: `https://agentos-api.fly.dev`)
3. `AGENTOS_AGENT_ID` — Agent ID (default: derived from API key prefix or "default")

Configuration via:
- Environment variables (primary)
- CLI flags (`--api-key`, `--api-url`, `--agent-id`)
- Config file (`~/.agentos/config.json`) as fallback

---

## File Structure

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Entry point — creates server + stdio transport
│   ├── server.ts         # McpServer setup — registers tools, resources, prompts
│   ├── api-client.ts     # AgentOS API client (reusable, with retry logic)
│   └── config.ts         # Configuration loading (env, CLI, file)
└── bin/
    └── agentos-mcp.ts    # CLI entry point with shebang
```

---

## Dependencies

- `@modelcontextprotocol/sdk` (v1.x — stable for production)
- `zod` (peer dep of MCP SDK, already in monorepo)

That's it. Minimal deps. The API client uses native `fetch`.

---

## Installation (for users)

```bash
# Global install
npm install -g @agentos/mcp-server

# Or use npx
npx @agentos/mcp-server --api-key YOUR_KEY
```

### Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["@agentos/mcp-server"],
      "env": {
        "AGENTOS_API_KEY": "your_api_key_here",
        "AGENTOS_AGENT_ID": "my-agent"
      }
    }
  }
}
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| SDK v2 is pre-alpha, v1 might have different API | Use v1.x explicitly (`@modelcontextprotocol/sdk@^1`) |
| stdio logging corrupts JSON-RPC | Use `console.error()` only, never `console.log()` |
| API latency (1-2s per call) | Add timeout handling, user sees "thinking" in MCP client |
| API key exposure in config | Warn in README about secure storage |
| Rate limiting | Pass through rate limit headers, add retry with backoff |

---

## Build Steps

1. Create `packages/mcp-server/` directory structure
2. Write `package.json` with correct deps and bin entry
3. Write `tsconfig.json` extending base config
4. Implement `config.ts` — env/CLI/file config loading
5. Implement `api-client.ts` — AgentOS API wrapper with retry
6. Implement `server.ts` — Register all MCP tools, resources, prompts
7. Implement `index.ts` — Wire server to stdio transport
8. Build with tsc
9. Test locally with MCP Inspector or direct stdio
10. Add to monorepo workspace
11. Update website roadmap

---

## Testing Plan

1. Build succeeds (`tsc` exits 0)
2. Binary runs (`npx . --help` works)
3. Test each tool via MCP Inspector:
   - `memory_store` → verify in AgentOS API
   - `memory_recall` → verify search returns results
   - `memory_get` → verify specific path retrieval
   - `memory_delete` → verify deletion
   - `memory_list` → verify dump
4. Test with Claude Desktop (if available)
5. Test error cases: bad API key, network failure, invalid input

---

## Confidence Level: 90%

The MCP SDK docs are clear, the AgentOS API is battle-tested, and the mapping is straightforward. Main uncertainty is around v1 vs v2 SDK API differences — will use v1.x explicitly.
