/**
 * AgentOS MCP Server — registers tools, resources, and prompts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentOSClient } from "./api-client.js";
import type { AgentOSConfig } from "./config.js";

/** Safely stringify any value — never throws */
function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const s = JSON.stringify(value, null, 2);
    return s ?? String(value);
  } catch {
    return String(value);
  }
}

/** Safely parse tags from JSON string or return raw */
function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags !== "string" || !tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [tags]; // treat as single tag
  }
}

export function createServer(config: AgentOSConfig): McpServer {
  const server = new McpServer({
    name: "agentos-memory",
    version: "0.1.0",
  });

  const client = new AgentOSClient(config);

  // ── Tool: memory_store ──────────────────────────────────────────────
  server.registerTool(
    "memory_store",
    {
      title: "Store Memory",
      description:
        "Store a memory in AgentOS. Memories are persistent, searchable, and survive across sessions. " +
        "Use this to remember facts, decisions, context, user preferences, or anything worth recalling later.",
      inputSchema: {
        path: z
          .string()
          .describe("Memory path (e.g. /facts/user-name, /decisions/2024-01-15, /context/project-goals)"),
        value: z
          .string()
          .describe("The content to store as text"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags for categorization and filtering (e.g. ['user-fact', 'important'])"),
        importance: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Importance score 0-1 (default 0.5). Use 0.8+ for critical facts, 0.3 for minor notes"),
      },
    },
    async ({ path, value, tags, importance }) => {
      try {
        const result = await client.put(path, value, tags || [], importance ?? 0.5);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Memory stored at ${path}\nVersion: ${result.version_id}\nCreated: ${result.created_at}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to store memory: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: memory_recall ─────────────────────────────────────────────
  server.registerTool(
    "memory_recall",
    {
      title: "Recall Memories",
      description:
        "Search your AgentOS memory using natural language. Returns the most semantically relevant memories. " +
        "Use this to recall context, facts, decisions, or anything you've previously stored.",
      inputSchema: {
        query: z
          .string()
          .describe("Natural language search query (e.g. 'user preferences', 'project architecture decisions')"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results to return (default 5)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional: only return memories with these tags"),
      },
    },
    async ({ query, limit, tags }) => {
      try {
        const results = await client.search(query, limit ?? 5, tags);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No memories found matching your query.",
              },
            ],
          };
        }

        const formatted = results
          .map((m, i) => {
            const sim = m.similarity ? ` (${(m.similarity * 100).toFixed(1)}% match)` : "";
            const val = safeStringify(m.value);
            const tagList = parseTags(m.tags);
            const tagStr = tagList.length > 0 ? ` [${tagList.join(", ")}]` : "";
            return `${i + 1}. **${m.path}**${sim}${tagStr}\n   ${val}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} memories:\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Memory search failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: memory_get ────────────────────────────────────────────────
  server.registerTool(
    "memory_get",
    {
      title: "Get Memory",
      description:
        "Retrieve a specific memory by its exact path. " +
        "Use this when you know the exact path of a memory you want to read.",
      inputSchema: {
        path: z
          .string()
          .describe("Exact memory path (e.g. /facts/user-name)"),
      },
    },
    async ({ path }) => {
      try {
        const memory = await client.get(path);

        if (!memory) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No memory found at path: ${path}`,
              },
            ],
          };
        }

        const val = safeStringify(memory.value);

        return {
          content: [
            {
              type: "text" as const,
              text: `**${memory.path}**\n\n${val}\n\nVersion: ${memory.version_id || "unknown"}\nCreated: ${memory.created_at || "unknown"}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to get memory: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: memory_delete ─────────────────────────────────────────────
  server.registerTool(
    "memory_delete",
    {
      title: "Delete Memory",
      description:
        "Delete a specific memory by path. This creates a tombstone — the memory is soft-deleted and won't appear in searches.",
      inputSchema: {
        path: z
          .string()
          .describe("Exact path of the memory to delete"),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.delete(path);
        return {
          content: [
            {
              type: "text" as const,
              text: `🗑️ Memory deleted at ${path}\nVersion: ${result.version_id}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to delete memory: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: memory_list ───────────────────────────────────────────────
  server.registerTool(
    "memory_list",
    {
      title: "List All Memories",
      description:
        "List all stored memories. Returns paths, values, and metadata. " +
        "Use this to get an overview of everything in memory.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max memories to return (default 50)"),
      },
    },
    async ({ limit }) => {
      try {
        const entries = await client.dump(limit ?? 50);

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No memories stored yet. Use memory_store to add your first memory.",
              },
            ],
          };
        }

        const formatted = entries
          .map((e) => {
            const val = safeStringify(e.value).slice(0, 100);
            return `• ${e.path}: ${val}${val.length >= 100 ? "..." : ""}`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `📚 ${entries.length} memories stored:\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Failed to list memories: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Prompt: recall-context ──────────────────────────────────────────
  server.registerPrompt(
    "recall-context",
    {
      title: "Recall Context",
      description:
        "Search your AgentOS memory for relevant context on a topic. " +
        "Returns a formatted prompt with all relevant memories.",
      argsSchema: {
        topic: z.string().describe("Topic to search for in memory"),
      },
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Search your AgentOS memory for everything related to: "${topic}"\n\n` +
              `Use the memory_recall tool with this query, then synthesize the results into a coherent summary. ` +
              `Include key facts, decisions, and context. Note any gaps in knowledge.`,
          },
        },
      ],
    })
  );

  return server;
}
