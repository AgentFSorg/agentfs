interface HeaderProps {
  agentId?: string;
  eventCount?: number;
  onRefresh?: () => void;
  loading?: boolean;
}

export function Header({ agentId, eventCount, onRefresh, loading }: HeaderProps) {
  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <span style={styles.logo}>🔬</span>
        <span style={styles.title}>AgentOS Debugger</span>
        {agentId && (
          <span style={styles.agent}>
            <span style={styles.dot}>●</span> {agentId}
          </span>
        )}
      </div>
      <div style={styles.right}>
        {eventCount !== undefined && (
          <span style={styles.stat}>{eventCount} events</span>
        )}
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading} style={styles.refreshBtn}>
            {loading ? "⏳" : "🔄"} Refresh
          </button>
        )}
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    background: "#111",
    borderBottom: "1px solid #222",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logo: {
    fontSize: "20px",
  },
  title: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#fff",
  },
  agent: {
    fontSize: "13px",
    color: "#00ff88",
    padding: "2px 10px",
    background: "#0a2a15",
    borderRadius: "4px",
    border: "1px solid #1a4a2a",
  },
  dot: {
    color: "#00ff88",
    fontSize: "10px",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  stat: {
    fontSize: "12px",
    color: "#666",
  },
  refreshBtn: {
    padding: "6px 14px",
    background: "#1a1a1a",
    border: "1px solid #333",
    color: "#ccc",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "inherit",
  },
};
