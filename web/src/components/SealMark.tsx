import type { JSX } from "react";
import { motion } from "framer-motion";
import type { GameOverPhase } from "./useGameOver";

import type { Easing } from "framer-motion";
const EASE: Easing = [0.175, 0.885, 0.32, 1.275];
export function animDur(reduced: boolean | null, ms: number): number {
  return reduced === true ? 0 : ms / 1000;
}
export { EASE };

export function SealMark({ phase, reduced }: { phase: GameOverPhase; reduced: boolean | null }): JSX.Element {
  const cracked = phase === "verified" || phase === "broken";
  const pulsing = phase === "loading";
  return (
    <motion.svg
      width="72"
      height="72"
      viewBox="0 0 48 48"
      role="img"
      aria-label={phase === "verified" ? "Seal matches" : phase === "broken" ? "Seal broken" : "Fate sealed"}
      className={pulsing ? "wyrd-pending-bar" : undefined}
      initial={false}
      animate={phase === "loading" ? { opacity: [1, 0.6, 1] } : cracked ? { x: [0, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: animDur(reduced, 200), ease: EASE }}
      style={{ overflow: "visible" }}
    >
      <motion.g initial={false} animate={cracked ? { x: -3 } : { x: 0 }} transition={{ duration: animDur(reduced, 220), ease: EASE }}>
        <path d="M24 2 L24 46 L5 35 L5 13 Z" fill="#3A2848" stroke="#B44DFF" strokeWidth="2" strokeLinejoin="miter" />
      </motion.g>
      <motion.g initial={false} animate={cracked ? { x: 3 } : { x: 0 }} transition={{ duration: animDur(reduced, 220), ease: EASE }}>
        <path d="M24 2 L43 13 L43 35 L24 46 Z" fill="#3A2848" stroke="#B44DFF" strokeWidth="2" strokeLinejoin="miter" />
      </motion.g>
      {cracked && (
        <motion.path
          d="M24 3 L21 14 L26 22 L20 33 L24 45"
          fill="none"
          stroke="#F4EFF6"
          strokeWidth="1.6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: animDur(reduced, 150) }}
        />
      )}
      <text x="24" y="30" textAnchor="middle" fontSize="16" fill="#F4EFF6" className="font-rune">
        ᚹ
      </text>
    </motion.svg>
  );
}
