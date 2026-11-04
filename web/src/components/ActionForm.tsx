import type { JSX } from "react";
import { useEffect, useState } from "react";

interface Props {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

const PLACEHOLDERS = [
  "What do you do?",
  "Try: sneak past and grab the key",
  "Try: throw something to distract an enemy",
  "Try: ask what that sound is",
  "Try anything — even cheating. The rules will check.",
];

export function ActionForm({ disabled, onSubmit }: Props): JSX.Element {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const active = value.length === 0 && !focused;
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
  return (
    <form
      aria-label="Your action"
      style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (text.length === 0 || disabled) return;
        setValue("");
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
        type="text"
        className="wyrd-input"
        placeholder={PLACEHOLDERS[placeholderIdx % PLACEHOLDERS.length] ?? "What do you do?"}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 220 }}
        maxLength={500}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
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
  );
}

