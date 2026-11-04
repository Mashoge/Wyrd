import { useEffect, useState } from "react";
import type { JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { DiceRoll } from "../api";
import { formatRoll } from "../format";
import { MUTED, SNAPPY_EASE, VIOLET, spinSequence, splitRolls } from "../key-moments";

/**
 * Dice cut-in for the newest turn (UI_STYLE section 5): each check roll's
 * d20 spins (~300 ms, digits cycling) then lands large in a violet slanted
 * block, with "NEEDED 9+ → HIT" beside it (mint hit / coral miss / violet
 * partial; the block stays violet, the outcome carries the meaning color).
 * Non-check rolls keep the compact text line. A click skips the spin;
 * reduced motion shows the landed number immediately. Shapes are angled;
 * text is never skewed.
 */
export function DiceCutIn({ rolls }: { rolls: DiceRoll[] }): JSX.Element | null {
  const { checks, others } = splitRolls(rolls);
  if (rolls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {checks.map((d, i) => (
        <RollCutIn key={`${d.label}-${i}`} value={d.value} sides={d.sides} label={d.label} neededText={d.neededText} toneColor={d.toneColor} />
      ))}
      {others.map((r, i) => (
        <div key={`other-${i}`} style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: MUTED }}>
          {formatRoll(r)}
        </div>
      ))}
    </div>
  );
}

function RollCutIn({
  value,
  sides,
  label,
  neededText,
  toneColor,
}: {
  value: number;
  sides: number;
  label: string;
  neededText: string;
  toneColor: string;
}): JSX.Element {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [seq] = useState<number[]>(() => spinSequence(value, sides, 6));
  const spinning = reduced !== true && frame < seq.length - 1;
  const shown = spinning ? (seq[frame] ?? value) : value;

  useEffect(() => {
    if (reduced === true) {
      setFrame(seq.length - 1);
      return;
    }
    if (frame >= seq.length - 1) return;
    const id = setTimeout(() => setFrame((f) => f + 1), 50);
    return () => clearTimeout(id);
  }, [frame, reduced, seq]);

  const skip = (): void => setFrame(seq.length - 1);

  return (
    <div
      role="button"
      aria-label={`${label}: rolled ${value}. ${neededText}`}
      onClick={skip}
      style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", cursor: spinning ? "pointer" : "default" }}
    >
      <motion.div
        aria-hidden="true"
        className="slant"
        initial={reduced === true ? { scale: 1, rotate: 0 } : { scale: spinning ? 0.9 : 1.25, rotate: 0 }}
        animate={{ scale: spinning ? 0.9 : 1, rotate: 0 }}
        transition={{ duration: reduced === true ? 0 : 0.25, ease: SNAPPY_EASE }}
        style={{
          background: VIOLET,
          color: "#120E17",
          minWidth: 76,
          padding: "8px 18px",
          textAlign: "center",
          fontFamily: "\"Cinzel\", Georgia, serif",
          fontWeight: 800,
          fontSize: 34,
          lineHeight: 1.1,
        }}
      >
        {shown}
      </motion.div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", color: MUTED, textTransform: "uppercase" }}>
          {label}
        </span>
        <span
          style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: "0.06em", color: toneColor }}
        >
          {neededText}
        </span>
      </div>
    </div>
  );
}
