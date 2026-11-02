import type { JSX } from "react";
import { shortCommit } from "../format";

interface Props {
  commitment: string;
}

export function Header({ commitment }: Props): JSX.Element {
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="46" height="46" viewBox="0 0 48 48" role="img" aria-label="Seal, fate sealed">
          <path d="M24 2 L43 13 L43 35 L24 46 L5 35 L5 13 Z" fill="#3A2848" stroke="#B44DFF" strokeWidth="2" />
          <text x="24" y="30" textAnchor="middle" fontSize="16" fill="#F4EFF6" className="font-rune">ᚹ</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>Fate sealed</span>
          <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: "#F4EFF6" }}>
            {shortCommit(commitment)}
          </span>
        </div>
      </div>
    </header>
  );
}

