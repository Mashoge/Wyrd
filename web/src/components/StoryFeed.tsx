import type { JSX } from "react";
import { motion } from "framer-motion";
import type { ToolLogEntry } from "../api";
import { RollRows } from "./RollRows";

export interface Turn {
  playerText: string;
  narration: string;
  toolLog: ToolLogEntry[];
}

interface Props {
  turns: Turn[];
}

export function StoryFeed({ turns }: Props): JSX.Element {
  const last = turns.length - 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {turns.map((t, i) => {
        const latest = i === last;
        const rolls = t.toolLog.flatMap((e) => e.result.rolls);
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              className="font-story"
              style={{
                alignSelf: "flex-end", maxWidth: "70%", fontStyle: "italic",
                fontSize: 17, color: "#D9A6FF", textAlign: "right",
              }}
            >
              — {t.playerText}
            </div>
            <RollRows rolls={rolls} />
            {latest ? (
              <motion.article
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="panel-cut"
                style={{ background: "#1A1421", color: "#F4EFF6", padding: "28px 32px" }}
              >
                <p
                  className="font-story dropcap"
                  style={{ margin: 0, fontSize: 21, lineHeight: 1.65, maxWidth: "62ch" }}
                >
                  {t.narration}
                </p>
              </motion.article>
            ) : (
              <p
                className="font-story"
                style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "#A99E8A", maxWidth: "66ch" }}
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

