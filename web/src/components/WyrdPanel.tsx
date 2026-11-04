import type { JSX } from "react";
import type { GameStatus, PlayerViewItem } from "../api";
import { hasRelic } from "../format";

interface Props {
  inventory: PlayerViewItem[];
  status: GameStatus;
}

export function WyrdPanel({ inventory, status }: Props): JSX.Element {
  const found = hasRelic(inventory);
  const escaped = status === "won";
  return (
    <section aria-label="Goal" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="font-title" style={{ fontSize: 18 }}>Goal</div>
      <div className="font-story" style={{ fontSize: 17, lineHeight: 1.75 }}>
        <div>
          <span style={{ color: found ? "#4DE8B5" : "#5B4A66" }}>{found ? "✓" : "○"}</span>{" "}
          Find the Lost Relic
        </div>
        <div>
          <span style={{ color: escaped ? "#4DE8B5" : "#5B4A66" }}>{escaped ? "✓" : "○"}</span>{" "}
          Escape through the gate
        </div>
      </div>
    </section>
  );
}

