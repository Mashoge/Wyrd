import type { JSX } from "react";
import type { DiceRoll } from "../api";
import { formatRoll } from "../format";

export function RollRows({ rolls }: { rolls: DiceRoll[] }): JSX.Element | null {
  if (rolls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rolls.map((r, i) => (
        <div key={i} style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#B9AEC0" }}>
          {formatRoll(r)}
        </div>
      ))}
    </div>
  );
}

