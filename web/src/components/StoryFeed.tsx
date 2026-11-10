import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ToolLogEntry, TurnMeta } from "../api";
import { MUTED, refusalForTurn } from "../key-moments";
import { playSound, soundsForTurn } from "../sound";
import { DiceCutIn } from "./DiceCutIn";
import { RefusedStamp } from "./RefusedStamp";
import { RollRows } from "./RollRows";

let turnSeq = 0;

/** Unique id for optimistic pending/failed replacement by id (never by index). */
export function createTurnId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  const fn = g.crypto?.randomUUID;
  if (typeof fn === "function") {
    try {
      return fn.call(g.crypto);
    } catch {
      /* fall through to counter */
    }
  }
  turnSeq += 1;
  return `turn-${Date.now()}-${turnSeq}`;
}

export interface Turn {
  id: string;
  playerText: string | null;
  narration: string;
  toolLog: ToolLogEntry[];
  meta?: TurnMeta | null;
  pending?: boolean;
  failed?: boolean;
}

interface Props {
  turns: Turn[];
  onRetry: (id: string, text: string) => void;
}

export function StoryFeed({ turns, onRetry }: Props): JSX.Element {
  const reduceMotion = useReducedMotion();
  // A click anywhere in the feed skips running cut-in animations.
  const [skipSignal, setSkipSignal] = useState(0);
  // Synced with the REFUSED stamp landing on the newest refused turn.
  const refusedTurnId = turns[turns.length - 1]?.id;
  const refusedKey = turns.some((t) => t.id === refusedTurnId && refusalForTurn(t.toolLog) !== null) ? refusedTurnId : null;
  // Sounds the cut-ins don't own: REFUSED (synced with the stamp) and trap.
  const playedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const latest = turns[turns.length - 1];
    if (latest === undefined || latest.pending || latest.failed) return;
    if (playedRef.current.has(latest.id)) return;
    playedRef.current.add(latest.id);
    const sounds = soundsForTurn(latest.toolLog);
    if (sounds.includes("trap")) playSound("trap");
    if (refusedKey === latest.id) playSound("refused");
  }, [turns, refusedKey]);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
      onClick={() => setSkipSignal((s) => s + 1)}
    >
      {turns.map((t) => {
        const latest = t.id === turns[turns.length - 1]?.id;
        const rolls = t.toolLog.flatMap((e) => e.result.rolls);
        const refusal = refusalForTurn(t.toolLog);
        return (
          <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {t.playerText !== null && (
              <div
                style={{
                  position: "relative",
                  alignSelf: "flex-end",
                  maxWidth: "78%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  className="font-story"
                  style={{ fontStyle: "italic", fontSize: 17, color: "#D9A6FF", textAlign: "right" }}
                >
                  — {t.playerText}
                </span>
                {refusal !== null && <RefusedStamp refusal={refusal} skipSignal={skipSignal} />}
              </div>
            )}
            {t.playerText === null && refusal !== null && (
              <div style={{ alignSelf: "flex-end" }}>
                <RefusedStamp refusal={refusal} skipSignal={skipSignal} />
              </div>
            )}
            {refusal !== null && (
              <p
                style={{
                  margin: 0,
                  alignSelf: "flex-end",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: MUTED,
                  textAlign: "right",
                }}
              >
                {refusal.reason}
                {refusal.count > 1 ? ` (${refusal.count} claims refused)` : ""}
              </p>
            )}
            {t.pending ? (
              <article
                className="panel-cut"
                aria-label="Waiting for the game master"
                style={{ background: "#1A1421", color: "#F4EFF6", padding: "28px 32px" }}
              >
                <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
                  <div
                    aria-hidden="true"
                    className="wyrd-pending-bar"
                    style={{
                      width: 4,
                      flexShrink: 0,
                      background: "#B44DFF",
                      clipPath: "polygon(0 4%,100% 0,100% 96%,0 100%)",
                    }}
                  />
                  <p
                    role="status"
                    className="font-story"
                    style={{ margin: 0, fontSize: 18, lineHeight: 1.7, maxWidth: "66ch", color: "#B9AEC0", fontStyle: "italic" }}
                  >
                    The game master is deciding…
                  </p>
                </div>
              </article>
            ) : (
              <>
                {latest && !t.failed ? <DiceCutIn rolls={rolls} /> : <RollRows rolls={rolls} />}
                {t.failed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span className="font-story" style={{ fontSize: 14, color: "#B9AEC0", fontStyle: "italic" }}>
                      Couldn&apos;t send —
                    </span>
                    <button
                      type="button"
                      className="wyrd-btn font-title"
                      onClick={() => {
                        if (t.playerText !== null) onRetry(t.id, t.playerText);
                      }}
                      style={{ background: "#B44DFF", color: "#120E17", fontSize: 14, padding: "8px 20px", minHeight: 44 }}
                    >
                      Try again
                    </button>
                  </div>
                ) : latest ? (
                  <motion.article
                    key={`latest-${t.id}`}
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

