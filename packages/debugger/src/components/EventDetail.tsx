import type { TimelineEvent } from "../types.ts";

interface EventDetailProps {
  event: TimelineEvent | null;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function EventDetail({ event }: EventDetailProps) {
  if (!event) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>🔍</div>
        <p>Select an event to inspect</p>
        <p style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
          Click any event in the timeline, or use the scrubber to navigate.
        </p>
      </div>
    );
  }

  const value = formatValue(event.value);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.type}>{event.type.toUpperCase()}</span>
        <span style={styles.time}>
          {event.timestamp.toLocaleString()}
        </span>
      </div>

      {/* Path */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>PATH</div>
        <div style={styles.path}>{event.path}</div>
      </div>

      {/* Metadata */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>METADATA</div>
        <div style={styles.meta}>
          <div style={styles.metaRow}>
            <span style={styles.metaKey}>Agent</span>
            <span style={styles.metaValue}>{event.agent_id}</span>
          </div>
          <div style={styles.metaRow}>
            <span style={styles.metaKey}>Version</span>
            <span style={styles.metaValue}>{event.version_id || "—"}</span>
          </div>
          <div style={styles.metaRow}>
            <span style={styles.metaKey}>Type</span>
            <span style={styles.metaValue}>{event.type}</span>
          </div>
          {event.tags.length > 0 && (
            <div style={styles.metaRow}>
              <span style={styles.metaKey}>Tags</span>
              <span style={styles.metaValue}>
                {event.tags.map((t, i) => (
                  <span key={i} style={styles.tag}>
                    {t}
                  </span>
                ))}
              </span>
            </div>
          )}
          {event.similarity !== undefined && (
            <div style={styles.metaRow}>
              <span style={styles.metaKey}>Similarity</span>
              <span style={styles.metaValue}>
                {(event.similarity * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Value */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>VALUE</div>
        <pre style={styles.value}>{value}</pre>
      </div>

      {/* Copy button */}
      <button
        style={styles.copyBtn}
        onClick={() => {
          navigator.clipboard.writeText(value).catch(() => {});
        }}
      >
        📋 Copy Value
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "16px",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#666",
    textAlign: "center",
    padding: "40px",
  },
  emptyIcon: {
    fontSize: "40px",
    marginBottom: "16px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid #222",
  },
  type: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "#00ff88",
    letterSpacing: "1px",
    padding: "4px 10px",
    background: "#0a2a15",
    borderRadius: "4px",
    border: "1px solid #1a4a2a",
  },
  time: {
    fontSize: "12px",
    color: "#666",
  },
  section: {
    marginBottom: "16px",
  },
  sectionLabel: {
    fontSize: "10px",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: "6px",
  },
  path: {
    fontSize: "14px",
    color: "#00ff88",
    fontWeight: "bold",
    wordBreak: "break-all",
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  metaRow: {
    display: "flex",
    gap: "12px",
    fontSize: "12px",
  },
  metaKey: {
    color: "#666",
    minWidth: "80px",
    flexShrink: 0,
  },
  metaValue: {
    color: "#ccc",
    wordBreak: "break-all",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
  },
  tag: {
    fontSize: "10px",
    padding: "1px 6px",
    background: "#1a2a1a",
    color: "#66bb66",
    borderRadius: "2px",
    border: "1px solid #2a3a2a",
  },
  value: {
    background: "#0d0d0d",
    border: "1px solid #222",
    borderRadius: "4px",
    padding: "12px",
    fontSize: "12px",
    lineHeight: "1.6",
    color: "#ddd",
    overflow: "auto",
    maxHeight: "400px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "inherit",
  },
  copyBtn: {
    padding: "8px 16px",
    background: "#1a1a1a",
    border: "1px solid #333",
    color: "#ccc",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "inherit",
  },
};
