import type { JSX } from "react";
import type { PlayerView } from "../api";
import { hearts, threadFraction, turnsLeft } from "../format";

function Heart({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"
        fill={filled ? "#FF6B5B" : "none"}
        stroke={filled ? "#FF6B5B" : "#5B4A66"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function YouPanel({ view }: { view: PlayerView }): JSX.Element {
  const hp = view.player.hp;
  const maxHp = view.player.maxHp;
  const left = turnsLeft(view.player);
  const frac = threadFraction(view.player);
  const total = 296;
  const violetLen = Math.max(0, Math.round(total * frac));
  return (
    <section aria-label="You" className="panel-cut" style={{ background: "#1A1421", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="font-title" style={{ fontSize: 18 }}>You</div>
        <div style={{ fontSize: 13, color: "#B9AEC0" }}>HP {hp} / {maxHp}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="img" aria-label={`${hp} of ${maxHp} health`}>
        {hearts(hp, maxHp).map((f, i) => (
          <Heart key={i} filled={f} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 13, color: "#B9AEC0" }}>Thread of fate</div>
        <div style={{ fontSize: 13, color: "#B9AEC0" }}>{left} turns left</div>
      </div>
      <svg viewBox="0 0 300 24" width="100%" height="24" role="img" aria-label={`Thread of fate, ${left} of ${view.player.maxTurns} turns left`}>
        <path
          d="M2 12 C40 6 70 18 110 12 S170 6 210 12"
          fill="none"
          stroke={violetLen > 0 ? "#B44DFF" : "#3E3247"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${violetLen} ${total}`}
        />
        {frac > 0 && frac < 1 && (
          <g stroke="#B44DFF" strokeWidth="1.5" strokeLinecap="round">
            <path d="M210 12 l10 -5" />
            <path d="M210 12 l12 2" />
            <path d="M210 12 l9 6" />
          </g>
        )}
        <path d="M224 12 C250 10 270 14 298 12" fill="none" stroke="#3E3247" strokeWidth="2" strokeDasharray="3 5" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>Satchel</div>
        {view.player.inventory.length === 0 ? (
          <div className="font-story" style={{ fontSize: 16, color: "#B9AEC0", fontStyle: "italic" }}>
            Empty pockets, full nerves.
          </div>
        ) : (
          <div className="font-story" style={{ fontSize: 17, lineHeight: 1.55 }}>
            {view.player.inventory.map((item) => (
              <div key={item.id}>{item.name}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

