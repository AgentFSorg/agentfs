/**
 * @agentos/eliza-plugin
 *
 * AgentOS memory plugin for ElizaOS v2 agents.
 * Gives Eliza agents persistent, versioned, searchable long-term memory
 * via the AgentOS API.
 *
 * Usage (character config):
 * ```json
 * {
 *   "plugins": ["@agentos/eliza-plugin"],
 *   "settings": {
 *     "AGENTOS_API_URL": "https://agentos-api.fly.dev",
 *     "AGENTOS_API_KEY": "agfs_live_..."
 *   }
 * }
 * ```
 *
 * Or via environment variables:
 *   AGENTOS_API_URL=https://agentos-api.fly.dev
 *   AGENTOS_API_KEY=agfs_live_...
 */

import { AgentOSClient } from "@agentos/sdk";
export { AgentOSClient } from "@agentos/sdk";

// ─── Types (minimal ElizaOS v2 interface) ────────────────────────────
// We define these inline to avoid a hard dependency on @elizaos/core
// at build time — the plugin uses peerDependencies at runtime.

interface IAgentRuntime {
  getSetting(key: string): string | undefined;
  agentId?: string;
  character?: { name?: string };
}

interface ActionResult {
  success: boolean;
  text?: string;
  data?: Record<string, unknown>;
}

interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: any[][];
  validate: (runtime: IAgentRuntime, message: any, state?: any) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: any,
    state?: any,
    options?: any,
    callback?: (response: any, files?: any[]) => Promise<void>
  ) => Promise<ActionResult>;
}

interface ProviderResult {
  text: string;
  data?: Record<string, unknown>;
}

interface Provider {
  name: string;
  description?: string;
  dynamic?: boolean;
  position?: number;
  get: (runtime: IAgentRuntime, message: any, state?: any) => Promise<ProviderResult>;
}

interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: any[];
  services?: any[];
  init?: (config: any, runtime: IAgentRuntime) => Promise<void>;
  config?: Record<string, unknown>;
}

// ─── Internal helpers ────────────────────────────────────────────────

/** Lazily initialise and cache the SDK client per runtime */
const clientCache = new WeakMap<IAgentRuntime, AgentOSClient>();

