import type { JSX } from "react";
import { useState } from "react";

interface Props {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

export function ActionForm({ disabled, onSubmit }: Props): JSX.Element {
  const [value, setValue] = useState("");
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
        placeholder="What do you do?"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
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

