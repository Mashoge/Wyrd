import type { JSX } from "react";
import type { Suggestion } from "../api";

interface Props {
  suggestions: Suggestion[];
  disabled: boolean;
  onPick: (text: string) => void;
}

export function Suggestions({ suggestions, disabled, onPick }: Props): JSX.Element | null {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>
        Threads you could pull
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {suggestions.map((s, i) => (
          <button
            key={`${s.text}-${i}`}
            type="button"
            className="wyrd-chip"
            disabled={disabled}
            onClick={() => onPick(s.text)}
            style={{
              background: "#2A2133",
              color: "#F4EFF6",
              border: "1px solid transparent",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#B44DFF"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
          >
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, color: "#B9AEC0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {s.kind}
            </span>
            <span>
              {s.text}
              {s.target !== undefined ? ` · needs ${s.target}+` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

