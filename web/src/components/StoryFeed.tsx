import type { JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ToolLogEntry } from "../api";
import { RollRows } from "./RollRows";

export interface Turn {
  playerText: string | null;
  narration: string;
  toolLog: ToolLogEntry[];
}

interface Props {
  turns: Turn[];
}

export function StoryFeed({ turns }: Props): JSX.Element {
  const last = turns.length - 1;
  const reduceMotion = useReducedMotion();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {turns.map((t, i) => {
        const latest = i === last;
        const rolls = t.toolLog.flatMap((e) => e.result.rolls);
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {t.playerText !== null && (
              <div
                className="font-story"
                style={{
                  alignSelf: "flex-end", maxWidth: "70%", fontStyle: "italic",
                  fontSize: 17, color: "#D9A6FF", textAlign: "right",
                }}
              >
                — {t.playerText}
              </div>
            )}
            <RollRows rolls={rolls} />
            {latest ? (
              <motion.article
                key={`latest-${last}`}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="panel-cut"
                style={{ background: "#1A1421", color: "#F4EFF6", padding: "28px 32px" }}
              >
                <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 4,
                      flexShrink: 0,
                      background: "#B44DFF",
                      clipPath: "polygon(0 4%,100% 0,100% 96%,0 100%)",
                    }}
                  />
                  <p
                    className="font-story"
                    style={{ margin: 0, fontSize: 21, lineHeight: 1.65, maxWidth: "62ch", color: "#F4EFF6" }}
                  >
                    {t.narration}
                  </p>
                </div>
              </motion.article>
            ) : (
              <p
                className="font-story"
                style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "#B9AEC0", maxWidth: "66ch" }}
              >
                {t.narration}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

