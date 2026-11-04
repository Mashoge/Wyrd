import type { JSX } from "react";
import { shortCommit } from "../format";

export type BootPhase = "loading" | "sealed" | "error";

interface Props {
  phase: BootPhase;
  /** True for a fresh POST (sealing text); false for a resume GET (returning text). */
  isFresh: boolean;
  /** Real commitment from the response; null until it arrives. Never a placeholder. */
  commitment: string | null;
  showSlowHint: boolean;
  onRetry: () => void;
}

export function BootScreen({ phase, isFresh, commitment, showSlowHint, onRetry }: Props): JSX.Element {
  const loadingLine = isFresh ? "Sealing the relic and the trap…" : "Returning to the crypt…";
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 24,
        padding: "32px 16px",
      }}
    >
      <div
        className="font-title slant"
        style={{ background: "#B44DFF", color: "#120E17", fontSize: 34, lineHeight: 1, padding: "12px 34px 10px" }}
      >
        Wyrd
      </div>
      <svg
        width="120"
        height="120"
        viewBox="0 0 48 48"
        role="img"
        aria-label={phase === "sealed" ? "Seal, fate sealed" : "Seal being pressed"}
        className={phase === "sealed" ? "wyrd-seal-settled" : undefined}
      >
        <path
          d="M24 2 L43 13 L43 35 L24 46 L5 35 L5 13 Z"
          fill="#3A2848"
          stroke="#B44DFF"
          strokeWidth="2"
          className={phase === "loading" ? "wyrd-seal-ring" : undefined}
        />
        <text
          x="24"
          y="30"
          textAnchor="middle"
          fontSize="16"
          fill="#F4EFF6"
          className={`font-rune${phase === "loading" ? " wyrd-seal-rune" : ""}`}
        >
          ᚹ
        </text>
      </svg>
      {phase === "loading" && (
        <div className="font-story" style={{ fontSize: 18, color: "#B9AEC0", fontStyle: "italic" }}>
          {loadingLine}
        </div>
      )}
      {phase === "sealed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div className="font-title" style={{ fontSize: 14, color: "#B9AEC0" }}>
            Fate sealed
          </div>
          {commitment !== null && (
            <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 14, color: "#F4EFF6" }}>
              {shortCommit(commitment)}
            </div>
          )}
        </div>
      )}
      {phase === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <div className="font-story" style={{ fontSize: 18, color: "#B9AEC0", fontStyle: "italic" }}>
            Couldn&apos;t reach the crypt.
          </div>
          <button type="button" className="wyrd-btn font-title" onClick={onRetry} style={{ background: "#B44DFF", color: "#120E17", fontSize: 16 }}>
            Try again
          </button>
        </div>
      )}
      {phase === "loading" && showSlowHint && (
        <div className="font-story" style={{ fontSize: 15, color: "#B9AEC0", fontStyle: "italic" }}>
          Waking the crypt… the first game can take up to a minute.
        </div>
      )}
    </div>
  );
}
