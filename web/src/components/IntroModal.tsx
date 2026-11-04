import type { CSSProperties, JSX } from "react";
import { useState } from "react";
import { INTRO_CARDS, markIntroSeen } from "../guidance";
import { GuidanceOverlay } from "./guidanceDialog";

/**
 * First-visit intro: 3 cards, one at a time, with Next / Back / Skip.
 * Escape = Skip (via the shared dialog). Closing remembers "seen" and
 * focus returns to the Act input.
 */
export function IntroModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [index, setIndex] = useState(0);
  const last = index >= INTRO_CARDS.length - 1;
  const card = INTRO_CARDS[index] ?? INTRO_CARDS[0];

  const finish = (): void => {
    markIntroSeen();
    setIndex(0);
    onClose();
  };

  return (
    <GuidanceOverlay open={open} labelledBy="wyrd-intro-title" onClose={finish}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="font-title" style={{ fontSize: 12, color: "#B9AEC0" }}>
              How to play · {index + 1} / {INTRO_CARDS.length}
            </div>
            <h2 id="wyrd-intro-title" className="font-title" style={{ margin: 0, fontSize: 26, color: "#F4EFF6" }}>
              {card?.title}
            </h2>
          </div>
          <button type="button" className="wyrd-btn" onClick={finish} aria-label="Skip intro" style={closeBtnStyle}>
            ✕
          </button>
        </div>

        <div key={index} className="panel-cut" style={cardStyle}>
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 16, lineHeight: 1.6, color: "#F4EFF6" }}>
            {card?.body}
          </p>
        </div>

        <div aria-hidden="true" style={{ display: "flex", gap: 8 }}>
          {INTRO_CARDS.map((c, i) => (
            <span key={c.title} style={{ height: 4, flex: 1, background: i <= index ? "#B44DFF" : "#3A2848" }} />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="wyrd-btn" onClick={finish} style={ghostBtnStyle}>
            Skip
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="wyrd-btn"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              style={index === 0 ? disabledBtnStyle : ghostBtnStyle}
            >
              Back
            </button>
            {last ? (
              <button type="button" className="wyrd-btn" onClick={finish} style={primaryBtnStyle}>
                Start playing
              </button>
            ) : (
              <button type="button" className="wyrd-btn" onClick={() => setIndex((i) => Math.min(INTRO_CARDS.length - 1, i + 1))} style={primaryBtnStyle}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </GuidanceOverlay>
  );
}

const cardStyle: CSSProperties = { background: "#120E17", border: "1px solid #5A4A68", borderLeft: "4px solid #B44DFF", padding: "18px 20px" };
const primaryBtnStyle: CSSProperties = { background: "#B44DFF", color: "#120E17", fontSize: 15 };
const ghostBtnStyle: CSSProperties = { background: "#2A2133", color: "#F4EFF6", fontSize: 15 };
const disabledBtnStyle: CSSProperties = { background: "#2A2133", color: "#B9AEC0", fontSize: 15, opacity: 0.5 };
const closeBtnStyle: CSSProperties = { background: "transparent", color: "#B9AEC0", border: "1px solid #5A4A68", fontSize: 16, padding: "0 14px" };
