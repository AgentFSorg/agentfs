import { useState, useCallback } from "react";
import { DebuggerAPI } from "./api.ts";
import type { TimelineEvent, DebuggerConfig } from "./types.ts";
import { Timeline } from "./components/Timeline.tsx";
import { EventDetail } from "./components/EventDetail.tsx";
import { ConnectForm } from "./components/ConnectForm.tsx";
import { Header } from "./components/Header.tsx";
import { MemoryTree } from "./components/MemoryTree.tsx";
import { SearchPanel } from "./components/SearchPanel.tsx";

export function App() {
  const [config, setConfig] = useState<DebuggerConfig | null>(null);
  const [api, setApi] = useState<DebuggerAPI | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "tree" | "search">("timeline");
  const [scrubIndex, setScrubIndex] = useState<number>(-1);

  const connect = useCallback(async (cfg: DebuggerConfig) => {
    setLoading(true);
    setError(null);
    try {
      const client = new DebuggerAPI(cfg.apiUrl, cfg.apiKey, cfg.agentId);
      const timeline = await client.buildTimeline();
      setApi(client);
      setConfig(cfg);
      setEvents(timeline);
      setScrubIndex(timeline.length - 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const timeline = await api.buildTimeline();
      setEvents(timeline);
      setScrubIndex(timeline.length - 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  if (!config) {
    return (
      <div style={styles.container}>
        <Header />
        <ConnectForm onConnect={connect} loading={loading} error={error} />
      </div>
    );
  }

  // Compute visible events based on scrub position
  const visibleEvents = events.slice(0, scrubIndex + 1);

  return (
    <div style={styles.container}>
      <Header
        agentId={config.agentId}
        eventCount={events.length}
        onRefresh={refresh}
        loading={loading}
      />

      {error && <div style={styles.error}>{error}</div>}

      {/* View tabs */}
      <div style={styles.tabs}>
        {(["timeline", "tree", "search"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...styles.tab,
              ...(view === v ? styles.tabActive : {}),
            }}
          >
            {v === "timeline" ? "⏱ Timeline" : v === "tree" ? "🌲 Memory Tree" : "🔍 Search"}
          </button>
        ))}
      </div>

      <div style={styles.main}>
        {/* Left panel: events */}
        <div style={styles.leftPanel}>
          {view === "timeline" && (
            <>
              {/* Scrubber */}
              {events.length > 0 && (
                <div style={styles.scrubber}>
                  <input
                    type="range"
                    min={0}
                    max={events.length - 1}
                    value={scrubIndex}
                    onChange={(e) => {
                      const idx = parseInt(e.target.value, 10);
                      setScrubIndex(idx);
                      setSelectedEvent(events[idx]!);
                    }}
                    style={styles.slider}
                  />
                  <span style={styles.scrubLabel}>
                    {scrubIndex + 1} / {events.length} events
                    {visibleEvents.length > 0 &&
                      ` — ${visibleEvents[visibleEvents.length - 1]!.timestamp.toLocaleString()}`}
                  </span>
                </div>
              )}
              <Timeline
                events={visibleEvents}
                selectedId={selectedEvent?.id ?? null}
                onSelect={setSelectedEvent}
              />
            </>
          )}
          {view === "tree" && <MemoryTree events={visibleEvents} onSelect={setSelectedEvent} />}
          {view === "search" && api && <SearchPanel api={api} onSelect={setSelectedEvent} />}
        </div>

        {/* Right panel: detail */}
        <div style={styles.rightPanel}>
          <EventDetail event={selectedEvent} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#0a0a0a",
    color: "#e0e0e0",
  },
  error: {
    padding: "8px 16px",
    background: "#3d0a0a",
    color: "#ff6b6b",
    borderBottom: "1px solid #5a1a1a",
    fontSize: "13px",
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #222",
    padding: "0 16px",
    background: "#0f0f0f",
  },
  tab: {
    padding: "10px 20px",
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "inherit",
    borderBottom: "2px solid transparent",
  },
  tabActive: {
    color: "#00ff88",
    borderBottom: "2px solid #00ff88",
  },
  main: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  leftPanel: {
    flex: 1,
    overflow: "auto",
    borderRight: "1px solid #222",
  },
  rightPanel: {
    width: "45%",
    minWidth: "400px",
    overflow: "auto",
  },
  scrubber: {
    padding: "12px 16px",
    borderBottom: "1px solid #222",
    background: "#0f0f0f",
  },
  slider: {
    width: "100%",
    accentColor: "#00ff88",
  },
  scrubLabel: {
    display: "block",
    fontSize: "11px",
    color: "#666",
    marginTop: "4px",
  },
};
