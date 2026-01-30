/**
 * AgentOS MCP Server — Entry point.
 *
 * Connects the AgentOS MCP server to a stdio transport
 * for use with Claude Desktop, Cursor, and other MCP clients.
 */

export { createServer } from "./server.js";
export { loadConfig } from "./config.js";
export { AgentOSClient } from "./api-client.js";
