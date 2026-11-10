import { useState, type JSX } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { PlayerViewEnemy } from "../api";
import { CORAL, SNAPPY_EASE } from "../key-moments";

/**
 * Encounter cut-in (UI_STYLE section 5): the first time the player meets an
 * enemy, a wide angled panel (#1A1421, coral edge) slams in from the right
 * over the story area for ~1.1 s — portrait left under an angled mask,
 * overflowing the panel edge, name in very large uppercase Cinzel, quirk
 * small italic below — then slides out; the normal enemy card stays.
 * pointer-events: none (never blocks input); a click anywhere skips it via
 * the parent. Reduced motion: the final (landed) state only, no motion,
 * until skipped. Shapes are angled; text is never skewed.
 */
export function EncounterCutIn({
  enemy,
  cutKey,
  onDone,
}: {
  enemy: PlayerViewEnemy | null;
  cutKey: number;
  onDone: () => void;
}): JSX.Element {
  const reduced = useReducedMotion();
  const [failedId, setFailedId] = useState<string | null>(null);
  return (
    <AnimatePresence>
      {enemy !== null && (
        <motion.div
          key={cutKey}
          role="status"
          aria-label={`Encounter: ${enemy.name}`}
          initial={reduced === true ? { opacity: 1, x: 0 } : { opacity: 0, x: "110%" }}
          animate={
            reduced === true
              ? { opacity: 1, x: 0 }
              : { opacity: [0, 1, 1, 1], x: ["110%", "0%", "0%", "110%"] }
          }
          exit={{ opacity: reduced === true ? 1 : 0, x: reduced === true ? 0 : "110%" }}
          transition={
            reduced === true
              ? { duration: 0 }
              : { duration: 1.1, times: [0, 0.22, 0.78, 1], ease: SNAPPY_EASE }
          }
          onAnimationComplete={() => {
            if (reduced !== true) onDone();
          }}
          className="panel-cut"
          style={{
            position: "absolute",
            top: 14,
            left: 12,
            right: 12,
            zIndex: 6,
            pointerEvents: "none",
            background: "#1A1421",
            borderLeft: `6px solid ${CORAL}`,
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "10px 28px 10px 10px",
            minHeight: 132,
            overflow: "visible",
          }}
        >
          {failedId !== enemy.id && (
            <div
              aria-hidden="true"
              style={{
                width: 148,
                height: 168,
                flexShrink: 0,
                margin: "-18px 0 -18px -14px",
                clipPath: "polygon(0 0, 100% 0, 86% 100%, 0 100%)",
                background: "#241B2D",
                overflow: "hidden",
              }}
            >
              <img
                src={`/portraits/${enemy.id}.webp`}
                alt=""
                onError={() => setFailedId(enemy.id)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "\"Inter\", sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.22em",
                color: CORAL,
                textTransform: "uppercase",
              }}
            >
              Encounter
            </div>
            <div className="font-title" style={{ fontSize: 42, lineHeight: 1.05, color: "#F4EFF6" }}>
              {enemy.name}
            </div>
            <div className="font-story" style={{ fontSize: 15, fontStyle: "italic", color: "#B9AEC0" }}>
              {enemy.quirk.endsWith(".") ? enemy.quirk : `${enemy.quirk}.`}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
