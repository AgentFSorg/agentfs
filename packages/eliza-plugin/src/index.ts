/**
 * @agentos/eliza-plugin
 *
 * AgentOS memory plugin for ElizaOS agents.
 * Gives Eliza agents persistent, versioned, searchable long-term memory
 * via the AgentOS API.
 *
 * Usage:
 * ```ts
 * import { agentOSPlugin } from "@agentos/eliza-plugin";
 *
 * const agent = new AgentRuntime({
 *   plugins: [agentOSPlugin({
 *     baseUrl: "https://api.agentos.software",
 *     apiKey: process.env.AGENTOS_KEY!,
 *   })],
 * });
 * ```
 *
 * This adds three actions to the agent:
 * - STORE_MEMORY: Save important information to persistent memory
 * - RECALL_MEMORY: Search and retrieve stored memories
 * - LIST_MEMORIES: Browse memory by path prefix
 */

import { AgentOSClient } from "@agentos/sdk";

// Re-export for convenience
export { AgentOSClient } from "@agentos/sdk";

export interface AgentOSPluginConfig {
  /** AgentOS API URL */
  baseUrl: string;
  /** AgentOS API key */
  apiKey: string;
  /** Agent ID namespace (default: "eliza") */
  agentId?: string;
  /** Auto-store conversation summaries (default: true) */
  autoStore?: boolean;
  /** Path prefix for this agent's memories (default: "/eliza") */
  pathPrefix?: string;
}

/**
 * Creates the AgentOS plugin for ElizaOS.
 *
 * This plugin adds persistent, searchable long-term memory to any Eliza agent.
 * Memories survive across sessions, can be searched semantically, and maintain
 * full version history.
 */
export function agentOSPlugin(config: AgentOSPluginConfig) {
  const client = new AgentOSClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    agentId: config.agentId ?? "eliza",
  });

  const prefix = config.pathPrefix ?? "/eliza";

  return {
    name: "agentos",
    description: "Persistent, versioned, searchable long-term memory via AgentOS",

    actions: [
      {
        name: "STORE_MEMORY",
        description:
          "Store important information to persistent long-term memory. Use this when the user shares preferences, facts, decisions, or anything worth remembering across sessions.",
        examples: [
          [
            {
              user: "user",
              content: { text: "I prefer trading SOL with 3x leverage" },
            },
            {
              user: "agent",
              content: {
                text: "I'll remember your SOL trading preference.",
                action: "STORE_MEMORY",
              },
            },
          ],
        ],
        validate: async () => true,
        handler: async (
          runtime: any,
          message: any,
          state: any,
          options: any,
          callback: any
        ) => {
          try {
            const path = `${prefix}/conversations/${Date.now()}`;
            const value = {
              text: message.content.text,
              entityId: message.entityId,
              roomId: message.roomId,
              timestamp: new Date().toISOString(),
            };

            const result = await client.put({
              path,
              value,
              searchable: true,
              tags: ["conversation", "auto"],
            });

            if (callback) {
              callback({
                text: `Stored to memory.`,
                metadata: { versionId: result.version_id, path },
              });
            }
            return true;
          } catch (error) {
            console.error("[agentos] Failed to store memory:", error);
            if (callback) {
              callback({ text: "Failed to store memory." });
            }
            return false;
          }
        },
      },

      {
        name: "RECALL_MEMORY",
        description:
          "Search long-term memory for relevant information. Use this when you need to remember something from a previous conversation or find stored facts.",
        examples: [
          [
            {
              user: "user",
              content: { text: "What trading preferences do I have?" },
            },
            {
              user: "agent",
              content: {
                text: "Let me check my memory...",
                action: "RECALL_MEMORY",
              },
            },
          ],
        ],
        validate: async () => true,
        handler: async (
          runtime: any,
          message: any,
          state: any,
          options: any,
          callback: any
        ) => {
          try {
            const query = message.content.text;
            const results = await client.search({
              query,
              limit: 5,
              pathPrefix: prefix,
            });

            if (results.results.length === 0) {
              if (callback) {
                callback({ text: "No relevant memories found." });
              }
              return true;
            }

            const memories = results.results
              .map(
                (r, i) =>
                  `${i + 1}. [${r.path}] (similarity: ${(r.similarity * 100).toFixed(0)}%)\n   ${JSON.stringify(r.value)}`
              )
              .join("\n");

            if (callback) {
              callback({
                text: `Found ${results.results.length} relevant memories:\n${memories}`,
              });
            }
            return true;
          } catch (error) {
            console.error("[agentos] Failed to search memory:", error);
            if (callback) {
              callback({ text: "Failed to search memory." });
            }
            return false;
          }
        },
      },

      {
        name: "LIST_MEMORIES",
        description:
          "Browse stored memories by category. Use this to see what's been remembered under a specific topic.",
        examples: [
          [
            {
              user: "user",
              content: { text: "What do you have stored about my preferences?" },
            },
            {
              user: "agent",
              content: {
                text: "Let me list what I have...",
                action: "LIST_MEMORIES",
              },
            },
          ],
        ],
        validate: async () => true,
        handler: async (
          runtime: any,
          message: any,
          state: any,
          options: any,
          callback: any
        ) => {
          try {
            const result = await client.list(prefix);

            if (result.items.length === 0) {
              if (callback) {
                callback({ text: "No memories stored yet." });
              }
              return true;
            }

            const listing = result.items
              .map((item) => `${item.type === "dir" ? "📁" : "📄"} ${item.path}`)
              .join("\n");

            if (callback) {
              callback({
                text: `Memory structure:\n${listing}`,
              });
            }
            return true;
          } catch (error) {
            console.error("[agentos] Failed to list memories:", error);
            if (callback) {
              callback({ text: "Failed to list memories." });
            }
            return false;
          }
        },
      },
    ],

    services: [],
    providers: [],
    evaluators: [],
  };
}

export default agentOSPlugin;
