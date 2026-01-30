import { useState } from "react";
import type { TimelineEvent } from "../types.ts";
import type { DebuggerAPI } from "../api.ts";

interface SearchPanelProps {
  api: DebuggerAPI;
  onSelect: (event: TimelineEvent) => void;
}

export function SearchPanel({ api, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TimelineEvent[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await api.search(query.trim(), 20);
      const events: TimelineEvent[] = res.results.map((r) => ({
        id: r.version_id,
        type: "write" as const,
        path: r.path,
        value: r.value,
        tags: Array.isArray(r.tags) ? r.tags : [],
        timestamp: new Date(r.created_at),
        agent_id: "",
        version_id: r.version_id,
        similarity: r.similarity,
      }));
      setResults(events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSearch} style={styles.form}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agent memories..."
          style={styles.input}
        />
        <button type="submit" disabled={searching} style={styles.button}>
          {searching ? "..." : "🔍"}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.results}>
        {results.length === 0 && !searching && query && (
          <div style={styles.empty}>No results found.</div>
        )}
        {results.map((event) => (
          <div
            key={event.id}
            onClick={() => onSelect(event)}
            style={styles.result}
          >
            <div style={styles.resultHeader}>
              <span style={styles.resultPath}>{event.path}</span>
              {event.similarity !== undefined && (
                <span style={styles.similarity}>
                  {(event.similarity * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div style={styles.resultPreview}>
              {typeof event.value === "string"
                ? event.value.slice(0, 150)
                : JSON.stringify(event.value).slice(0, 150)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0",
  },
  form: {
    display: "flex",
    padding: "12px",
    gap: "8px",
    borderBottom: "1px solid #222",
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    background: "#0a0a0a",
    border: "1px solid #333",
    borderRadius: "4px",
    color: "#e0e0e0",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
  },
  button: {
    padding: "10px 16px",
    background: "#00ff88",
    color: "#000",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "16px",
  },
  error: {
    padding: "8px 12px",
    margin: "8px 12px",
    background: "#3d0a0a",
    color: "#ff6b6b",
    borderRadius: "4px",
    fontSize: "13px",
  },
  results: {
    padding: "0",
  },
  empty: {
    padding: "20px",
    textAlign: "center",
    color: "#666",
    fontSize: "13px",
  },
  result: {
    padding: "12px 16px",
    borderBottom: "1px solid #1a1a1a",
    cursor: "pointer",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px",
  },
  resultPath: {
    fontSize: "13px",
    color: "#00ff88",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  similarity: {
    fontSize: "11px",
    color: "#ffaa00",
    padding: "1px 6px",
    background: "#2a2000",
    borderRadius: "3px",
    border: "1px solid #4a3a00",
    flexShrink: 0,
  },
  resultPreview: {
    fontSize: "12px",
    color: "#888",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
