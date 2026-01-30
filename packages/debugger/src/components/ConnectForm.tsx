import { useState } from "react";
import type { DebuggerConfig } from "../types.ts";

interface ConnectFormProps {
  onConnect: (config: DebuggerConfig) => void;
  loading: boolean;
  error: string | null;
}

export function ConnectForm({ onConnect, loading, error }: ConnectFormProps) {
  const [apiUrl, setApiUrl] = useState("https://agentos-api.fly.dev");
  const [apiKey, setApiKey] = useState("");
  const [agentId, setAgentId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !agentId.trim()) return;
    onConnect({ apiUrl: apiUrl.trim(), apiKey: apiKey.trim(), agentId: agentId.trim() });
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Connect to Agent</h2>
        <p style={styles.subtext}>
          Enter your AgentOS credentials to inspect an agent's memory timeline.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            API URL
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              style={styles.input}
              placeholder="https://agentos-api.fly.dev"
            />
          </label>

          <label style={styles.label}>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.input}
              placeholder="agfs_live_..."
              required
            />
          </label>

          <label style={styles.label}>
            Agent ID
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={styles.input}
              placeholder="e.g. atlas, reggie, default"
              required
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Connecting..." : "🔬 Connect & Load Timeline"}
          </button>
        </form>

        <p style={styles.hint}>
          Get a free API key at{" "}
          <a href="https://agentos.software/api" style={styles.link}>
            agentos.software/api
          </a>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "40px",
  },
  card: {
    maxWidth: "480px",
    width: "100%",
    background: "#111",
    border: "1px solid #222",
    borderRadius: "8px",
    padding: "32px",
  },
  heading: {
    fontSize: "20px",
    fontWeight: "bold",
    marginBottom: "8px",
    color: "#fff",
  },
  subtext: {
    fontSize: "13px",
    color: "#666",
    marginBottom: "24px",
    lineHeight: "1.5",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "12px",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    padding: "10px 12px",
    background: "#0a0a0a",
    border: "1px solid #333",
    borderRadius: "4px",
    color: "#e0e0e0",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
  },
  error: {
    padding: "8px 12px",
    background: "#3d0a0a",
    color: "#ff6b6b",
    borderRadius: "4px",
    fontSize: "13px",
  },
  button: {
    padding: "12px",
    background: "#00ff88",
    color: "#000",
    border: "none",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: "8px",
  },
  hint: {
    fontSize: "11px",
    color: "#555",
    marginTop: "16px",
    textAlign: "center",
  },
  link: {
    color: "#00ff88",
    textDecoration: "none",
  },
};
