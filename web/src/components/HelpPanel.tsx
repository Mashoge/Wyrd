import type { CSSProperties, JSX } from "react";
import { HELP_GUIDE, INTRO_CARDS } from "../guidance";
import { GuidanceOverlay } from "./guidanceDialog";

/**
 * "How to play" panel opened from the header "?" button: the 3 intro
 * cards, plus a short guide to each part of the screen.
 * Closes with X or Escape; focus returns to the "?" button.
 */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <GuidanceOverlay open={open} labelledBy="wyrd-help-title" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 id="wyrd-help-title" className="font-title" style={{ margin: 0, fontSize: 26, color: "#F4EFF6" }}>
            How to play
          </h2>
          <button type="button" className="wyrd-btn" onClick={onClose} aria-label="Close how to play" style={closeBtnStyle}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {INTRO_CARDS.map((card) => (
            <div key={card.title} className="panel-cut" style={cardStyle}>
              <div className="font-title" style={{ fontSize: 15, color: "#E8CCFF", marginBottom: 6 }}>
                {card.title}
              </div>
              <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 15, lineHeight: 1.55, color: "#F4EFF6" }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <div>
          <div className="font-title" style={{ fontSize: 13, color: "#B9AEC0", marginBottom: 10 }}>
            The screen
          </div>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {HELP_GUIDE.map((entry) => (
              <div key={entry.title} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <dt className="font-title" style={{ fontSize: 13, color: "#F4EFF6" }}>
                  {entry.title}
                </dt>
                <dd style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 14, lineHeight: 1.5, color: "#B9AEC0" }}>
                  {entry.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </GuidanceOverlay>
  );
}

const cardStyle: CSSProperties = { background: "#120E17", border: "1px solid #5A4A68", borderLeft: "4px solid #B44DFF", padding: "14px 18px" };
const closeBtnStyle: CSSProperties = { background: "transparent", color: "#B9AEC0", border: "1px solid #5A4A68", fontSize: 16, padding: "0 14px" };
