/**
 * Core types for the Agent Replay Debugger.
 */

export interface MemoryEntry {
  path: string;
  value: unknown;
  tags: string[];
  version_id: string;
  created_at: string;
  agent_id: string;
  deleted_at?: string | null;
  expires_at?: string | null;
  importance?: number;
}

export interface TimelineEvent {
  id: string;
  type: "write" | "read" | "search" | "delete" | "thought";
  path: string;
  value: unknown;
  tags: string[];
  timestamp: Date;
  agent_id: string;
  version_id?: string;
  // For search events
  query?: string;
  results_count?: number;
  similarity?: number;
}

export interface AgentState {
  /** Current memory snapshot at a point in time */
  memories: Map<string, MemoryEntry>;
  /** Total writes up to this point */
  totalWrites: number;
  /** Total searches up to this point */
  totalSearches: number;
  /** Timestamp of this state */
  timestamp: Date;
}

export interface DebuggerConfig {
  apiUrl: string;
  apiKey: string;
  agentId: string;
}

export interface DumpResponse {
  entries: MemoryEntry[];
  count: number;
}
