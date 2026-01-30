/**
 * AgentOS API client for the debugger.
 * Fetches memory dumps, history, and search results for visualization.
 */

import type { MemoryEntry, DumpResponse, TimelineEvent } from "./types.js";

export class DebuggerAPI {
  private apiUrl: string;
  private apiKey: string;
  private agentId: string;

  constructor(apiUrl: string, apiKey: string, agentId: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.agentId = agentId;
  }

  private async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agent_id: this.agentId, ...body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  /** Fetch all current memories for the agent */
  async dump(limit = 500): Promise<MemoryEntry[]> {
    const result = await this.post<DumpResponse>("/v1/dump", { limit });
    return result.entries || [];
  }

  /** Fetch version history for a specific path */
  async history(
    path: string,
    limit = 100
  ): Promise<{
    versions: {
      version_id: string;
      created_at: string;
      value: unknown;
      expires_at: string | null;
      deleted_at: string | null;
    }[];
  }> {
    return this.post("/v1/history", { path, limit });
  }

  /** Search memories */
  async search(
    query: string,
    limit = 20
  ): Promise<{
    results: {
      path: string;
      value: unknown;
      tags: string[];
      similarity: number;
      version_id: string;
      created_at: string;
    }[];
  }> {
    return this.post("/v1/search", { query, limit });
  }

  /** List all agents for the tenant */
  async agents(): Promise<{ agents: { id: string; memory_count: number }[] }> {
    return this.post("/v1/agents", {});
  }

  /**
   * Build a timeline of events from all memory entries.
   * Fetches full dump and reconstructs write timeline.
   */
  async buildTimeline(): Promise<TimelineEvent[]> {
    const entries = await this.dump(500);
    const events: TimelineEvent[] = [];

    for (const entry of entries) {
      // Determine event type from path/tags
      const isThought = entry.path.startsWith("/thoughts/");
      const isDelete = !!entry.deleted_at;

      events.push({
        id: entry.version_id,
        type: isDelete ? "delete" : isThought ? "thought" : "write",
        path: entry.path,
        value: entry.value,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        timestamp: new Date(entry.created_at),
        agent_id: entry.agent_id,
        version_id: entry.version_id,
      });
    }

    // Sort by timestamp ascending (oldest first)
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return events;
  }
}
