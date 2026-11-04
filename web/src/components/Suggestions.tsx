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
        What you can do
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {suggestions.map((s, i) => {
          const isAttack = s.kind.toLowerCase() === "attack";
          return (
            <button
              key={`${s.text}-${i}`}
              type="button"
              className={isAttack ? "wyrd-chip wyrd-chip--attack" : "wyrd-chip"}
              data-kind={s.kind}
              disabled={disabled}
              onClick={() => onPick(s.text)}
            >
              <span className="wyrd-chip-text">
                <span className="wyrd-chip-kind">
                  {s.kind}
                </span>
                <span className="wyrd-chip-action">
                  {s.text}
                  {s.target !== undefined ? ` · needs ${s.target}+` : ""}
                </span>
              </span>
              <span className="wyrd-chip-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

