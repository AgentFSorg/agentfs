import type { TimelineEvent } from "../types.ts";

interface TimelineProps {
  events: TimelineEvent[];
  selectedId: string | null;
  onSelect: (event: TimelineEvent) => void;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  write: { icon: "✏️", color: "#00ff88", label: "WRITE" },
  read: { icon: "👁", color: "#66bbff", label: "READ" },
  search: { icon: "🔍", color: "#ffaa00", label: "SEARCH" },
  delete: { icon: "🗑️", color: "#ff6b6b", label: "DELETE" },
  thought: { icon: "💭", color: "#bb88ff", label: "THOUGHT" },
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getPreview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 120);
  if (value && typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).text).slice(0, 120);
  }
  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return String(value).slice(0, 120);
  }
}

export function Timeline({ events, selectedId, onSelect }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No events to display.</p>
        <p style={{ fontSize: "12px", color: "#555" }}>
          Connect to an agent to see its memory timeline.
        </p>
      </div>
    );
  }

  // Group events by date
  const groups: { date: string; events: TimelineEvent[] }[] = [];
  let currentDate = "";
  for (const event of events) {
    const dateStr = formatDate(event.timestamp);
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groups.push({ date: dateStr, events: [] });
    }
    groups[groups.length - 1]!.events.push(event);
  }

  return (
    <div style={styles.container}>
      {groups.map((group) => (
        <div key={group.date}>
          <div style={styles.dateHeader}>{group.date}</div>
          {group.events.map((event) => {
            const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.write!;
            const isSelected = event.id === selectedId;
            return (
              <div
                key={event.id}
                onClick={() => onSelect(event)}
                style={{
                  ...styles.event,
                  ...(isSelected ? styles.eventSelected : {}),
                  borderLeftColor: cfg.color,
                }}
              >
                <div style={styles.eventHeader}>
                  <span style={styles.eventIcon}>{cfg.icon}</span>
                  <span style={{ ...styles.eventType, color: cfg.color }}>{cfg.label}</span>
                  <span style={styles.eventTime}>{formatTime(event.timestamp)}</span>
                </div>
                <div style={styles.eventPath}>{event.path}</div>
                <div style={styles.eventPreview}>{getPreview(event.value)}</div>
                {event.tags.length > 0 && (
                  <div style={styles.tags}>
                    {event.tags.map((tag, i) => (
                      <span key={i} style={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
    color: "#666",
  },
  dateHeader: {
    padding: "8px 16px",
    background: "#0d0d0d",
    color: "#555",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    position: "sticky",
    top: 0,
    zIndex: 1,
    borderBottom: "1px solid #1a1a1a",
  },
  event: {
    padding: "12px 16px",
    borderBottom: "1px solid #1a1a1a",
    borderLeft: "3px solid #333",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  eventSelected: {
    background: "#1a1a1a",
  },
  eventHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  eventIcon: {
    fontSize: "14px",
  },
  eventType: {
    fontSize: "10px",
    fontWeight: "bold",
    letterSpacing: "1px",
  },
  eventTime: {
    fontSize: "11px",
    color: "#555",
    marginLeft: "auto",
  },
  eventPath: {
    fontSize: "13px",
    color: "#00ff88",
    marginBottom: "2px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  eventPreview: {
    fontSize: "12px",
    color: "#888",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  },
  tags: {
    display: "flex",
    gap: "4px",
    marginTop: "6px",
    flexWrap: "wrap",
  },
  tag: {
    fontSize: "10px",
    padding: "1px 6px",
    background: "#1a2a1a",
    color: "#66bb66",
    borderRadius: "2px",
    border: "1px solid #2a3a2a",
  },
};
