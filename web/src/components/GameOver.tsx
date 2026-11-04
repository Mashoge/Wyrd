import { useEffect, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SealMark } from "./SealMark";
import { EASE, animDur } from "./SealMark";
import { useGameOver } from "./useGameOver";
import type { GameOverPhase } from "./useGameOver";
import type { RevealResponse } from "../verify";

interface GameOverProps {
  gameId: string;
  storedCommitment: string | null;
  sealMismatch: boolean;
  won: boolean;
  onVerified: () => void;
}

export function GameOver({ gameId, storedCommitment, sealMismatch, won, onVerified }: GameOverProps): JSX.Element {
  const { phase, reveal, browserHash, canonical, retry } = useGameOver(gameId, storedCommitment, sealMismatch);
  return (
    <GameOverView
      phase={phase}
      reveal={reveal}
      browserHash={browserHash}
      canonical={canonical}
      storedCommitment={storedCommitment}
      won={won}
      onRetry={retry}
      onVerified={onVerified}
    />
  );
}

export interface GameOverViewProps {
  phase: GameOverPhase;
  reveal: RevealResponse | null;
  browserHash: string | null;
  canonical: string | null;
  storedCommitment: string | null;
  won: boolean;
  onRetry: () => void;
  onVerified: () => void;
}

export function GameOverView({ phase, reveal, browserHash, canonical, storedCommitment, won, onRetry, onVerified }: GameOverViewProps): JSX.Element {
  const reduced = useReducedMotion();
  const [showProof, setShowProof] = useState(false);
  const verified = phase === "verified";
  const broken = phase === "broken";

  useEffect(() => {
    if (verified) onVerified();
  }, [verified, onVerified]);

  useEffect(() => {
    setShowProof(false);
  }, [reveal]);

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      className="panel-cut"
      style={bannerStyle(won)}
    >
      <div className="font-title" style={bannerTitle(won)}>
        {won ? "Won" : "Lost"}
      </div>
      <div className="font-story" style={bannerSub}>
        {won ? "The gate gives way. Your wyrd holds." : "The crypt keeps you. Your thread runs out."}
      </div>
      <div style={sealCol} aria-live="polite">
        <div style={sealRow}>
          <SealMark phase={phase} reduced={reduced} />
          <div style={sealText}>
            {phase === "loading" && (
              <div className="font-story" style={loadStyle}>Breaking the seal…</div>
            )}
            {phase === "error" && (
              <div style={errCol}>
                <div className="font-story" style={loadStyle}>Couldn&apos;t fetch the proof.</div>
                <div>
                  <button type="button" className="wyrd-btn font-title" onClick={onRetry} style={retryStyle}>
                    Try again
                  </button>
                </div>
              </div>
            )}
            {verified && (
              <motion.div className="font-title slant" style={fateStyle("#4DE8B5")}
                initial={reduced ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: animDur(reduced, 200), ease: EASE as unknown as [number, number, number, number] }}>
                Fate verified
              </motion.div>
            )}
            {broken && (
              <motion.div className="font-title slant" style={fateStyle("#FF6B5B")}
                initial={reduced ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: animDur(reduced, 200), ease: EASE as unknown as [number, number, number, number] }}>
                Seal broken
              </motion.div>
            )}
            {(verified || broken) && (
              <div className="font-story" style={noteStyle}>
                {verified
                  ? "The relic and the trap never moved since turn one."
                  : "The secrets do not match the seal from turn one."}
              </div>
            )}
          </div>
        </div>
        {(verified || broken) && reveal !== null && (
          <div style={factCol}>
            <div style={factStyle}>Relic was in {reveal.display.relicRoom}</div>
            <div style={factStyle}>Trap was {reveal.display.trapRoom}, {reveal.display.trapDirection}</div>
            {typeof reveal.nearMiss === "string" && reveal.nearMiss.length > 0 && (
              <div style={mutedStyle}>{reveal.nearMiss}</div>
            )}
            {typeof reveal.tip === "string" && reveal.tip.length > 0 && (
              <div style={mutedStyle}>{reveal.tip}</div>
            )}
          </div>
        )}
        {(verified || broken) && reveal !== null && browserHash !== null && canonical !== null && (
          <div>
            <button type="button" className="wyrd-btn font-title" aria-expanded={showProof}
              onClick={() => setShowProof((v) => !v)} style={proofBtnStyle}>
              {showProof ? "Hide proof" : "Show proof"}
            </button>
            {showProof && (
              <div style={proofStyle}>
                <ProofRow label="Commitment from turn one" value={storedCommitment ?? reveal.commitment} />
                <ProofRow label="Salt" value={reveal.salt} />
                <ProofRow label="Canonical string" value={canonical} />
                <ProofRow label="Hash computed by your browser" value={browserHash} />
                <div style={proofNote}>Your browser recomputed this hash itself. The server cannot change it.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ProofRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={rowStyle}>
      <span className="font-title" style={rowLabel}>{label}</span>
      <span style={rowValue}>{value}</span>
    </div>
  );
}

const bannerSub: CSSProperties = { fontSize: 17, color: "#B9AEC0", fontStyle: "italic" };
const sealCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: "100%", marginTop: 4 };
const sealRow: CSSProperties = { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" };
const sealText: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const loadStyle: CSSProperties = { fontSize: 17, fontStyle: "italic", color: "#B9AEC0" };
const errCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const noteStyle: CSSProperties = { fontSize: 16, fontStyle: "italic", color: "#B9AEC0" };
const factCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const factStyle: CSSProperties = { fontSize: 15, color: "#F4EFF6" };
const mutedStyle: CSSProperties = { fontSize: 14, color: "#B9AEC0", fontStyle: "italic", fontFamily: "Literata, Georgia, serif" };
const retryStyle: CSSProperties = { background: "#B44DFF", color: "#120E17", fontSize: 14 };
const proofBtnStyle: CSSProperties = { background: "#2A2133", color: "#F4EFF6", fontSize: 13, padding: "10px 20px", minHeight: 44 };
const proofStyle: CSSProperties = { marginTop: 8, display: "flex", flexDirection: "column", gap: 10, background: "#120E17", border: "1px solid #5A4A68", padding: 12, maxWidth: 640 };
const proofNote: CSSProperties = { fontSize: 13, color: "#B9AEC0" };
const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
const rowLabel: CSSProperties = { fontSize: 11, color: "#B9AEC0" };
const rowValue: CSSProperties = { fontSize: 13, color: "#F4EFF6", fontFamily: "ui-monospace,Menlo,monospace", overflowWrap: "anywhere", wordBreak: "break-all" };

function bannerStyle(_won: boolean): CSSProperties {
  return {
    background: "#1A1421", borderLeft: "6px solid #5A4A68",
    padding: "18px 22px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
  };
}
function bannerTitle(_won: boolean): CSSProperties {
  return { fontSize: 34, color: "#F4EFF6" };
}
function fateStyle(color: string): CSSProperties {
  return { display: "inline-block", background: color, color: "#120E17", fontSize: 26, letterSpacing: "0.08em", padding: "10px 28px", transform: "rotate(-4deg)" };
}
