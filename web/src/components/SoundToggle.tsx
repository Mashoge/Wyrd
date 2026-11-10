import type { JSX } from "react";

/** Header mute toggle: real button, aria-pressed = sound on, speaker SVG. */
export function SoundToggle({ soundOn, onToggle }: { soundOn: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={soundOn}
      aria-label={soundOn ? "Sound on — mute" : "Sound off — unmute"}
      title={soundOn ? "Mute sound" : "Unmute sound"}
      onClick={onToggle}
      style={{
        background: soundOn ? "#B44DFF" : "transparent",
        color: soundOn ? "#120E17" : "#F4EFF6",
        border: "1px solid #5A4A68",
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
        {soundOn ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
          </>
        ) : (
          <>
            <line x1="16" y1="9" x2="22" y2="15" />
            <line x1="22" y1="9" x2="16" y2="15" />
          </>
        )}
      </svg>
    </button>
  );
}
