import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import type { PlayerView, Suggestion } from "../api";
import { freeTextHint } from "./freeTextHint";

export const FREE_TEXT_EVENT = "wyrd:free-text";

interface Props {
  suggestions: Suggestion[];
  disabled: boolean;
  onPick: (text: string) => void;
  view?: PlayerView | null;
  onFreeText?: (hint: string) => void;
}

export function buildFreeTextHint(view: PlayerView | null): string {
  return freeTextHint(view);
}

export function Suggestions({ suggestions, disabled, onPick, view, onFreeText }: Props): JSX.Element | null {
  const [armedIndex, setArmedIndex] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setArmedIndex(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [suggestions]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const hint = buildFreeTextHint(view ?? null);
  const armChip = (index: number): void => {
    setArmedIndex(index);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setArmedIndex(null);
      timerRef.current = null;
    }, 3000);
  };

  const handlePick = (s: Suggestion, index: number): void => {
    if (s.usesConsumable === true) {
      if (armedIndex !== index) {
        armChip(index);
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setArmedIndex(null);
      onPick(s.text);
      return;
    }
    onPick(s.text);
  };

  const handleFreeText = (): void => {
    if (onFreeText !== undefined) {
      onFreeText(hint);
    }
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent<string>(FREE_TEXT_EVENT, { detail: hint }));
      } catch {
        // Ignore event errors; parent callback and direct focus still apply.
      }
    }
    if (typeof document !== "undefined") {
      const el = document.getElementById("wyrd-action");
      if (el !== null && typeof (el as HTMLInputElement).focus === "function") {
        (el as HTMLInputElement).focus();
      }
    }
  };

  const renderChip = (s: Suggestion, i: number): JSX.Element => {
    const isAttack = s.kind.toLowerCase() === "attack";
    const isArmed = s.usesConsumable === true && armedIndex === i;
    const confirmLabel = s.kind.toLowerCase() === "drink" ? "Click again to drink" : "Click again to use";
    return (
      <button
        key={`${s.text}-${i}`}
        type="button"
        className={isAttack ? "wyrd-chip wyrd-chip--attack" : "wyrd-chip"}
        data-kind={s.kind}
        disabled={disabled}
        onClick={() => handlePick(s, i)}
      >
        <span className="wyrd-chip-text">
          <span className="wyrd-chip-kind">
            {s.kind}
            {s.isNew === true ? (
              <span
                style={{
                  background: "#3A2848",
                  color: "#E8CCFF",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  marginLeft: 6,
                  clipPath: "polygon(8% 0,100% 0,92% 100%,0 100%)",
                }}
              >
                NEW
              </span>
            ) : null}
          </span>
          <span className="wyrd-chip-action">
            {isArmed ? confirmLabel : s.text}
            {!isArmed && s.target !== undefined ? ` · needs ${s.target}+` : ""}
          </span>
        </span>
        <span className="wyrd-chip-arrow" aria-hidden="true">
          ›
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>
        What you can do
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {suggestions.map((s, i) => renderChip(s, i))}
        <button
          type="button"
          className="wyrd-chip"
          data-kind="YOUR IDEA"
          disabled={disabled}
          onClick={handleFreeText}
        >
          <span className="wyrd-chip-text">
            <span className="wyrd-chip-kind">YOUR IDEA</span>
            <span className="wyrd-chip-action">Something else…</span>
          </span>
          <span className="wyrd-chip-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
    </div>
  );
}


