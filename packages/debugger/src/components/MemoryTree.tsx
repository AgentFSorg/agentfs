import { useMemo } from "react";
import type { TimelineEvent } from "../types.ts";

interface MemoryTreeProps {
  events: TimelineEvent[];
  onSelect: (event: TimelineEvent) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  event?: TimelineEvent;
}

function buildTree(events: TimelineEvent[]): TreeNode {
  const root: TreeNode = { name: "/", fullPath: "/", children: new Map() };

  // Only show latest version per path (dedup by path, keep last write)
  const byPath = new Map<string, TimelineEvent>();
  for (const event of events) {
    if (event.type === "delete") {
      byPath.delete(event.path);
    } else {
      byPath.set(event.path, event);
    }
  }

  for (const [path, event] of byPath) {
    const segments = path.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (!current.children.has(seg)) {
        const fullPath = "/" + segments.slice(0, i + 1).join("/");
        current.children.set(seg, {
          name: seg,
          fullPath,
          children: new Map(),
        });
      }
      current = current.children.get(seg)!;
    }
    current.event = event;
  }

  return root;
}

function TreeNodeView({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (event: TimelineEvent) => void;
}) {
  const hasChildren = node.children.size > 0;
  const isLeaf = node.event !== undefined;
  const sortedChildren = [...node.children.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <div>
      {depth > 0 && (
        <div
          style={{
            ...styles.node,
            paddingLeft: `${depth * 20 + 12}px`,
            cursor: isLeaf ? "pointer" : "default",
            color: isLeaf ? "#00ff88" : "#888",
          }}
          onClick={() => {
            if (node.event) onSelect(node.event);
          }}
        >
          <span style={styles.icon}>{hasChildren ? "📁" : "📄"}</span>
          <span>{node.name}</span>
          {isLeaf && <span style={styles.leafDot}>●</span>}
        </div>
      )}
      {sortedChildren.map((child) => (
        <TreeNodeView key={child.fullPath} node={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function MemoryTree({ events, onSelect }: MemoryTreeProps) {
  const tree = useMemo(() => buildTree(events), [events]);

  if (events.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No memories to display.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        🌲 Memory Tree — {events.length} entries
      </div>
      <TreeNodeView node={tree} depth={0} onSelect={onSelect} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0",
  },
  header: {
    padding: "10px 16px",
    background: "#0d0d0d",
    borderBottom: "1px solid #1a1a1a",
    fontSize: "12px",
    color: "#666",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
    color: "#666",
  },
  node: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    fontSize: "13px",
    borderBottom: "1px solid #111",
    transition: "background 0.1s",
  },
  icon: {
    fontSize: "14px",
    flexShrink: 0,
  },
  leafDot: {
    color: "#00ff88",
    fontSize: "8px",
    marginLeft: "auto",
  },
};
