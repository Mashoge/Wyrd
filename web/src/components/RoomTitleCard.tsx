import type { JSX } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SNAPPY_EASE, VIOLET } from "../key-moments";

/**
 * Room title card (UI_STYLE section 5): on a first visit the room name
 * slams in over the top of the story area in a large Cinzel angled panel
 * (~600 ms total, then fades). It never blocks input (pointer-events:
 * none; a click anywhere skips it via the parent). With reduced motion
 * there is no slam or fade — the landed card simply shows until skipped.
 */
export function RoomTitleCard({
  roomName,
  cardKey,
  onDone,
}: {
  roomName: string | null;
  cardKey: number;
  onDone: () => void;
}): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {roomName !== null && (
        <motion.div
          key={cardKey}
          role="status"
          aria-label={`Entered ${roomName}`}
          initial={
            reduced === true
              ? { opacity: 1, scale: 1, rotate: -2 }
              : { opacity: 0, scale: 1.35, rotate: -2, y: -12 }
          }
          animate={
            reduced === true
              ? { opacity: 1, scale: 1, rotate: -2, y: 0 }
              : { opacity: [0, 1, 1, 0], scale: [1.35, 1, 1, 0.97], rotate: -2, y: [-12, 0, 0, -6] }
          }
          exit={{ opacity: 0 }}
          transition={
            reduced === true
              ? { duration: 0 }
              : { duration: 0.6, times: [0, 0.3, 0.75, 1], ease: SNAPPY_EASE }
          }
          onAnimationComplete={() => {
            if (reduced !== true) onDone();
          }}
          className="panel-cut"
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            translate: "-50% 0",
            zIndex: 5,
            pointerEvents: "none",
            background: "#1A1421",
            borderLeft: `6px solid ${VIOLET}`,
            padding: "18px 34px",
            maxWidth: "88%",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "\"Inter\", sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: "#B9AEC0",
              textTransform: "uppercase",
            }}
          >
            You enter
          </div>
          <div
            className="font-title"
            style={{ fontSize: 34, lineHeight: 1.15, color: "#F4EFF6", marginTop: 4 }}
          >
            {roomName}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
