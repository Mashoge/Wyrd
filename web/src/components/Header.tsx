import type { JSX } from "react";
import { shortCommit } from "../format";
import { SoundToggle } from "./SoundToggle";

interface Props {
  commitment: string;
  verified: boolean;
  inspectorOn?: boolean;
  onToggleInspector?: () => void;
  onOpenHelp?: () => void;
  soundOn?: boolean;
  onToggleSound?: () => void;
}

export function Header({ commitment, verified, inspectorOn = false, onToggleInspector, onOpenHelp, soundOn = true, onToggleSound }: Props): JSX.Element {
  return (
    <header
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        gap: 16, justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          className="font-title slant"
          style={{ background: "#B44DFF", color: "#120E17", fontSize: 34, lineHeight: 1, padding: "12px 34px 10px" }}
        >
          Wyrd
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="font-title" style={{ fontSize: 20, color: "#F4EFF6" }}>
            The Sunken Crypt
          </div>
          <div className="font-story" style={{ fontStyle: "italic", fontSize: 15, color: "#B9AEC0" }}>
            Find the Lost Relic. Escape through the gate.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {onToggleSound !== undefined && <SoundToggle soundOn={soundOn} onToggle={onToggleSound} />}
        <button
          type="button"
          aria-label="How to play"
          title="How to play"
          onClick={onOpenHelp}
          style={{
            background: "transparent",
            color: "#F4EFF6",
            border: "1px solid #5A4A68",
            borderRadius: "50%",
            fontFamily: "Inter,sans-serif",
            fontSize: 16,
            fontWeight: 600,
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ?
        </button>
        <button
          type="button"
          aria-pressed={inspectorOn}
          onClick={onToggleInspector}
          style={{
            background: inspectorOn ? "#B44DFF" : "transparent",
            color: inspectorOn ? "#120E17" : "#F4EFF6",
            border: "1px solid #5A4A68",
            fontFamily: "Inter,sans-serif",
            fontSize: 13,
            fontWeight: 600,
            minHeight: 44,
            padding: "0 18px",
            cursor: "pointer",
          }}
        >
          Inspector
        </button>
        <svg width="46" height="46" viewBox="0 0 48 48" role="img" aria-label={verified ? "Seal matches" : "Fate sealed"}>
          {verified ? (
            <g>
              <path d="M24 2 L24 46 L5 35 L5 13 Z" fill="#3A2848" stroke="#4DE8B5" strokeWidth="2" transform="translate(-2,0)" />
              <path d="M24 2 L43 13 L43 35 L24 46 Z" fill="#3A2848" stroke="#4DE8B5" strokeWidth="2" transform="translate(2,0)" />
              <path d="M24 3 L21 14 L26 22 L20 33 L24 45" fill="none" stroke="#F4EFF6" strokeWidth="1.4" />
            </g>
          ) : (
            <path d="M24 2 L43 13 L43 35 L24 46 L5 35 L5 13 Z" fill="#3A2848" stroke="#B44DFF" strokeWidth="2" />
          )}
          <text x="24" y="30" textAnchor="middle" fontSize="16" fill="#F4EFF6" className="font-rune">ᚹ</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="font-title" style={{ fontSize: 12, color: verified ? "#4DE8B5" : "#B9AEC0" }}>
            {verified ? "Seal matches" : "Fate sealed"}
          </span>
          {!verified && (
            <span style={{ fontFamily: "Inter,sans-serif", fontSize: 11, color: "#B9AEC0" }}>
              Relic &amp; trap locked
            </span>
          )}
          <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: "#F4EFF6" }}>
            {shortCommit(commitment)}
          </span>
        </div>
      </div>
    </header>
  );
}
