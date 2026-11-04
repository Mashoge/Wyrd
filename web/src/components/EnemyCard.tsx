import { useState, type JSX } from "react";
import type { PlayerViewEnemy } from "../api";
import { hearts } from "../format";

function stampFor(enemy: PlayerViewEnemy): { text: string; color: string } {
  if (enemy.defeated) return { text: "Defeated", color: "#FF6B5B" };
  const label = enemy.condition.charAt(0).toUpperCase() + enemy.condition.slice(1);
  return { text: label, color: "#B9AEC0" };
}

function EnemyHeart({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"
        fill={filled ? "#FF6B5B" : "none"}
        stroke={filled ? "#FF6B5B" : "#5A4A68"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function EnemyCard({ enemy }: { enemy: PlayerViewEnemy | null }): JSX.Element {
  // Portraits are generated once (scripts/gen-portraits.mjs) and served from
  // /portraits/<enemy id>.webp. If one fails to load, hide its box entirely.
  // Keyed by enemy id so a different enemy gets a fresh attempt.
  const [failedPortraitId, setFailedPortraitId] = useState<string | null>(null);
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
      {failedPortraitId !== enemy.id && (
        <div className="panel-cut" style={{ height: 140, background: "#241B2D", overflow: "hidden" }}>
          <img
            src={`/portraits/${enemy.id}.webp`}
            alt={enemy.name}
            onError={() => setFailedPortraitId(enemy.id)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      <div className="font-story" style={{ fontSize: 16, color: "#B9AEC0", fontStyle: "italic" }}>
        {enemy.quirk.endsWith(".") ? enemy.quirk : `${enemy.quirk}.`}
      </div>
      {enemy.enemyHp !== undefined && enemy.enemyHp !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, color: "#B9AEC0" }}>HP {enemy.enemyHp.hp} / {enemy.enemyHp.maxHp}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="img" aria-label={`${enemy.enemyHp.hp} of ${enemy.enemyHp.maxHp} health`}>
            {hearts(enemy.enemyHp.hp, enemy.enemyHp.maxHp).map((f, i) => (
              <EnemyHeart key={i} filled={f} />
            ))}
          </div>
        </div>
      )}
      {enemy.distracted === true && !enemy.defeated && (
        <div style={{ fontSize: 13, color: "#B9AEC0", fontStyle: "italic" }}>
          Distracted
        </div>
      )}
      {enemy.passed && !enemy.defeated && (
        <div style={{ fontSize: 13, color: "#B9AEC0", fontStyle: "italic" }}>
          You slipped past it
        </div>
      )}
    </section>
  );
}

