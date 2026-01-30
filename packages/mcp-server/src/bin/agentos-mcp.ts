#!/usr/bin/env node

/**
 * AgentOS MCP Server — CLI entry point.
 */

const HELP = `
AgentOS MCP Server — Persistent memory for any MCP-compatible AI tool

Usage:
  agentos-mcp [options]

Options:
  --api-key <key>     AgentOS API key (or set AGENTOS_API_KEY)
  --api-url <url>     API URL (default: https://agentos-api.fly.dev)
  --agent-id <id>     Agent ID (default: "default")
  --help, -h          Show this help message
  --version, -v       Show version

Environment variables:
  AGENTOS_API_KEY     API key (required)
  AGENTOS_API_URL     API URL
  AGENTOS_AGENT_ID    Agent ID

Config file:
  ~/.agentos/config.json

Get a free API key: https://agentos.software/api

Tools provided:
  memory_store     Store a memory (persistent, searchable)
  memory_recall    Semantic search across all memories
  memory_get       Get a specific memory by path
  memory_delete    Delete a memory
  memory_list      List all stored memories

Prompts provided:
  recall-context   Search memory for context on a topic
`;

// Handle --help and --version BEFORE importing MCP SDK (which hooks stdin)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.error(HELP);
  process.exit(0);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.error("@agentos/mcp-server v0.1.0");
  process.exit(0);
}

// Dynamic imports — only load MCP SDK after CLI checks pass
async function main() {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createServer } = await import("../server.js");
  const { loadConfig } = await import("../config.js");

  // Load configuration (env > CLI > config file)
  const config = loadConfig();

  // Log startup to stderr (never stdout — that's for MCP JSON-RPC)
  console.error(`[agentos-mcp] Starting AgentOS MCP Server v0.1.0`);
  console.error(`[agentos-mcp] Agent: ${config.agentId}`);
  console.error(`[agentos-mcp] API: ${config.apiUrl}`);
  console.error(`[agentos-mcp] Tools: memory_store, memory_recall, memory_get, memory_delete, memory_list`);

  // Create server and connect to stdio
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[agentos-mcp] Connected — ready for MCP client`);
}

main().catch((err) => {
  console.error(`[agentos-mcp] Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
