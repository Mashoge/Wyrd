import { useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CORAL, SNAPPY_EASE, type RefusalDisplay } from "../key-moments";

/**
 * Coral REFUSED cut-in (UI_STYLE section 5): a big outlined Cinzel stamp
 * lands across the player line (~250 ms, scale 1.4 -> 1, rotate -8deg),
 * then settles as a smaller stamp beside the line. A click skips to the
 * settled state; prefers-reduced-motion shows the settled state at once.
 * The stamp shape is angled; the text itself is never skewed.
 */
export function RefusedStamp({
  refusal,
  skipSignal = 0,
}: {
  refusal: RefusalDisplay;
  skipSignal?: number;
}): JSX.Element {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState<boolean>(reduced === true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced === true) setSettled(true);
  }, [reduced]);

  useEffect(() => {
    if (skipSignal > 0) setSettled(true);
  }, [skipSignal]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const skip = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    setSettled(true);
  };

  if (settled) {
    return (
      <motion.span
        aria-label={refusal.count > 1 ? `Refused, ${refusal.count} claims rejected` : "Refused"}
        initial={false}
        animate={{ scale: 1, rotate: -8, opacity: 1 }}
        transition={{ duration: reduced === true ? 0 : 0.18, ease: SNAPPY_EASE }}
        style={smallStampStyle}
      >
        Refused
      </motion.span>
    );
  }

  return (
    <motion.span
      role="button"
      aria-label="Refused — click to skip"
      onClick={skip}
      initial={{ scale: 1.4, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ duration: 0.25, ease: SNAPPY_EASE }}
      onAnimationComplete={() => {
        timer.current = setTimeout(() => setSettled(true), 350);
      }}
      style={bigStampStyle}
    >
      Refused
    </motion.span>
  );
}

const stampBase: CSSProperties = {
  fontFamily: "\"Cinzel\", Georgia, serif",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: CORAL,
  border: `3px solid ${CORAL}`,
  padding: "2px 10px",
  whiteSpace: "nowrap",
  pointerEvents: "auto",
  userSelect: "none",
};

const bigStampStyle: CSSProperties = {
  ...stampBase,
  position: "absolute",
  top: "50%",
  right: 8,
  translate: "0 -50%",
  fontSize: 34,
  background: "rgba(18, 14, 23, 0.55)",
  cursor: "pointer",
  zIndex: 2,
};

const smallStampStyle: CSSProperties = {
  ...stampBase,
  position: "relative",
  display: "inline-block",
  fontSize: 13,
  borderWidth: 2,
  flexShrink: 0,
};
