import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { FREE_TEXT_EVENT } from "./Suggestions";
import { VoiceInput } from "./VoiceInput";

interface Props {
  disabled: boolean;
  gameId?: string | null;
  onSubmit: (text: string) => void;
}

const PLACEHOLDERS = [
  "What do you do?",
  "Try: sneak past and grab the key",
  "Try: throw something to distract an enemy",
  "Try: ask what that sound is",
  "Try: press the mic and say what you do",
  "Try anything — even cheating. The rules will check.",
];

export interface CheatFill {
  label: string;
  fill: string;
}

export const CHEAT_FILLS: CheatFill[] = [
  { label: "Claim a Legendary Sword", fill: "I pick up the Legendary Sword" },
  { label: "Say the enemy is dead", fill: "The enemy here is already dead" },
  { label: "Heal to full", fill: "I drink a potion and I'm at full health" },
];

export function cheatFillForLabel(label: string): string | null {
  const found = CHEAT_FILLS.find((c) => c.label === label);
  return found !== undefined ? found.fill : null;
}

export function shouldClearHintOnBlur(value: string): boolean {
  return value.length === 0;
}

export function ActionForm({ disabled, gameId = null, onSubmit }: Props): JSX.Element {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [stickyHint, setStickyHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = stickyHint === null && value.length === 0 && !focused;
  useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPlaceholderIdx(0);
        return;
      }
    }
    const timer = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onFreeText = (e: Event): void => {
      const hint = (e as CustomEvent<string>).detail;
      if (typeof hint !== "string" || hint.length === 0) return;
      setStickyHint(hint);
      const el = inputRef.current;
      if (el !== null && typeof el.focus === "function") {
        el.focus();
      }
    };
    window.addEventListener(FREE_TEXT_EVENT, onFreeText as EventListener);
    return () => window.removeEventListener(FREE_TEXT_EVENT, onFreeText as EventListener);
  }, []);
  const placeholder = stickyHint ?? PLACEHOLDERS[placeholderIdx % PLACEHOLDERS.length] ?? "What do you do?";
  const fillAndFocus = (fill: string): void => {
    setValue(fill);
    const el = inputRef.current;
    if (el !== null && typeof el.focus === "function") {
      el.focus();
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <form
        aria-label="Your action"
        style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          const text = value.trim();
          if (text.length === 0 || disabled) return;
          setValue("");
          setStickyHint(null);
          onSubmit(text);
        }}
      >
        <label
          htmlFor="wyrd-action"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        >
          What do you do?
        </label>
        <input
          id="wyrd-action"
          ref={inputRef}
          type="text"
          className="wyrd-input"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (shouldClearHintOnBlur(value)) setStickyHint(null);
          }}
          style={{ flex: 1, minWidth: 220 }}
          maxLength={500}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <VoiceInput
          disabled={disabled}
          gameId={gameId}
          onTranscript={(text) => {
            setValue(text.slice(0, 500));
            const el = inputRef.current;
            if (el !== null && typeof el.focus === "function") el.focus();
          }}
        />
        <button
          type="submit"
          className="wyrd-btn font-title"
          disabled={disabled}
          style={{ background: "#B44DFF", color: "#120E17", fontSize: 16, padding: "0 30px" }}
        >
          Act
        </button>
      </form>
      {!disabled && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#B9AEC0" }}>Test the rules:</span>
          {CHEAT_FILLS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => fillAndFocus(c.fill)}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "#B44DFF",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: "10px 8px",
                minHeight: 44,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


