import type { JSX } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Tip } from "../guidance";

/**
 * One tip at a time: a small angled card with a violet TIP tag, pinned at
 * the bottom of the story area. Closed by its X button, or automatically
 * after the player's next action (handled by the parent).
 */
export function TipCard({ tip, onClose }: { tip: Tip | null; onClose: () => void }): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {tip !== null && (
        <motion.div
          key={tip.id}
          role="status"
          className="panel-cut"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.175, 0.885, 0.32, 1.275] }}
          style={{
            background: "#1A1421",
            border: "1px solid #5A4A68",
            borderLeft: "4px solid #B44DFF",
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span
            className="font-title slant"
            style={{ background: "#3A2848", color: "#E8CCFF", fontSize: 11, padding: "4px 12px", flexShrink: 0, marginTop: 2 }}
          >
            Tip
          </span>
          <p style={{ margin: 0, flex: 1, fontFamily: "Inter, sans-serif", fontSize: 14, lineHeight: 1.55, color: "#F4EFF6" }}>
            {tip.text}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tip"
            style={{
              background: "transparent",
              color: "#B9AEC0",
              border: "1px solid #5A4A68",
              fontFamily: "Inter, sans-serif",
              fontSize: 15,
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
