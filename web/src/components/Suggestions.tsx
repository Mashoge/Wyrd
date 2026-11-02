import type { JSX } from "react";
interface Props {
  suggestions: string[];
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
            key={`${s}-${i}`}
            type="button"
            className="wyrd-chip"
            disabled={disabled}
            onClick={() => onPick(s)}
            style={{
              background: i === 0 ? "#B44DFF" : "#2A2133",
              color: i === 0 ? "#120E17" : "#F4EFF6",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

