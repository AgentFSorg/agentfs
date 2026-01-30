/**
 * AgentOS API client for the MCP server.
 * Lightweight, retry-enabled, zero external deps (uses native fetch).
 */

import type { AgentOSConfig } from "./config.js";

export interface Memory {
  path: string;
  value: unknown;
  tags?: string;
  similarity?: number;
  version_id?: string;
  created_at?: string;
}

export interface PutResult {
  ok: boolean;
  version_id: string;
  created_at: string;
}

export interface DeleteResult {
  ok: boolean;
  deleted: boolean;
  version_id: string;
  created_at: string;
}

export class AgentOSClient {
  private apiUrl: string;
  private apiKey: string;
  private agentId: string;

  constructor(config: AgentOSConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
  }

  private async request<T>(endpoint: string, body: Record<string, unknown>, retries = 3): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${this.apiUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ agent_id: this.agentId, ...body }),
          signal: AbortSignal.timeout(15000), // 15s per request
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: "Unknown error" } })) as { error?: { message?: string } };
          throw new Error(`AgentOS API ${res.status}: ${err?.error?.message || "Unknown error"}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.error(`[agentos-mcp] ${endpoint} attempt ${attempt}/${retries} failed: ${lastError.message} — retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError!;
  }

  async put(
    path: string,
    value: string,
    tags: string[] = [],
    importance = 0.5
  ): Promise<PutResult> {
    return this.request<PutResult>("/v1/put", {
      path,
      value,
      tags,
      importance,
      searchable: true,
    });
  }

  async get(path: string): Promise<Memory | null> {
    try {
      return await this.request<Memory>("/v1/get", { path });
    } catch {
      return null;
    }
  }

  async search(
    query: string,
    limit = 5,
    tagsAny?: string[]
  ): Promise<Memory[]> {
    const body: Record<string, unknown> = { query, limit };
    if (tagsAny && tagsAny.length > 0) {
      body.tags_any = tagsAny;
    }
    const result = await this.request<{ results: Memory[] }>("/v1/search", body);
    return result.results || [];
  }

  async dump(limit = 50): Promise<Memory[]> {
    const result = await this.request<{ entries: Memory[] }>("/v1/dump", { limit });
    return result.entries || [];
  }

  async delete(path: string): Promise<DeleteResult> {
    return this.request<DeleteResult>("/v1/delete", { path });
  }
}
