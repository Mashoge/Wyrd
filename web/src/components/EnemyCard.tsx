import type { JSX } from "react";
import type { PlayerViewEnemy } from "../api";

function stampFor(enemy: PlayerViewEnemy): { text: string; color: string } {
  if (enemy.defeated) return { text: "Defeated", color: "#FF6B5B" };
  const label = enemy.condition.charAt(0).toUpperCase() + enemy.condition.slice(1);
  return { text: label, color: "#B9AEC0" };
}

export function EnemyCard({ enemy }: { enemy: PlayerViewEnemy | null }): JSX.Element {
  if (enemy === null) {
    return (
      <section aria-label="Enemy" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px" }}>
        <div className="font-title" style={{ fontSize: 18 }}>No enemy here</div>
      </section>
    );
  }
  const stamp = stampFor(enemy);
  return (
    <section aria-label="Enemy" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="font-title" style={{ fontSize: 24, color: "#F4EFF6" }}>{enemy.name}</div>
        <span className="stamp" style={{ color: stamp.color, fontSize: 12, border: `1.5px solid ${stamp.color}`, padding: "3px 10px", transform: "rotate(-4deg)" }}>
          {stamp.text}
        </span>
      </div>
      <div className="panel-cut" style={{ height: 140, background: "#241B2D", display: "flex", alignItems: "center", justifyContent: "center", color: "#9C8FA6", fontSize: 13 }}>
        [portrait]
      </div>
      <div className="font-story" style={{ fontSize: 16, color: "#B9AEC0", fontStyle: "italic" }}>
        {enemy.quirk.endsWith(".") ? enemy.quirk : `${enemy.quirk}.`}
      </div>
      {enemy.passed && !enemy.defeated && (
        <div style={{ fontSize: 13, color: "#B9AEC0", fontStyle: "italic" }}>
          You slipped past it
        </div>
      )}
    </section>
  );
}

