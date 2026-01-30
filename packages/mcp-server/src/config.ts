/**
 * Configuration loading for AgentOS MCP Server.
 * Priority: CLI args > env vars > config file > defaults.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AgentOSConfig {
  apiKey: string;
  apiUrl: string;
  agentId: string;
}

const DEFAULT_API_URL = "https://agentos-api.fly.dev";
const DEFAULT_AGENT_ID = "default";
const CONFIG_PATH = join(homedir(), ".agentos", "config.json");

function loadConfigFile(): Partial<AgentOSConfig> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey || parsed.api_key,
        apiUrl: parsed.apiUrl || parsed.api_url,
        agentId: parsed.agentId || parsed.agent_id,
      };
    }
  } catch {
    // Config file is optional — ignore errors
  }
  return {};
}

function parseCliArgs(): Partial<AgentOSConfig> {
  const args = process.argv.slice(2);
  const result: Partial<AgentOSConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = args[i + 1];
    if ((arg === "--api-key" || arg === "--apiKey") && next) {
      result.apiKey = next;
      i++;
    } else if ((arg === "--api-url" || arg === "--apiUrl") && next) {
      result.apiUrl = next;
      i++;
    } else if ((arg === "--agent-id" || arg === "--agentId") && next) {
      result.agentId = next;
      i++;
    }
  }

  return result;
}

export function loadConfig(): AgentOSConfig {
  const file = loadConfigFile();
  const cli = parseCliArgs();

  const apiKey =
    cli.apiKey ||
    process.env.AGENTOS_API_KEY ||
    file.apiKey ||
    "";

  const apiUrl =
    cli.apiUrl ||
    process.env.AGENTOS_API_URL ||
    file.apiUrl ||
    DEFAULT_API_URL;

  const agentId =
    cli.agentId ||
    process.env.AGENTOS_AGENT_ID ||
    file.agentId ||
    DEFAULT_AGENT_ID;

  if (!apiKey) {
    // Log to stderr — never stdout (corrupts MCP JSON-RPC)
    console.error(
      "[agentos-mcp] ERROR: No API key found.\n" +
      "  Set AGENTOS_API_KEY env var, pass --api-key, or add to ~/.agentos/config.json\n" +
      "  Get a free key at https://agentos.software/api"
    );
    process.exit(1);
  }

  return { apiKey, apiUrl, agentId };
}