function getClient(runtime: IAgentRuntime): AgentOSClient {
  let client = clientCache.get(runtime);
  if (client) return client;

  const baseUrl =
    runtime.getSetting("AGENTOS_API_URL") ||
    runtime.getSetting("AGENTOS_BASE_URL") ||
    "https://agentos-api.fly.dev";

  const apiKey =
    runtime.getSetting("AGENTOS_API_KEY") ||
    runtime.getSetting("AGENTOS_KEY") ||
    "";

  if (!apiKey) {
    throw new Error(
      "[agentos] AGENTOS_API_KEY not configured. Set it in character settings or environment."
    );
  }

  const agentId =
    runtime.getSetting("AGENTOS_AGENT_ID") ||
    runtime.agentId ||
    runtime.character?.name ||
    "eliza";

  client = new AgentOSClient({ baseUrl, apiKey, agentId });
  clientCache.set(runtime, client);
  return client;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

// ─── Actions ─────────────────────────────────────────────────────────

const storeMemoryAction: Action = {
  name: "STORE_MEMORY",
  description:
    "Store important information to persistent long-term memory. Use when the user shares preferences, facts, decisions, instructions, or anything worth remembering across sessions. This memory persists forever and is searchable.",
  similes: [
    "REMEMBER_THIS",
    "SAVE_MEMORY",
    "MEMORIZE",
    "TAKE_NOTE",
    "STORE_FACT",
    "REMEMBER",
  ],
  examples: [
    [
      { name: "user", content: { text: "My favorite color is blue and I prefer dark mode." } },
      {
        name: "agent",
        content: { text: "I'll remember your preferences.", action: "STORE_MEMORY" },
      },
    ],
    [
      { name: "user", content: { text: "I trade SOL with 3x leverage on dips." } },
      {
        name: "agent",
        content: { text: "Noted — SOL, 3x leverage, buy dips.", action: "STORE_MEMORY" },
      },
    ],
    [
      {
        name: "user",
        content: { text: "Remember that my birthday is July 18th." },
      },
      {
        name: "agent",
        content: { text: "Stored! Birthday: July 18th.", action: "STORE_MEMORY" },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime) => {
    try {
      getClient(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _state?: any,
    _options?: any,
    callback?: any
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const text: string = message?.content?.text ?? "";
      if (!text.trim()) {
        return { success: false, text: "Nothing to store." };
      }

      // Derive a meaningful path from the content
      const slug = slugify(text.slice(0, 80));
      const ts = Date.now();
      const path = `/memories/${slug}-${ts}`;

      const result = await client.put({
        path,
        value: {
          text,
          entityId: message?.entityId,
          roomId: message?.roomId,
          timestamp: new Date().toISOString(),
        },
        searchable: true,
        tags: ["conversation", "user-fact"],
      });

      const responseText = "Stored to long-term memory.";
      if (callback) {
        await callback(
          { text: responseText, metadata: { versionId: result.version_id, path } },
          []
        );
      }
      return { success: true, text: responseText, data: { versionId: result.version_id, path } };
    } catch (err: any) {
      console.error("[agentos] STORE_MEMORY failed:", err?.message);
      const errorText = "Failed to store memory.";
      if (callback) await callback({ text: errorText }, []);
      return { success: false, text: errorText };
    }
  },
};

const recallMemoryAction: Action = {
  name: "RECALL_MEMORY",
  description:
    "Search long-term memory for relevant information. Use when you need to remember something from a previous conversation, find stored user preferences, or recall facts that were saved earlier.",
  similes: [
    "SEARCH_MEMORY",
    "REMEMBER",
    "LOOK_UP",
    "RECALL",
    "FIND_MEMORY",
    "CHECK_MEMORY",
  ],
  examples: [
    [
      { name: "user", content: { text: "What are my trading preferences?" } },
      {
        name: "agent",
        content: { text: "Let me check my memory...", action: "RECALL_MEMORY" },
      },
    ],
    [
      { name: "user", content: { text: "Do you remember what I told you about my job?" } },
      {
        name: "agent",
        content: { text: "Let me search for that...", action: "RECALL_MEMORY" },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime) => {
    try {
      getClient(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _state?: any,
    _options?: any,
    callback?: any
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const query: string = message?.content?.text ?? "";
      if (!query.trim()) {
        return { success: false, text: "No search query provided." };
      }

      const response = await client.search({ query, limit: 5 });

      if (!response.results.length) {
        const noResultText = "No relevant memories found.";
        if (callback) await callback({ text: noResultText }, []);
        return { success: true, text: noResultText };
      }

      const formatted = response.results
        .map((r, i) => {
          const val =
            typeof r.value === "object" && r.value !== null && "text" in (r.value as any)
              ? (r.value as any).text
              : JSON.stringify(r.value);
          const pct = (r.similarity * 100).toFixed(0);
          return `${i + 1}. (${pct}% match) ${val}`;
        })
        .join("\n");

      const responseText = `Found ${response.results.length} memories:\n${formatted}`;
      if (callback) await callback({ text: responseText }, []);
      return {
        success: true,
        text: responseText,
        data: { count: response.results.length, results: response.results },
      };
    } catch (err: any) {
      console.error("[agentos] RECALL_MEMORY failed:", err?.message);
      const errorText = "Failed to search memory.";
      if (callback) await callback({ text: errorText }, []);
      return { success: false, text: errorText };
    }
  },
};

const forgetMemoryAction: Action = {
  name: "FORGET_MEMORY",
  description:
    "Delete a specific memory by path. Use when the user asks you to forget something or when stored information is no longer relevant.",
  similes: ["DELETE_MEMORY", "REMOVE_MEMORY", "FORGET", "ERASE_MEMORY"],
  examples: [
    [
      { name: "user", content: { text: "Forget what I said about my old job." } },
      {
        name: "agent",
        content: { text: "I'll search and remove that memory.", action: "FORGET_MEMORY" },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime) => {
    try {
      getClient(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _state?: any,
    _options?: any,
    callback?: any
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const query: string = message?.content?.text ?? "";

      // First search for matching memories
      const searchResult = await client.search({ query, limit: 1 });
      if (!searchResult.results.length) {
        const text = "No matching memory found to delete.";
        if (callback) await callback({ text }, []);
        return { success: true, text };
      }

      const target = searchResult.results[0]!;
      await client.delete(target.path);

      const text = `Deleted memory: "${typeof target.value === "object" && target.value !== null && "text" in (target.value as any) ? (target.value as any).text : target.path}"`;
      if (callback) await callback({ text }, []);
      return { success: true, text, data: { deletedPath: target.path } };
    } catch (err: any) {
      console.error("[agentos] FORGET_MEMORY failed:", err?.message);
      const errorText = "Failed to delete memory.";
      if (callback) await callback({ text: errorText }, []);
      return { success: false, text: errorText };
    }
  },
};

// ─── Provider ────────────────────────────────────────────────────────

/**
 * Memory context provider — injects relevant memories into the agent's
 * context before every response. This means the agent automatically
 * "remembers" relevant past interactions without being explicitly asked.
 */
const memoryProvider: Provider = {
  name: "AGENTOS_MEMORY",
  description: "Retrieves relevant long-term memories based on the current conversation",
  dynamic: true,
  position: 10, // Run after core providers but before actions

  get: async (runtime: IAgentRuntime, message: any): Promise<ProviderResult> => {
    try {
      const client = getClient(runtime);
      const query: string = message?.content?.text ?? "";
      if (!query.trim() || query.length < 5) {
        return { text: "" };
      }

      const response = await client.search({ query, limit: 3 });

      if (!response.results.length) {
        return { text: "" };
      }

      const memories = response.results
        .filter((r) => r.similarity > 0.3) // Only include reasonably relevant memories
        .map((r) => {
          const val =
            typeof r.value === "object" && r.value !== null && "text" in (r.value as any)
              ? (r.value as any).text
              : JSON.stringify(r.value);
          return `- ${val}`;
        });

      if (!memories.length) {
        return { text: "" };
      }

      const text = `## Relevant Long-Term Memories\nThe following information was previously stored and may be relevant:\n${memories.join("\n")}`;

      return {
        text,
        data: {
          memoryCount: memories.length,
          results: response.results.filter((r) => r.similarity > 0.3),
        },
      };
    } catch (err: any) {
      // Silently fail — don't break the agent if memory is down
      console.error("[agentos] Memory provider error:", err?.message);
      return { text: "" };
    }
  },
};

// ─── Plugin Export ───────────────────────────────────────────────────

export const agentOSPlugin: Plugin = {
  name: "@agentos/eliza-plugin",
  description:
    "Persistent, versioned, searchable long-term memory for ElizaOS agents via AgentOS",

  init: async (_config: any, runtime: IAgentRuntime) => {
    try {
      const client = getClient(runtime);
      // Verify connectivity by writing a heartbeat
      await client.put({
        path: "/_system/heartbeat",
        value: { status: "connected", timestamp: new Date().toISOString() },
      });
      console.log("[agentos] Plugin initialized — connected to AgentOS API");
    } catch (err: any) {
      console.warn("[agentos] Plugin init warning:", err?.message);
      console.warn("[agentos] Memory features will be unavailable until AGENTOS_API_KEY is configured.");
    }
  },

  actions: [storeMemoryAction, recallMemoryAction, forgetMemoryAction],

  providers: [memoryProvider],

  evaluators: [],
  services: [],
};

export default agentOSPlugin;
